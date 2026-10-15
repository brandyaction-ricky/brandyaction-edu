/** Optional presentation on the online reader DOM only. Never pass the issued HTML through this module.
 * All words, scores, lengths and positions remain in the static report. A failed/unknown adapter simply skips motion.
 * CSS animations start fully readable, run once, pause outside both viewports, and disappear on paper. */
const STYLE_ID = 'myin-precision-motion';
const ITEM = 'data-myin-motion';
const STATE = 'data-myin-motion-state';
const PLAY = 'data-myin-motion-play';
const DURATION = 900;
const SHEEN = 1100;
// Motion vocabulary (quality pass 2026-10-15): a card lifts with a ring and a soft shadow in its need colour, a
// step number pops, a bar glows once along its length, an SVG line glows. (Bars keep the report's !important
// background, so the glow is a filter, never a background change.) Nothing is hidden, moved in layout, counted
// up or resized: 0%/100% equal the issued look, and what is not keyed falls back to the element's own value.
const CSS = `
@media screen and (prefers-reduced-motion:no-preference){
 [${PLAY}]{animation:myin-report-focus ${DURATION}ms cubic-bezier(.2,.7,.2,1) var(--myin-delay,0ms) 1 both paused}
 [${PLAY}=playing]{animation-play-state:running}
 [${PLAY}][${ITEM}=ink]{animation-name:myin-report-ink}
 [${PLAY}][${ITEM}=sheen]{animation-name:myin-report-sheen;animation-duration:${SHEEN}ms;animation-timing-function:ease-in-out}
 [${PLAY}=playing][${ITEM}=focus] :is(.v-step-no,.v-money-no){animation:myin-report-pop 620ms cubic-bezier(.3,1.6,.5,1) var(--myin-delay,0ms) 1 both}
 [${PLAY}][${ITEM}=orbit]{animation-name:myin-report-orbit;animation-duration:4200ms;animation-timing-function:linear;pointer-events:none;transform-box:view-box;transform-origin:0 0}
 @keyframes myin-report-focus{
  0%,100%{outline:2px solid transparent;outline-offset:3px}
  38%,62%{outline:2px solid var(--need-color,var(--blue,#2735c8));outline-offset:3px;transform:translateY(-3px);box-shadow:0 18px 32px -22px var(--need-color,var(--blue,#2735c8))}
 }
 @keyframes myin-report-pop{
  45%{transform:scale(1.22)}
 }
 @keyframes myin-report-sheen{
  0%,100%{filter:brightness(1)}
  40%,60%{filter:brightness(1.22) saturate(1.15) drop-shadow(0 0 5px var(--need-color,var(--blue,#2735c8)))}
 }
 @keyframes myin-report-ink{
  0%,100%{filter:brightness(1)}
  35%,65%{filter:brightness(1.18) drop-shadow(0 0 3px var(--need-color,var(--blue,#2735c8)))}
 }
 @keyframes myin-report-orbit{
  0%{opacity:0;transform:translate(var(--myin-x0),var(--myin-y0))}
  6%{opacity:1}
  30%{transform:translate(var(--myin-x1),var(--myin-y1))}
  60%{transform:translate(var(--myin-x2),var(--myin-y2))}
  90%,100%{transform:translate(var(--myin-x0),var(--myin-y0))}
  94%,100%{opacity:0}
 }
}
@media print,(prefers-reduced-motion:reduce){
 [${ITEM}],[${ITEM}] *{animation:none!important}
 [${ITEM}=orbit]{display:none!important}
}`;

type Kind = 'focus' | 'ink' | 'sheen';
type Group = { root: Element; items: Element[]; pending: Set<Element>; started: boolean; visible: boolean; done: boolean };
type Undo = () => void;
const noop = () => {};

/** Called by the parent page after srcDoc loads; CSP script-src 'none' and the existing iframe sandbox stay intact. */
export function enhancePrecisionDiagrams(doc: Document): Undo {
  try { return attachMotion(doc); } catch { return noop; }
}

