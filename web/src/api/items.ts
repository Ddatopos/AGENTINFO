import { get } from './client';

export async function getItemExplanation(
  id: number,
  mode: 'explain' | 'translate',
): Promise<{ text: string }> {
  return get(`/items/${id}/explain?mode=${mode}`);
}
