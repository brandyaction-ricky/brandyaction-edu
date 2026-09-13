import { CTA_IDS, TEST_COOKIE, decodeLabel, validId, isTestRequest, rawAttribution, type LandingConfig, type LandingEvent } from './landing';
import { createEngagementMeter } from './landing-engagement';

type Pixel = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[][]; push?: Pixel; loaded?: boolean; version?: string };
declare global { interface Window { fbq?: Pixel; _fbq?: Pixel; eduPixelIds?: Set<string>; } }
export function syncTestMode() {
  try {
    const mode = new URLSearchParams(location.search).get('testmode');
    if (mode === '1' || mode === '0') document.cookie = `${TEST_COOKIE}=${mode}; Path=/; Max-Age=${mode === '1' ? 31536000 : 0}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {}
  return isTestRequest(document.cookie);
}
export function environment(ua: string) {
  const browser = /Instagram/i.test(ua) ? 'Instagram' : /FBAN|FBAV/i.test(ua) ? 'Facebook' : /KAKAOTALK/i.test(ua) ? 'Kakao' : /Edg\//i.test(ua) ? 'Edge' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Other';
  return { device: /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop', browser, isInApp: ['Instagram','Facebook','Kakao'].includes(browser) };
}
export function pixel(config: Pick<LandingConfig, 'pixel_enabled' | 'pixel_id'>, event: string, values: Record<string, unknown> = {}, id?: string) {
  if (!config.pixel_enabled || !/^\d{5,30}$/.test(config.pixel_id) || syncTestMode()) return;
  try {
    if (!window.fbq) {
      const fbq: Pixel = function(...args: unknown[]) { if(fbq.callMethod) fbq.callMethod(...args); else fbq.queue!.push(args); };
      fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      window.fbq = window._fbq = fbq;
      const script = document.createElement('script'); script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(script);
    }
    window.eduPixelIds ||= new Set();
    if (!window.eduPixelIds.has(config.pixel_id)) { window.fbq('init', config.pixel_id); window.eduPixelIds.add(config.pixel_id); }
    window.fbq('trackSingle', config.pixel_id, event, values, id ? { eventID: id } : {});
  } catch {}
}
// A stable event row per section allows cumulative dwell updates without duplicate views.
export function startLandingTracking(root: HTMLElement, config: LandingConfig) {
  if (!config.enabled || !config.layout_ver || syncTestMode()) return () => {};
  let session: string, visitor: string, attribution: Record<string, unknown>;
  try {
    const previousSession = sessionStorage.getItem('edu-landing-session');
    session = validId(previousSession) ? previousSession : crypto.randomUUID(); sessionStorage.setItem('edu-landing-session', session);
    let stored: { id: string; expires: number; session: string } | null = null;
    try { stored = JSON.parse(localStorage.getItem('edu-landing-visitor') || 'null'); } catch {}
    const returning = !!stored && stored.expires > Date.now() && stored.session !== session;
    if (!stored || !validId(stored.id) || !Number.isFinite(stored.expires) || stored.expires < Date.now()) { stored = { id: crypto.randomUUID(), expires: Date.now() + 31536000000, session }; localStorage.setItem('edu-landing-visitor', JSON.stringify(stored)); }
    visitor = stored.id;
    const old = sessionStorage.getItem('edu-landing-attribution');
    attribution = old ? JSON.parse(old) : { ...rawAttribution(location.search, document.referrer), ...environment(navigator.userAgent), returning };
    if (!old) sessionStorage.setItem('edu-landing-attribution', JSON.stringify(attribution));
  } catch {
    // Storage restrictions must not disable the CTA or the independently configured pixel.
    session = crypto.randomUUID(); visitor = crypto.randomUUID(); attribution = { ...rawAttribution(location.search, document.referrer), ...environment(navigator.userAgent), returning:false };
  }
  let destroyed = false;
  const prefix = `edu-landing:${config.id}:${session}:${config.layout_ver}`;
  let previousEngagement = null;
  try { previousEngagement = JSON.parse(sessionStorage.getItem(prefix + ':engagement') || 'null'); } catch {}
  const engagement = createEngagementMeter(previousEngagement, performance.now());
  const pageEventId = crypto.randomUUID();
  const sampleEngagement = () => engagement.sample(document.visibilityState === 'visible', Math.max(0, Math.min(100, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight) * 100)), performance.now());
  const pageEvent = (): LandingEvent => {
    const payload = sampleEngagement();
    try { sessionStorage.setItem(prefix + ':engagement', JSON.stringify(payload)); } catch {}
    return { id: pageEventId, event_type: 'view_page', payload };
  };
  const send = (events: LandingEvent[]) => {
    if (!events.length || syncTestMode()) return;
    try {
      for (let i = 0; i < events.length; i += 20) {
        const body = JSON.stringify({ landing_id: config.id, session_id: session, visitor_id: visitor, layout_ver: config.layout_ver, attribution, events: events.slice(i,i+20) });
        let sent = false;
        try { sent = !!navigator.sendBeacon?.('/api/landing/events', new Blob([body], { type: 'application/json' })); } catch {}
        if (!sent) void fetch('/api/landing/events', { method: 'POST', body, headers: { 'Content-Type':'application/json' }, keepalive:true }).catch(() => {});
      }
    } catch {}
  };
  try {
    // The server deduplicates this stable page row while accepting cumulative engagement.
    send([pageEvent()]);
    if (config.pixel_enabled && !sessionStorage.getItem(prefix + ':pixel:' + config.pixel_id)) { pixel(config,'PageView'); sessionStorage.setItem(prefix + ':pixel:' + config.pixel_id,'1'); }
  } catch { pixel(config,'PageView'); }
  type State = { id: string; dwell: number; since: number; visible: boolean; reached: boolean };
  const states = new Map<HTMLElement, State>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let currentSection = '';
  const eventFor = (el: HTMLElement, s: State): LandingEvent => ({ id:s.id, event_type:'view_section', payload:{ section:el.dataset.section, dwellMs:Math.min(86400000,Math.round(s.dwell)) } });
  const pause = (s: State) => { if(s.since) s.dwell += performance.now() - s.since; s.since = 0; };
  const persist = (el: HTMLElement,s: State) => { try { sessionStorage.setItem(prefix + ':' + el.dataset.section, JSON.stringify({ id:s.id, dwell:s.dwell, reached:s.reached })); } catch {} };
  const flush = () => {
    const events: LandingEvent[] = [pageEvent()];
    for(const [el,s] of states) {
      if (!s.reached) continue;
      pause(s); persist(el,s); events.push(eventFor(el,s));
      if(s.visible && document.visibilityState === 'visible' && !destroyed) s.since = performance.now();
    }
    send(events);
  };
  // Use half of the viewport for tall image sections, which can never be 50% of their own height.
  const measure = () => {
    if(destroyed) return;
    sampleEngagement();
    let best = 0;
    for(const [el,s] of states) {
      const r = el.getBoundingClientRect();
      const visible = Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));
      const qualifies = document.visibilityState === 'visible' && visible >= Math.min(r.height,innerHeight)*0.5 && r.height>0;
      if(qualifies) {
        if(visible>best) { currentSection=el.dataset.section || ''; best=visible; }
        if(!s.visible) { s.visible=true; s.since=performance.now(); }
        if(!s.reached) { s.reached=true; persist(el,s); send([eventFor(el,s)]); }
      } else if(s.visible) { pause(s); s.visible=false; if(s.reached) { persist(el,s); send([eventFor(el,s)]); } }
    }
  };
  const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(measure,{threshold:[0,0.1,0.25,0.5,0.75,1]}) : null;
  const discover = () => {
    root.querySelectorAll<HTMLElement>('[data-section]').forEach(el => {
      if(states.has(el)) return;
      let state: Partial<State> = {};
      try { state=JSON.parse(sessionStorage.getItem(prefix + ':' + el.dataset.section) || '{}'); } catch {}
      states.set(el,{id:state.id || crypto.randomUUID(),dwell:state.dwell || 0,reached:!!state.reached,visible:false,since:0}); observer?.observe(el);
    }); measure();
  };
  const mutations = new MutationObserver(discover); mutations.observe(root,{childList:true,subtree:true});
  let frame = 0;
  const scroll = () => { if(!frame) frame=requestAnimationFrame(()=>{frame=0;measure();}); };
  const visibility = () => { if(document.visibilityState !== 'visible') flush(); measure(); };
  const click = (event: MouseEvent) => {
    const link=(event.target as Element)?.closest?.<HTMLAnchorElement>('a[data-landing-cta]');
    if(!link || !root.contains(link) || !(CTA_IDS as readonly string[]).includes(link.dataset.landingCta || '')) return;
    try {
      const to=link.dataset.landingCta!, id=crypto.randomUUID();
      const scrollPct = Math.max(0,Math.min(100,scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)*100));
      flush(); send([{id,event_type:'click_cta',payload:{to,section:currentSection,scrollPct}}]);
      pixel(config,'CompleteRegistration',{content_name:to.replace('_cta',''),content_category:decodeLabel(attribution.utm_term)},id);
      let left = false;
      const hidden = () => { if(document.visibilityState === 'hidden') left=true; };
      document.addEventListener('visibilitychange',hidden);
      const started=performance.now();
      const timer=setTimeout(()=>{
        timers.delete(timer); document.removeEventListener('visibilitychange',hidden);
        if(!destroyed && !left && document.visibilityState==='visible') send([{id:crypto.randomUUID(),event_type:'post_click_alive',payload:{to,clickId:id,elapsedMs:Math.round(performance.now()-started)}}]);
      },config.thresholds.alive_seconds*1000);
      timers.add(timer);
      cleanupVisibility.push(()=>document.removeEventListener('visibilitychange',hidden));
    } catch {} // Never preventDefault or await analytics before navigation.
  };
  const cleanupVisibility: (()=>void)[]=[];
  root.addEventListener('click',click); window.addEventListener('scroll',scroll,{passive:true}); window.addEventListener('resize',scroll); window.addEventListener('pagehide',flush); document.addEventListener('visibilitychange',visibility);
  const heartbeat = setInterval(() => { if (document.visibilityState === 'visible') flush(); }, 15000);
  discover();
  return () => { destroyed=true; clearInterval(heartbeat); flush(); observer?.disconnect(); mutations.disconnect(); timers.forEach(clearTimeout); cleanupVisibility.forEach(fn=>fn()); if(frame)cancelAnimationFrame(frame); root.removeEventListener('click',click); window.removeEventListener('scroll',scroll); window.removeEventListener('resize',scroll); window.removeEventListener('pagehide',flush); document.removeEventListener('visibilitychange',visibility); };
}
