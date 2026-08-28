import { Router } from 'express';
import OpenAI from 'openai';
import { db } from '../db/index.js';
import { config } from '../config.js';

export const chatRouter = Router();

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!config.llm.enabled) return null;
  openaiClient ??= new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseUrl,
    timeout: config.llm.timeout,
    maxRetries: 2,
  });
  return openaiClient;
}

const SYSTEM_PROMPT = `你是 AI 领域的智能助手，专门帮助用户了解 AI/LLM/智能体相关的技术资讯。

你的职责：
- 解答用户关于 AI 技术的问题
- 解释技术概念和术语
- 分析行业趋势和动态
- 推荐相关的学习资源

回答要求：
- 使用中文回答
- 简洁明了，避免冗长
- 减少使用markdown格式符号，使用自然的文本格式
- 用数字序号或简单换行组织内容，而非大量markdown标记
- 代码示例使用代码块，但正文避免过度格式化
- 如果涉及代码，使用 TypeScript/Python 示例`;

interface MessageRow {
  id: number;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
}

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
}

chatRouter.get('/conversations', (_req, res) => {
  const rows = db()
    .prepare(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       ORDER BY updated_at DESC
       LIMIT 50`,
    )
    .all() as ConversationRow[];

  res.json({ conversations: rows });
});

chatRouter.get('/conversations/:id', (req, res) => {
  const convId = req.params.id;

  const conv = db()
    .prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE id = @id')
    .get({ id: convId }) as ConversationRow | undefined;

  if (!conv) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  const messages = db()
    .prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE conversation_id = @convId
       ORDER BY created_at ASC`,
    )
    .all({ convId }) as MessageRow[];

  res.json({ conversation: conv, messages });
});

chatRouter.post('/conversations', (req, res) => {
  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const now = Date.now();
  const title = (req.body.title as string | undefined) || '新对话';

  db()
    .prepare(
      `INSERT INTO conversations (id, title, created_at, updated_at)
       VALUES (@id, @title, @createdAt, @updatedAt)`,
    )
    .run({ id, title, createdAt: now, updatedAt: now });

  res.json({ id, title, createdAt: now, updatedAt: now });
});

chatRouter.post('/conversations/:id/messages', async (req, res) => {
  const convId = req.params.id;
  const content = req.body.content as string | undefined;

  if (!content || !content.trim()) {
    res.status(400).json({ error: '消息内容不能为空' });
    return;
  }

  const api = getOpenAIClient();
  if (!api) {
    res.status(503).json({ error: 'LLM 服务未配置' });
    return;
  }

  const conv = db()
    .prepare('SELECT id FROM conversations WHERE id = @id')
    .get({ id: convId });

  if (!conv) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO messages (conversation_id, role, content, created_at)
       VALUES (@convId, 'user', @content, @createdAt)`,
    )
    .run({ convId, content, createdAt: now });

  const history = db()
    .prepare(
      `SELECT role, content FROM messages WHERE conversation_id = @convId ORDER BY created_at ASC`,
    )
    .all({ convId }) as { role: string; content: string }[];

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await api.chat.completions.create({
      model: config.llm.model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }

    const assistantMsgTime = Date.now();
    db()
      .prepare(
        `INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES (@convId, 'assistant', @content, @createdAt)`,
      )
      .run({ convId, content: fullContent, createdAt: assistantMsgTime });

    db()
      .prepare(`UPDATE conversations SET updated_at = @updatedAt WHERE id = @id`)
      .run({ id: convId, updatedAt: assistantMsgTime });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[chat] 流式响应错误:', err instanceof Error ? err.message : String(err));
    res.write(`data: ${JSON.stringify({ error: '生成回复失败' })}\n\n`);
    res.end();
  }
});

chatRouter.delete('/conversations/:id', (req, res) => {
  const convId = req.params.id;

  const result = db()
    .prepare('DELETE FROM conversations WHERE id = @id')
    .run({ id: convId });

  if (result.changes === 0) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  res.json({ ok: true });
});
