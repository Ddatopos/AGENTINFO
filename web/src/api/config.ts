import { get, post } from './client';

export async function getFetchProxy() {
  return get<{ proxyUrl: string }>('/config/fetch-proxy')
}

export async function setFetchProxy(proxyUrl: string) {
  return post<{ proxyUrl: string }>('/config/fetch-proxy', { proxyUrl })
}
