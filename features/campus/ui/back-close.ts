'use client';
// Browser Back closes the top campus window instead of leaving the page (staff QA 11-17, R2).
// All open windows share one extra history entry; a refused close (draft kept) restores it.
const stack: { close: () => void }[] = [];
let entry = false, listening = false, pushedLength = 0, pending: ReturnType<typeof setTimeout> | null = null;
let carry: { state: unknown; url: string } | null = null;
function pop() {
  // Our own step back: keep any address change made while the window was open (room, section).
  if (carry) { history.replaceState(carry.state, '', carry.url); carry = null; return; }
  entry = false;
  stack.at(-1)?.close();
  setTimeout(() => { if (stack.length && !entry) push(); }, 0);
}
function push() { history.pushState(history.state, ''); entry = true; pushedLength = history.length; }
export function holdBack(close: () => void, layer: 'window' | 'room' = 'window') {
  const item = { close };
  if (!listening) { window.addEventListener('popstate', pop); listening = true; }
  if (layer === 'room') stack.unshift(item);
  else stack.push(item);
  if (pending) { clearTimeout(pending); pending = null; }
  if (!entry) push();
  return () => {
    stack.splice(stack.indexOf(item) >>> 0, 1);
    if (stack.length) return;
    // Deferred: a window that closes while another opens in the same render keeps the one entry.
    pending = setTimeout(() => {
      pending = null;
      if (stack.length) return;
      if (!entry) return;
      entry = false;
      // Something else pushed an address after ours (a section change): leave our entry as a harmless extra step.
      if (history.length !== pushedLength) return;
      carry = { state: history.state, url: location.href }; history.back();
    }, 0);
  };
}
