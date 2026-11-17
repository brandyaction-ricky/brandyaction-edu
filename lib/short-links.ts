// Short links: /go/<key> shortens any https address and keeps its address while its destination changes (so it doubles as a fixed link).
export type ShortLinkRow = {
  key: string; label: string; channel: string; destination: string; is_active: boolean;
  click_count: number; last_clicked_at: string | null; created_at: string; updated_at: string;
};
// Same field names as the MYIN short-link integration (key, url, target, label, createdAt) plus EDU extras.
export type ShortLink = {
  key: string; url: string; target: string; label: string; channel: string; active: boolean;
  clicks: number; lastClickedAt: string | null; createdAt: string; updatedAt: string;
};
export type ShortLinkCreate = { key?: string; label: string; channel: string; destination: string };
export type ShortLinkPatch = { key: string; label?: string; channel?: string; destination?: string; is_active?: boolean };

export class ShortLinkError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status = status; }
}
const fail = (message: string, status = 422): never => { throw new ShortLinkError(message, status); };

export const shortLinkKey = (value: unknown) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(value) ? value : null;

// https only, a real host name, no login part, no port, and never back into our own /go/ links.
export function shortLinkTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2000 || /[\s\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.')
    || host.startsWith('[') || /^[\d.]+$/.test(host) || url.href.length > 2000) return null;
  if (host.replace(/^www\./, '') === 'brandyaction-edu.com' && url.pathname.startsWith('/go/')) return null;
  return url.href;
}

// Name and channel are optional (empty is fine); only the destination is required.
const words = (value: unknown, max: number) => value == null ? ''
  : typeof value === 'string' && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const label = (value: unknown) => words(value, 80) ?? fail('이름을 80자 안으로 적어 주세요.');
const channel = (value: unknown) => words(value, 40) ?? fail('채널을 40자 안으로 적어 주세요.');
const target = (value: unknown) => shortLinkTarget(value) ?? fail('도착 주소는 https:// 로 시작하는 전체 주소로 적어 주세요.');
const key = (value: unknown) => shortLinkKey(typeof value === 'string' ? value.trim().toLowerCase() : value)
  ?? fail('주소 끝부분은 영어 소문자·숫자·-(빼기)로 2~40자만 쓸 수 있어요.');
const object = (body: unknown) => body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : fail('입력을 확인해 주세요.');

export function shortLinkCreateInput(body: unknown): ShortLinkCreate {
  const input = object(body);
  return { ...(input.key == null || input.key === '' ? {} : { key: key(input.key) }),
    label: label(input.label), channel: channel(input.channel), destination: target(input.target) };
}

export function shortLinkPatchInput(body: unknown): ShortLinkPatch {
  const input = object(body), patch: ShortLinkPatch = { key: key(input.key) };
  if (input.label !== undefined) patch.label = label(input.label);
  if (input.channel !== undefined) patch.channel = channel(input.channel);
  if (input.target !== undefined) patch.destination = target(input.target);
  if (input.active !== undefined) patch.is_active = typeof input.active === 'boolean' ? input.active : fail('켜기·끄기 값을 확인해 주세요.');
  if (Object.keys(patch).length === 1) fail('바꿀 내용을 적어 주세요.');
  return patch;
}

export const toShortLink = (row: ShortLinkRow, origin: string): ShortLink => ({
  key: row.key, url: `${origin}/go/${row.key}`, target: row.destination, label: row.label, channel: row.channel,
  active: row.is_active, clicks: Number(row.click_count || 0), lastClickedAt: row.last_clicked_at,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
