import { get, post } from './client'
import type { SourceStatus, SourceRunResult } from './types'

export async function getSources() {
  return get<{ sources: SourceStatus[] }>('/sources')
}

export async function getSourceFetchStatus(id: string) {
  return get<{ fetchStatus: string }>(`/sources/${id}/fetch-status`)
}

export async function triggerFetch(id: string) {
  return post<SourceRunResult>(`/sources/${id}/fetch`)
}
