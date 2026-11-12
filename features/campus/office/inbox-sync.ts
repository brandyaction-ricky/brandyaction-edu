type Join = (signal: AbortSignal, ready: () => void, failed: () => void) => Promise<void>;

type InboxOptions = {
  refresh: (signal: AbortSignal) => Promise<void>;
  onError?: () => void;
  onConnected: (connected: boolean) => void;
  slow: () => boolean;
  join?: Join;
  readVersion?: (signal: AbortSignal) => Promise<number>;
};

const pollMs = 15_000;
const reconcileMs = 60_000;
const versionReadTimeoutMs = 2500;
const firstJoinWindowMs = 55_000;

// Socket retries and polling belong to the visible office session.
export function startInboxSync(options: InboxOptions) {
  let closed = false;
  let connected = false;
  let failures = 0;
  let lastReadAt = 0;
  let queued = false;
  let readRequest: AbortController | undefined;
  let connection: AbortController | undefined;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  let joinTimer: ReturnType<typeof setTimeout> | undefined;
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined;

  let stopProbing: (() => void) | undefined;
  let version = 0;

  // While joins are spread out, check only the student's small revision counter.
  // The normal poll still reconciles views if either transport fails.
  function probeWhileWaiting() {
    const readVersion = options.readVersion;
    if (!options.join || !readVersion) return;
    const deadline = Date.now() + reconcileMs;
    let active: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      if (Date.now() < deadline) timer = setTimeout(probe, 1500 + Math.random() * 1000);
    }
    async function probe() {
      if (Date.now() >= deadline) return;
      const request = new AbortController();
      active = request;
      // Retry even if a stalled transport settles long after it was aborted.
      timer = setTimeout(() => {
        active = undefined;
        request.abort();
        scheduleNext();
      }, versionReadTimeoutMs);
      try {
        const next = await readVersion!(request.signal);
        if (active === request && next > version) {
          version = next;
          invalidate();
        }
      } catch {
        // The next probe or the independent full read will retry.
      } finally {
        if (active === request) {
          clearTimeout(timer);
          active = undefined;
          scheduleNext();
        }
      }
    }
    timer = setTimeout(probe, 400 + Math.random() * 1400);
    stopProbing = () => {
      clearTimeout(timer);
      active?.abort();
      active = undefined;
    };
  }

  async function read() {
    if (closed) return;
    if (readRequest) {
      queued = true;
      return;
    }
    clearTimeout(changeTimer);
    changeTimer = undefined;
    const request = new AbortController();
    readRequest = request;
    lastReadAt = Date.now();
    try {
      await options.refresh(request.signal);
    } catch {
      if (!closed) options.onError?.();
    } finally {
      readRequest = undefined;
      if (queued && !closed) {
        queued = false;
        invalidate();
      }
    }
  }

  function invalidate() {
    if (closed) return;
    if (readRequest) queued = true;
    else if (changeTimer === undefined) changeTimer = setTimeout(() => void read(), 80);
  }

  function connect() {
    if (closed || !options.join) return;
    const attempt = new AbortController();
    connection = attempt;
    const ready = () => {
      if (attempt.signal.aborted || connected) return;
      clearTimeout(handshakeTimer);
      stopProbing?.();
      connected = true;
      failures = 0;
      options.onConnected(true);
      invalidate(); // Catch reports received while waiting to subscribe.
    };
    const failed = () => {
      if (attempt.signal.aborted) return;
      clearTimeout(handshakeTimer);
      attempt.abort();
      if (connected) probeWhileWaiting();
      connected = false;
      options.onConnected(false);
      const backoff = Math.min(60_000, 10_000 * 2 ** Math.min(failures++, 3));
      joinTimer = setTimeout(connect, backoff * (0.5 + Math.random() / 2));
    };
    handshakeTimer = setTimeout(failed, 25_000);
    void options.join(attempt.signal, ready, failed).catch(failed);
  }

  // Socket errors and retries never re-arm this clock.
  const poll = setInterval(() => {
    const slow = connected || (!options.join && options.slow());
    if (!slow || Date.now() - lastReadAt >= reconcileMs) void read();
  }, pollMs);
  void read();
  probeWhileWaiting();
  if (options.join) joinTimer = setTimeout(connect, Math.random() * firstJoinWindowMs);

  return {
    invalidate,
    close() {
      closed = true;
      stopProbing?.();
      clearInterval(poll);
      clearTimeout(changeTimer);
      clearTimeout(joinTimer);
      clearTimeout(handshakeTimer);
      connection?.abort();
      readRequest?.abort();
    },
  };
}
