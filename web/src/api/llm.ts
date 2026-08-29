import { get } from './client';

export async function getServerLlmConfig() {
  return get<{
    baseUrl: string;
    model: string;
    hasServerKey: boolean;
  }>('/llm/config');
}

export async function healthCheckLlm(body: {
  apiKey: string;
  baseUrl: string;
  model?: string;
}) {
  const res = await fetch('/api/llm/health-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json() as Promise<{ ok: true; model?: string; reply?: string } | { ok: false; error: string }>;
}
