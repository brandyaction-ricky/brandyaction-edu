import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ShortLinkError, type ShortLinkCreate, type ShortLinkPatch, type ShortLinkRow } from './short-links';

const columns = 'key,label,channel,destination,is_active,click_count,last_clicked_at,created_at,updated_at';
const unavailable = () => new ShortLinkError('단축 링크를 처리하지 못했어요. 잠시 뒤 다시 해 주세요.', 503);
const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
const randomKey = () => Array.from({ length: 6 }, () => letters[randomInt(letters.length)]).join('');

export async function readShortLinkBody(request: Request) {
  const raw = await request.text();
  if (raw.length > 4000) throw new ShortLinkError('입력 내용이 너무 길어요.', 413);
  try { return JSON.parse(raw) as unknown; } catch { throw new ShortLinkError('입력을 확인해 주세요.'); }
}

// ponytail: newest 500 only; add paging when there are more links than that.
export async function listShortLinks(db: SupabaseClient) {
  const { data, error } = await db.from('edu_short_links').select(columns).order('created_at', { ascending: false }).limit(500);
  if (error) throw unavailable();
  return data as ShortLinkRow[];
}

/** `reuse`: the same name, channel and destination gives back the link that already exists (safe retries). */
export async function createShortLink(db: SupabaseClient, input: ShortLinkCreate, by: string, reuse = false) {
  if (reuse && !input.key) {
    const { data, error } = await db.from('edu_short_links').select(columns).eq('is_active', true)
      .eq('label', input.label).eq('channel', input.channel).eq('destination', input.destination).limit(1).maybeSingle();
    if (error) throw unavailable();
    if (data) return { row: data as ShortLinkRow, created: false };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from('edu_short_links').insert({ key: input.key || randomKey(), label: input.label,
      channel: input.channel, destination: input.destination, created_by: by, updated_by: by }).select(columns).single();
    if (!error) return { row: data as ShortLinkRow, created: true };
    if (error.code !== '23505') throw unavailable();
    if (input.key) throw new ShortLinkError('이미 쓰는 주소예요. 다른 끝부분을 적어 주세요.', 409);
  }
  throw unavailable();
}

export async function updateShortLink(db: SupabaseClient, { key, ...patch }: ShortLinkPatch, by: string) {
  const { data, error } = await db.from('edu_short_links').update({ ...patch, updated_by: by, updated_at: new Date().toISOString() })
    .eq('key', key).select(columns).maybeSingle();
  if (error) throw unavailable();
  if (!data) throw new ShortLinkError('그 단축 링크를 찾지 못했어요.', 404);
  return data as ShortLinkRow;
}
