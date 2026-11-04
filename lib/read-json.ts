// Read-only requests have a deadline. Never retry writes or discard their outcome.
export async function readJson<T>(url: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ response: Response; data: T }> {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  let timedOut = false;
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 12000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const data = await response.json() as T;
    return { response, data };
  } catch (error) {
    if (timedOut) throw new Error('불러오기가 지연되고 있습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    if (controller.signal.aborted) throw error;
    throw new Error('화면 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
