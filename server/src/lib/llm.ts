import OpenAI from 'openai';
import { z } from 'zod';
import { config } from '../config.js';

/**
 * LLM 客户端 —— 任意 OpenAI 兼容端点（DashScope / OpenRouter / 官方 / 自建代理）。
 * 未配置 API key 时 client 为 null，调用方走 keywords.ts 的规则降级。
 */

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!config.llm.enabled) return null;
  client ??= new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseUrl,
    timeout: config.llm.timeout,
    maxRetries: 2,
  });
  return client;
}

/** 模型必须返回这个结构。字段校验失败就当本次加工失败，不写脏数据。 */
export const EnrichSchema = z.object({
  summary_zh: z.string().min(1).max(400),
  tags: z.array(z.string()).max(8).default([]),
  category: z.string().min(1).max(20),
  relevance: z.number().int().min(0).max(100),
  is_noise: z.boolean().default(false),
});

export type EnrichPayload = z.infer<typeof EnrichSchema>;

export interface EnrichResult {
  payload: EnrichPayload;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

/** 固定分类集合，避免模型每次自由发明新类别导致侧栏分类无限膨胀。 */
export const CATEGORIES = [
  '模型发布',
  '论文研究',
  '开发工具',
  '教程指南',
  '行业动态',
  '观点评论',
  '其他',
] as const;

const SYSTEM_PROMPT = `你是 AI 领域的资讯编辑，负责给技术情报打标签。

判断标准 —— relevance（0-100）衡量它对"关注 AI/LLM/智能体的开发者"的价值：
- 80-100：模型/框架的重大发布、有实质结论的研究、能直接上手的工具
- 50-79：值得一读的技术文章、教程、行业重要动态
- 20-49：泛泛而谈的报道、边缘相关内容
- 0-19：与 AI 技术无关，或纯营销、股价、抽奖等噪音（同时把 is_noise 置为 true）

category 必须从这个列表里选一个：${CATEGORIES.join('、')}

summary_zh：用中文写 1-2 句话，说清"做了什么、为什么值得关注"。
不要复述标题，不要写"这篇文章介绍了"这类空话，直接给信息。
原文是英文也要输出中文摘要。

tags：3-6 个技术关键词，用小写英文（如 llm、rag、mcp、fine-tuning），中文概念可用中文。

只输出 JSON，不要 markdown 代码块，不要任何解释。`;

function userPrompt(title: string, text: string, sourceName: string): string {
  const body = text.trim().slice(0, 2000);
  return `来源：${sourceName}
标题：${title}
${body ? `正文摘录：${body}` : '（无正文，仅凭标题判断）'}

按 JSON 输出：{"summary_zh":"...","tags":["..."],"category":"...","relevance":0,"is_noise":false}`;
}

/** 模型有时会裹一层 ```json 代码块，剥掉再解析。
 *  StepFun 推理模式会把 JSON 写在 reasoning_content 里，夹杂推理文本，
 *  需要从第一个 { 到最后一个 } 截取。 */
function parseJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return JSON.parse(text.slice(first, last + 1));
  }
  return JSON.parse(text);
}

/**
 * 调用 LLM 加工单条。抛错代表本次失败，由 enrich.ts 记 failed 并跳过，
 * 下一轮会重试 —— 不阻塞整批。
 */
export async function enrichWithLlm(
  title: string,
  text: string,
  sourceName: string,
): Promise<EnrichResult> {
  const api = getClient();
  if (!api) throw new Error('LLM 未配置');

  const res = await api.chat.completions.create({
    model: config.llm.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(title, text, sourceName) },
    ],
    temperature: 0.2,
    max_tokens: 600,
  });

  const content = res.choices[0]?.message?.content;
  const reasoning = (res.choices[0]?.message as { reasoning_content?: string } | undefined)?.reasoning_content;

  // 优先使用 content（最终输出），某些推理模型会把推理过程放在 reasoning_content
  const raw = content?.trim() || reasoning?.trim();
  if (!raw) {
    console.error('[llm] 空内容，完整响应:', JSON.stringify(res.choices[0]?.message, null, 2));
    throw new Error('模型返回空内容');
  }

  const parsed = EnrichSchema.parse(parseJson(raw));

  // 模型可能返回列表外的分类，兜到"其他"，保证侧栏分类可枚举
  if (!CATEGORIES.includes(parsed.category as (typeof CATEGORIES)[number])) {
    parsed.category = '其他';
  }

  return {
    payload: parsed,
    tokensIn: res.usage?.prompt_tokens ?? 0,
    tokensOut: res.usage?.completion_tokens ?? 0,
    model: config.llm.model,
  };
}
