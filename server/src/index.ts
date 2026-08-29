import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { db } from './db/index.js';
import { syncSources } from './pipeline/fetch.js';
import { startScheduler } from './scheduler.js';
import { itemsRouter } from './routes/items.js';
import { sourcesRouter, statsRouter } from './routes/sources.js';
import { briefingsRouter } from './routes/briefings.js';
import { chatRouter } from './routes/chat.js';
import { llmRouter } from './routes/llm.js';
import { configRouter } from './routes/config.js';

const app = express();

app.set('etag', false);
app.disable('x-powered-by');

app.use(cors());
app.use(express.json());

// 探活：顺带确认 SQLite 真的可读
app.get('/api/health', (_req, res) => {
  try {
    db().prepare('SELECT 1').get();
    res.json({ ok: true, ts: Date.now() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.use('/api/items', itemsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/briefings', briefingsRouter);
app.use('/api/llm', llmRouter);
app.use('/api/chat', chatRouter);
app.use('/api/config', configRouter);

// 404 兜底
app.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 全局错误处理
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[server] 未捕获错误:', message);
  // 生产环境隐藏详细错误信息，避免泄露敏感信息
  if (config.isProduction) {
    res.status(500).json({ error: '服务器内部错误' });
  } else {
    res.status(500).json({ error: '服务器内部错误', detail: message });
  }
});

db();
syncSources();

const server = app.listen(config.port, () => {
  console.log(`[server] 已启动 http://localhost:${config.port}`);
  console.log(`[server] LLM 加工: ${config.llm.enabled ? `启用（${config.llm.model}）` : '未配置，走关键词规则降级'}`);
  if (config.fetch.proxyUrl) console.log(`[server] 抓取代理: ${config.fetch.proxyUrl}`);
});

// NO_CRON=1 时只起 API 不起调度，便于本地调试前端时不产生后台抓取
const stopScheduler = process.env.NO_CRON === '1' ? null : startScheduler();

/** 优雅关停：先停调度，再等在途请求结束，避免 SQLite 写到一半被切断。 */
function shutdown(signal: string): void {
  console.log(`[server] 收到 ${signal}，正在关停…`);
  stopScheduler?.();
  server.close(() => process.exit(0));
  // 兜底：10 秒内没关完就强退
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
