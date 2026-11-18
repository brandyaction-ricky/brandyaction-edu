'use client';
// Browser Back closes the top campus window instead of leaving the page (staff QA 11-17, R2).
// All open windows share one extra history entry; a refused close (draft kept) restores it.
const stack: { close: () => void }[] = [];
let entry = false, ignore = false, listening = false, pending: ReturnType<typeof setTimeout> | null = null;
function pop() {
  if (ignore) { ignore = false; return; }
  entry = false;
  stack.at(-1)?.close();
  setTimeout(() => { if (stack.length && !entry) { history.pushState(history.state, ''); entry = true; } }, 0);
}
export function holdBack(close: () => void) {
  const item = { close };
  if (!listening) { window.addEventListener('popstate', pop); listening = true; }
  stack.push(item);
  if (pending) { clearTimeout(pending); pending = null; }
  if (!entry) { history.pushState(history.state, ''); entry = true; }
  return () => {
    stack.splice(stack.indexOf(item) >>> 0, 1);
    if (stack.length) return;
    // Deferred: a window that closes while another opens in the same render keeps the one entry.
    pending = setTimeout(() => {
      pending = null;
      if (stack.length) return;
      if (entry) { entry = false; ignore = true; history.back(); }
    }, 0);
  };
}
