/**
 * 关键词规则打分 —— LLM 未配置时的降级路径。
 * Stage 1 全靠这个跑通，保证系统在零 API 成本下依然完整可用。
 */

const STRONG = [
  'ai agent', 'agentic', 'multi-agent', 'autonomous agent', 'tool use', 'function calling',
  'mcp', 'model context protocol', 'rag', 'retrieval augmented', 'llm', 'gpt', 'claude',
  'gemini', 'qwen', 'deepseek', 'llama', 'mistral', 'fine-tun', 'inference', 'transformer',
  'openai', 'anthropic', 'huggingface', 'langchain', 'llamaindex', 'vllm', 'ollama',
  'cursor', 'opencode', 'windsurf', 'aider', 'continue.dev', 'codestral', 'copilot',
  'coding agent', 'code assistant', 'ai coding', 'developer tools', 'devtools',
  '智能体', '大模型', '多模态', '微调', '推理', '提示词', '上下文',
];

const MEDIUM = [
  'machine learning', 'deep learning', 'neural', 'embedding', 'vector database',
  'prompt', 'chatbot', 'copilot', 'benchmark', 'open source', 'open-weight',
  'developer tool', 'sdk', 'api', 'framework', 'tutorial', 'guide', 'docs',
  '人工智能', '机器学习', '开源', '教程', '文档', '工具',
];

/** 噪音特征：营销、股价、无关商业新闻 */
const NOISE = [
  'stock', 'shares', 'nasdaq', 'ipo', 'earnings call', 'lawsuit', 'crypto', 'nft',
  'discount', 'coupon', 'black friday', 'giveaway', 'webinar registration',
  '股价', '融资传闻', '优惠', '折扣', '抽奖',
];

export interface RuleScore {
  relevance: number;
  isNoise: boolean;
  tags: string[];
  category: string;
}

/**
 * 分类规则。命中数最多的分类胜出，而非"第一个命中就算"。
 *
 * 为什么不用首个命中：arXiv 的正文固定以 "arXiv:2608.18078v1 Announce Type: new
 * Abstract: ..." 开头，而 模型发布 的关键词里有 'announc'，排在 论文研究 前面，
 * 结果 267 篇论文全被打成"模型发布"。改成计票后，论文自带的
 * arxiv/paper/abstract/we propose 等多个信号能压过一个偶然的 'announc'。
 *
 * 权重：强特征给 3 分，泛化词给 1 分。'announc' 这类容易误伤的词只给 1 分。
 */
const CATEGORY_RULES: Array<[string, Array<[string, number]>]> = [
  [
    '论文研究',
    [
      ['arxiv', 3], ['abstract:', 3], ['we propose', 3], ['we present', 2], ['sota', 2],
      ['state-of-the-art', 2], ['benchmark', 2], ['paper', 2], ['论文', 3], ['研究', 1],
      ['实验表明', 2],
    ],
  ],
  [
    '模型发布',
    [
      ['release', 2], ['launch', 2], ['introducing', 3], ['now available', 3],
      ['we are releasing', 3], ['general availability', 3], ['announc', 1],
      ['发布', 2], ['上线', 2], ['开源', 1], ['正式推出', 3],
    ],
  ],
  [
    '开发工具',
    [
      ['sdk', 2], ['library', 2], ['framework', 2], ['cli', 2], ['plugin', 2],
      ['extension', 2], ['api', 1], ['开发者', 2], ['工具', 1], ['框架', 2],
    ],
  ],
  [
    '教程指南',
    [
      ['how to', 3], ['tutorial', 3], ['walkthrough', 3], ['getting started', 3],
      ['step by step', 2], ['guide', 2], ['教程', 3], ['指南', 2], ['入门', 3],
      ['documentation', 3], ['docs', 2], ['quickstart', 3], ['example', 2],
      ['cookbook', 3], ['handbook', 3], ['learn', 2], ['course', 2],
      ['文档', 3], ['快速开始', 3], ['示例', 2], ['手册', 3],
      ['introduction', 2], ['beginner', 2], ['basics', 2],
    ],
  ],
  [
    '行业动态',
    [
      ['funding', 3], ['acquisition', 3], ['partnership', 2], ['raises', 2],
      ['series a', 3], ['series b', 3], ['valuation', 2],
      ['融资', 3], ['收购', 3], ['合作', 1],
    ],
  ],
];

/**
 * 检查关键词是否作为独立单词/短语出现，避免子串误判。
 * 例如："stock" 不应匹配 "stock market impact on AI"
 */
function matchKeyword(text: string, keyword: string): boolean {
  // 中文关键词直接包含匹配（中文没有单词边界概念）
  if (/[\u4e00-\u9fa5]/.test(keyword)) {
    return text.includes(keyword);
  }
  // 英文关键词使用单词边界匹配
  const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return pattern.test(text);
}

export function ruleScore(title: string, text = ''): RuleScore {
  const hay = `${title} ${text}`.toLowerCase();

  let score = 25;
  const tags: string[] = [];

  for (const kw of STRONG) {
    if (matchKeyword(hay, kw)) {
      score += 14;
      tags.push(kw);
    }
  }
  for (const kw of MEDIUM) {
    if (matchKeyword(hay, kw)) score += 6;
  }

  // 噪音判断：必须匹配独立单词且分数低才判定为噪音
  const isNoise = NOISE.some((kw) => matchKeyword(hay, kw)) && score < 55;
  if (isNoise) score = Math.min(score, 20);

  // 分类计票。标题里的命中额外加权：标题比正文更能代表主题，
  // 正文里出现一次 "api" 不该盖过标题里的 "tutorial"。
  const lowerTitle = title.toLowerCase();

  let category = '其他';
  let best = 0;

  for (const [name, kws] of CATEGORY_RULES) {
    let votes = 0;
    for (const [kw, weight] of kws) {
      if (!hay.includes(kw)) continue;
      votes += weight;
      if (lowerTitle.includes(kw)) votes += weight;
    }
    // 严格大于：并列时保持 CATEGORY_RULES 的声明顺序（论文研究优先于模型发布）
    if (votes > best) {
      best = votes;
      category = name;
    }
  }

  // 票数过低说明只是偶然命中一个泛化词，不足以定性，归入"其他"
  if (best < 2) category = '其他';

  return {
    relevance: Math.max(0, Math.min(100, score)),
    isNoise,
    tags: [...new Set(tags)].slice(0, 6),
    category,
  };
}