function attachMotion(doc: Document): Undo {
  const win = doc.defaultView;
  // Use the parent observer: an implicit root clips the child frame AND its position in the outer page.
  if (!win || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined'
    || !window.matchMedia || !doc.querySelector('style[data-visual-redesign="v1"]') || doc.getElementById(STYLE_ID)) return noop;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const print = window.matchMedia('print');
  if (motion.matches || print.matches) return noop;

  const undo: Undo[] = [], groups: Group[] = [], roots = new Map<Element, Group>(), used = new Set<Element>();
  const styles = new Map<HTMLElement | SVGElement, { raw: string | null; css: string }>();
  let disposed = false, printing = false, observer: IntersectionObserver | undefined;
  const attr = (el: Element, key: string, value: string) => {
    const old = el.getAttribute(key);
    el.setAttribute(key, value);
    undo.push(() => { if (old === null) el.removeAttribute(key); else el.setAttribute(key, old); });
  };
  const variable = (el: HTMLElement | SVGElement, key: string, value: string) => {
    if (!styles.has(el)) styles.set(el, { raw: el.getAttribute('style'), css: el.style.cssText });
    const old = el.style.getPropertyValue(key), priority = el.style.getPropertyPriority(key);
    el.style.setProperty(key, value);
    undo.push(() => {
      if (old) el.style.setProperty(key, old, priority); else el.style.removeProperty(key);
    });
  };
  const finish = (group: Group) => {
    group.done = true;
    group.root.removeAttribute(STATE);
    group.items.forEach(el => el.removeAttribute(PLAY));
    observer?.unobserve(group.root);
  };
  const sync = (group: Group) => {
    if (group.done) return;
    const play = group.visible && !doc.hidden && !window.document.hidden && !printing;
    if (play) group.started = true;
    const state = play ? 'playing' : group.started ? 'paused' : 'ready';
    group.root.setAttribute(STATE, state);
    group.items.forEach(el => el.setAttribute(PLAY, state));
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    for (const restore of undo.reverse()) restore();
    // WebKit can retain an empty style attribute after custom properties are removed. Restore serialization last,
    // while keeping any unrelated style a different reader feature changed during this session.
    for (const [el, original] of styles) if (el.style.cssText === original.css) {
      if (original.raw === null) el.removeAttribute('style'); else el.setAttribute('style', original.raw);
    }
  };
  const listen = (target: EventTarget, event: string, fn: EventListener) => {
    target.addEventListener(event, fn);
    undo.push(() => target.removeEventListener(event, fn));
  };
  const add = (root: Element, elements: Element[], sequence = false, kind: Kind | ((el: Element) => Kind) = 'focus') => {
    const items = elements.filter(el => !used.has(el));
    if (!items.length || roots.has(root)) return;
    const group: Group = { root, items, pending: new Set(items), started: false, visible: false, done: false };
    const spacing = sequence ? Math.min(1000, 3000 / Math.max(1, items.length - 1)) : 0;
    attr(root, STATE, 'ready');
    items.forEach((el, i) => {
      used.add(el);
      attr(el, ITEM, typeof kind === 'function' ? kind(el) : kind);
      attr(el, PLAY, 'ready');
      variable(el as HTMLElement | SVGElement, '--myin-delay', `${Math.round(i * spacing)}ms`);
    });
    listen(root, 'animationend', event => {
      const e = event as AnimationEvent;
      if (!e.animationName.startsWith('myin-report-') || !group.pending.delete(e.target as Element)) return;
      if (!group.pending.size) finish(group);
    });
    groups.push(group); roots.set(root, group);
    return group;
  };
  const select = (selector: string, children: string, sequence = false, kind: Kind | ((el: Element) => Kind) = 'focus') => {
    // One selector a browser cannot parse (e.g. :has) skips only that diagram, not the whole reader (EDU review #449).
    try { doc.querySelectorAll(selector).forEach(root => add(root, Array.from(root.querySelectorAll(children)), sequence, kind)); } catch { /* skip */ }
  };

  try {
    const style = doc.createElement('style');
    style.id = STYLE_ID; style.textContent = CSS;
    doc.head.append(style); undo.push(() => style.remove());

    // Three needs: use the report's actual SVG coordinates, needs, facets and roles. The dot is a reading guide,
    // not a score, a measured causal sequence, or an extra interpretation of the customer's responses.
    doc.querySelectorAll('[data-slot="synergy_nodes"] .tri-wrap').forEach(root => {
      const svg = root.querySelector('svg'), nodes = Array.from(root.querySelectorAll('.tri-node-circle'));
      const steps = Array.from(root.querySelectorAll('.step3'));
      const xy = nodes.map(el => ['cx', 'cy'].map(key => el.hasAttribute(key) ? Number(el.getAttribute(key)) : NaN));
      if (!svg || nodes.length !== 3 || steps.length !== 3 || xy.flat().some(n => !Number.isFinite(n))) return;
      const group = add(root, steps, true);
      if (!group) return;
      const dot = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '5'); dot.setAttribute('fill', 'var(--blue,#2735c8)');
      dot.setAttribute('opacity', '0'); dot.setAttribute('aria-hidden', 'true');
      attr(dot, ITEM, 'orbit');
      attr(dot, PLAY, 'ready');
      xy.forEach(([x, y], i) => { variable(dot, `--myin-x${i}`, `${x}px`); variable(dot, `--myin-y${i}`, `${y}px`); });
      svg.append(dot); undo.push(() => dot.remove()); group.items.push(dot); group.pending.add(dot);
    });
    // Ordered processes follow the existing reading order. Comparisons and scores pulse together: their values
    // never count up, grow from zero, tilt, or imply a new ranking/relationship.
    select('.v-flow', ':scope > .v-step', true);
    select('.me-steps', ':scope > li', true);
    select('.principle', ':scope > .pstep', true);
    select('.e-sequence', ':scope > span', true);
    select('.e-identity', '.e-identity-main,.e-identity-criteria,.e-identity-result', true);
    select('.v-panel:has(.v-fork)', '.v-fork-root,.v-route');
    // Branches read in order: the core need's column first in the TOP5 MAP, current roles before wider ones in chapter 14.
    select('.v-job-branches:not(.mm2 > .v-job-branches)', ':scope > div', true);
    select('.v-environment:not(.mm2 > .v-environment)', ':scope > .v-good,:scope > .v-risk');
    select('.e-balance', ':scope > div');
    select('.v-compare', ':scope > div');
    select('.v-low-map', ':scope > div');
    select('.e-mission', ':scope > div');
    select('.chartbox', '.radar-poly,.rank-bar i', false, el => el.matches('.radar-poly') ? 'ink' : 'sheen');
    select('.gaugetier', '.gc-track i', false, 'sheen');
    select('.top5card,.spec .pole', '.t5-gauge i', false, 'sheen');
    select('.need-map-grid', '.need-map-card');
    select('.e-dual > div', '.e-diagram path,.e-diagram circle', false, 'ink');
    // Rows of one diagram read top to bottom as one sequence (CEO QA 10-15: two rows of 18장 lit at once).
    // CEO QA 10-15: the behavior map lit every word in turn; its three scene boxes are enough.
    select('.v-lanes', ':scope > div', true);
    select('.v-riskmap:not(.mm2 > .v-riskmap)', ':scope > a > strong,:scope > a > b', true);
    // The 20장 money block: only its three scene cards, one after another (CEO QA 10-15: '너무 번잡해').
    select('.mm2 > .v-riskmap', ':scope > a', true);
    select('.v-flow-list', ':scope > li', true);
    select('.v-boundary:not(.v-panel:has(.v-lanes) .v-boundary)', ':scope > b');
    select('.v-money-card', ':scope > b,:scope > dl', true);
    select('.final-block:has(> .levelrow)', ':scope > .levelrow > div:not(.arr)', true);
    select('.timeline', ':scope > .era', true);
    if (!groups.length) { cleanup(); return noop; }

    observer = new IntersectionObserver(entries => {
      try {
        for (const entry of entries) {
          const group = roots.get(entry.target);
          if (!group || group.done) continue;
          group.visible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
          sync(group);
        }
      } catch { cleanup(); }
    }, { threshold: [0, 0.15] });
    groups.forEach(group => observer?.observe(group.root));
    const refresh = () => { for (const group of groups) sync(group); };
    listen(doc, 'visibilitychange', refresh); listen(window.document, 'visibilitychange', refresh);
    // Direct browser printing also restores the exact underlying styles, even midway through a diagram.
    const beforePrint = () => { printing = true; groups.forEach(finish); };
    listen(window, 'beforeprint', beforePrint); listen(win, 'beforeprint', beforePrint);
    listen(print, 'change', (() => { if (print.matches) beforePrint(); }) as EventListener);
    listen(motion, 'change', (() => { if (motion.matches) cleanup(); }) as EventListener);
    listen(win, 'pagehide', cleanup);
    return cleanup;
  } catch { cleanup(); return noop; }
}
