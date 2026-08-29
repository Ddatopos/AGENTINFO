import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';

export const configRouter = Router();

const PROXY_KEY = 'fetch_proxy_url';

configRouter.get('/fetch-proxy', (_req, res) => {
  const row = db()
    .prepare(`SELECT value FROM local_config WHERE key = ?`)
    .get(PROXY_KEY) as { value: string } | undefined;

  const proxyUrl = row?.value ?? config.fetch.proxyUrl ?? '';
  res.json({ proxyUrl });
});

configRouter.post('/fetch-proxy', (req, res) => {
  const { proxyUrl } = req.body as { proxyUrl?: string };

  if (typeof proxyUrl !== 'string') {
    res.status(400).json({ error: 'proxyUrl 必须为字符串' });
    return;
  }

  const trimmed = proxyUrl.trim();

  if (trimmed) {
    db()
      .prepare(
        `INSERT INTO local_config (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(PROXY_KEY, trimmed, Date.now());
  } else {
    db()
      .prepare(`DELETE FROM local_config WHERE key = ?`)
      .run(PROXY_KEY);
  }

  res.json({ proxyUrl: trimmed });
});
