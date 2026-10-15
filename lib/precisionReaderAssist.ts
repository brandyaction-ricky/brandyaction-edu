/** Reader-only help for the issued precision report (MYIN and EDU keep the same file, 2026-10-15).
 *  Nothing here changes an issued file, its hash or how a report is generated: the CSS joins the reader/print wrapper,
 *  and the resume chip is added to the open reader's DOM only. */

// Layout fixes for reports already issued, on screen and on paper.
// 20장 '비슷해 보여도 목표가 다른 두 결' (CEO 10-15): since 10-04 the two facets are drawn without the middle slider, but
// the grid kept three columns (1fr 1.3fr 1fr), so the second facet fell into the wide middle column, lower and
// right-aligned. Two equal, top-aligned columns, both read left to right.
export const READER_LAYOUT_CSS = '.spec-body:not(:has(.slider)){grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:24px}'
  + '.spec-body:not(:has(.slider)) .pole.right{text-align:left;border-left:1px solid var(--line,#e1dbd0);padding-left:22px}'
  + '.spec-body:not(:has(.slider)) .pole.right li:before{content:"·";color:var(--fill);margin-right:6px}'
  + '.spec-body:not(:has(.slider)) .pole.right li:after{content:none}'
  + '@media(max-width:700px){.spec-body:not(:has(.slider)){grid-template-columns:1fr}.spec-body:not(:has(.slider)) .pole.right{border-left:0;padding-left:0;border-top:1px solid var(--line,#e1dbd0);padding-top:16px}}';

const CHIP_ID = 'myin-resume';
const CHIP_CSS = `#${CHIP_ID}{position:fixed;left:50%;bottom:18px;z-index:300;transform:translateX(-50%);display:flex;align-items:center;gap:10px;max-width:calc(100% - 32px);padding:10px 12px 10px 16px;border-radius:999px;background:#0d1531;color:#fff;font:600 13px/1.4 inherit;box-shadow:0 10px 30px rgba(13,21,49,.28);animation:myin-resume-out .4s ease 14s forwards}`
  + `#${CHIP_ID} span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${CHIP_ID} a{flex:none;padding:6px 12px;border-radius:999px;background:#fff;color:#0d1531;text-decoration:none;font-weight:700}`
  + `@keyframes myin-resume-out{to{opacity:0;visibility:hidden;pointer-events:none}}@media print{#${CHIP_ID}{display:none!important}}`;
const NEXT_CSS = '.myin-next{display:flex;justify-content:flex-end;margin:28px 0 0}.myin-next a{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:10px 16px;border:1px solid var(--line,#dfe4f4);border-radius:999px;background:#fff;color:#0d1531;font-size:14px;font-weight:700;text-decoration:none}.myin-next a b{color:var(--blue,#2735c8);font-variant-numeric:tabular-nums}@media print{.myin-next{display:none!important}}';
const SECTION = /^s\d{1,2}$/;
const keyOf = (doc: Document) => {
  const id = doc.querySelector('meta[name="report-id"]')?.getAttribute('content') || doc.querySelector('meta[name="response-id"]')?.getAttribute('content');
  return id && /^[\w-]{8,64}$/.test(id) ? `myin_reader_last:${id}` : null;
};

/** Remembers the chapter being read (this browser only, chapter id only) and offers to continue there next time.
 *  Returns a cleanup. The link is a native srcdoc fragment, so it also works where the frame runs no listeners. */
export function attachReaderAssist(doc: Document): () => void {
  const undo: Array<() => void> = [];
  const cleanup = () => { while (undo.length) undo.pop()!(); };
  try {
    const key = keyOf(doc), win = doc.defaultView;
    if (!win) return cleanup;
    let saved: string | null = null;
    if (key) try { saved = window.localStorage.getItem(key); } catch { /* storage off */ }
    const target = saved && SECTION.test(saved) && !['s0', 's1'].includes(saved) ? doc.getElementById(saved) : null;
    if (target && !doc.getElementById(CHIP_ID)) {
      const style = Object.assign(doc.createElement('style'), { textContent: CHIP_CSS });
      const chip = Object.assign(doc.createElement('div'), { id: CHIP_ID });
      chip.setAttribute('role', 'status');
      const title = target.querySelector('h2')?.textContent?.trim() || '';
      const no = target.querySelector('.sec-no')?.textContent?.trim();
      const label = Object.assign(doc.createElement('span'), { textContent: `지난번 읽던 곳 · ${no ? no + ' ' : ''}${title}` });
      const go = Object.assign(doc.createElement('a'), { href: `about:srcdoc#${saved}`, textContent: '이어 읽기' });
      go.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        win.scrollTo({ top: target.getBoundingClientRect().top + win.scrollY - (parseFloat(win.getComputedStyle(target).scrollMarginTop) || 0) });
        chip.remove();
      });
      chip.append(label, go);
      doc.head.append(style); doc.body.append(chip);
      undo.push(() => { chip.remove(); style.remove(); });
    }
    // Each chapter ends with a link to the next one in reading order (21 chapters; phones have no side contents).
    const sections = Array.from(doc.querySelectorAll<HTMLElement>('section.section[id]')).filter(el => SECTION.test(el.id));
    if (sections.length > 1 && !doc.querySelector('.myin-next')) {
      const style = Object.assign(doc.createElement('style'), { textContent: NEXT_CSS });
      doc.head.append(style); undo.push(() => style.remove());
      sections.slice(0, -1).forEach((section, i) => {
        const next = sections[i + 1], title = next.querySelector('h2')?.textContent?.trim();
        if (!title) return;
        const box = Object.assign(doc.createElement('div'), { className: 'myin-next' });
        const link = Object.assign(doc.createElement('a'), { href: `about:srcdoc#${next.id}` });
        const no = next.querySelector('.sec-no')?.textContent?.trim();
        link.append('다음 장 ', ...(no ? [Object.assign(doc.createElement('b'), { textContent: no })] : []), ` ${title} →`);
        link.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          win.scrollTo({ top: next.getBoundingClientRect().top + win.scrollY - (parseFloat(win.getComputedStyle(next).scrollMarginTop) || 0) });
        });
        box.append(link); section.append(box); undo.push(() => box.remove());
      });
    }
    // The chapter whose title last crossed the upper third of the reader is the one being read.
    if (!key || typeof IntersectionObserver === 'undefined') return cleanup;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        const id = e.target.parentElement?.id;
        if (id && SECTION.test(id)) try { window.localStorage.setItem(key, id); } catch { /* storage off */ }
      }
    }, { rootMargin: '0px 0px -66% 0px' });
    doc.querySelectorAll('section[id] > h2').forEach(h => io.observe(h));
    undo.push(() => io.disconnect());
  } catch { cleanup(); }
  return cleanup;
}
