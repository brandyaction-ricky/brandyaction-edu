export type LivePhase = 'first' | 'encore';
export const liveLabel = (phase: LivePhase) => phase === 'first' ? '첫 웨비나' : '앵콜 라이브';
export function livePhase(value: unknown): LivePhase {
  if (value !== 'first' && value !== 'encore') throw new Error('라이브 구분을 확인해 주세요.');
  return value;
}
export function youtubeLiveUrl(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) throw new Error('YouTube 주소를 확인해 주세요.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('HTTPS YouTube 주소를 사용해 주세요.');
  let id: string | null = null;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (url.pathname.startsWith('/live/')) id = url.pathname.slice(6);
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('YouTube 영상의 개별 주소를 입력해 주세요.');
  return `https://www.youtube.com/watch?v=${id}`;
}
export type LiveSession = { phase: LivePhase; url: string | null; open: boolean; revision: number; checked?: boolean; checkedAt?: string | null; count?: number };
export type AttendanceReport = { sessions: LiveSession[]; unique?: number; both?: number };
