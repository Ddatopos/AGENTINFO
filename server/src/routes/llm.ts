import { Router } from 'express';
import OpenAI from 'openai';

export const llmRouter = Router();

llmRouter.get('/config', (_req, res) => {
  res.json({
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    hasServerKey: !!process.env.LLM_API_KEY,
  });
});

llmRouter.post('/health-check', async (req, res) => {
  const { apiKey, baseUrl, model } = req.body as {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };

  const key = apiKey?.trim();
  const url = baseUrl?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const mdl = model?.trim() || 'qwen-plus';

  if (!key) {
    res.status(400).json({ ok: false as const, error: '缺少 API Key' });
    return;
  }

  let client: OpenAI;
  try {
    client = new OpenAI({ apiKey: key, baseURL: url, timeout: 15_000, maxRetries: 0 });
  } catch (err) {
    res.status(400).json({ ok: false as const, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  try {
    const result = await client.chat.completions.create({
      model: mdl,
      messages: [{ role: 'user', content: 'Say "ok" only.' }],
      max_tokens: 5,
      temperature: 0,
    });

    const reply = result.choices[0]?.message?.content?.trim() || '';
    res.json({ ok: true as const, model: result.model, reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ ok: false as const, error: message });
  }
});
