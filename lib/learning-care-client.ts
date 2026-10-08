import type { CareSnapshot } from './learning-care';

// Only in this browser's memory: never localStorage, a service worker or a
// shared server cache. Every network read and send remains server-authorized.
export function createCareReads(fetcher: typeof fetch = fetch, now = Date.now) {
  type Entry = { expiresAt: number; controller: AbortController; promise: Promise<CareSnapshot> };
  const entries = new Map<string, Entry>();
  let actor = '';
  function clear() {
    for (const entry of entries.values()) entry.controller.abort();
    entries.clear();
    actor = '';
  }
  function read(actorId: string, url: string, force = false) {
    if (!actorId) return Promise.reject(new Error('운영자 정보를 다시 확인해 주세요.'));
    if (actor !== actorId) { clear(); actor = actorId; }
    const cached = entries.get(url);
    if (!force && cached && (!cached.expiresAt || cached.expiresAt > now())) return cached.promise;
    cached?.controller.abort();
    const controller = new AbortController();
    const entry: Entry = { expiresAt: 0, controller, promise: Promise.resolve(null as unknown as CareSnapshot) };
    entry.promise = (async () => {
      try {
        const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const data = await response.json();
        if (!response.ok) {
          if ([401, 403].includes(response.status) && entries.get(url) === entry) clear();
          throw new Error(data.error || '현황을 불러오지 못했습니다. 다시 시도해 주세요.');
        }
        // A cookie/account change while a request was in flight cannot label
        // another operator's response as this operator's cached data.
        if (data.actorId !== actorId) throw new Error('로그인 계정이 변경되었습니다. 화면을 새로고침해 주세요.');
        if (controller.signal.aborted) throw new Error('조회가 취소되었습니다.');
        if (entries.get(url) === entry) entry.expiresAt = now() + 30000;
        return data as CareSnapshot;
      } catch (error) {
        if (entries.get(url) === entry) entries.delete(url);
        throw error;
      }
    })();
    entries.set(url, entry);
    // Limit retained cohort snapshots, including pending speculative reads.
    while (entries.size > 4) {
      const oldest = entries.keys().next().value!;
      entries.get(oldest)?.controller.abort(); entries.delete(oldest);
    }
    return entry.promise;
  }
  return { read, clear };
}

const careReads = createCareReads();
export const readAdminCare = careReads.read;
export const clearAdminCare = careReads.clear;
export function prefetchAdminCare(actorId: string) {
  void readAdminCare(actorId, '/api/admin/learning-care').catch(() => {});
}
