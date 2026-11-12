import { createRecordedAmbience } from './recorded-ambience.js';

const supportsRoom = value => value === 'office' || value === 'study';
const VOLUME_KEY = 'brandy-ambient-volumes-v1';
const TRACKS = [
  ['rain', '빗소리', '산속의 집에 내리는 잔잔한 비'],
  ['classical', '클래식풍 멜로디', '가볍게 반복되는 부드러운 선율'],
  ['office', '키보드 타건 소리', '함께 일하는 듯한 키보드 소리'],
];

/** Volume preferences are local; playback always starts with a deliberate switch. */
export function attachAmbientMixer(host) {
  if (!host) return { setRoom() {}, destroy() {} };
  const doc = host.ownerDocument;
  const scope = doc.defaultView || window;
  const tracks = new Map();
  let ctx, room = 'office', destroyed = false, savedVolumes = {};
  try {
    const raw = scope.localStorage.getItem(VOLUME_KEY);
    if (raw && raw.length < 2048) savedVolumes = JSON.parse(raw) || {};
  } catch { /* Sound remains usable when storage is unavailable. */ }

  function element(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const root = element('div', 'ambient-mixer');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '배경음 믹서');
  root.append(element('p', 'ambient-intro', '원하는 소리를 겹쳐 들어보세요. 공간을 이동해도 소리가 이어집니다.'));
  const allOff = element('button', 'ambient-stop-all', '모든 소리 끄기');
  allOff.type = 'button';

  function persistVolumes() {
    try { scope.localStorage.setItem(VOLUME_KEY, JSON.stringify(Object.fromEntries([...tracks].map(([id, t]) => [id, Number(t.range.value)])))); }
    catch { /* Keep the current volume even if it cannot be saved. */ }
  }
  function refreshTrack(t) {
    if (destroyed) return;
    t.check.checked = t.enabled;
    t.row.dataset.state = t.status;
    t.statusNode.textContent = t.status === 'error' ? '재생하지 못했어요. 스위치를 다시 켜 주세요.'
      : t.status === 'loading' ? '소리를 불러오는 중…'
      : !t.enabled ? '꺼짐'
      : Number(t.range.value) === 0 ? '음소거 · 볼륨을 올리면 재생됩니다.'
      : !supportsRoom(room) ? '이 공간에서는 재생이 잠시 멈춥니다.'
      : doc.hidden ? '화면으로 돌아오면 이어집니다.'
      : t.status === 'playing' ? '재생 중' : '잠시 멈춤';
    t.statusNode.setAttribute('role', t.status === 'error' ? 'alert' : 'status');
    allOff.disabled = ![...tracks.values()].some(track => track.enabled);
  }
  const recorded = createRecordedAmbience({ scope, onState(state) {
    for (const [id, value] of Object.entries(state)) {
      const t = tracks.get(id);
      if (!t) continue;
      t.enabled = value.enabled;
      t.status = value.status;
      refreshTrack(t);
    }
  } });

  function stopClassical(t) {
    clearInterval(t.timer); t.timer = null;
    for (const node of t.nodes) {
      try { node.stop?.(); } catch { /* A finished note may already be stopped. */ }
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    }
    t.nodes.clear(); t.gain = null;
  }
  function syncClassical() {
    const t = tracks.get('classical');
    stopClassical(t);
    if (!t.enabled || !supportsRoom(room) || doc.hidden || Number(t.range.value) === 0 || !ctx || destroyed) {
      t.status = t.enabled ? 'paused' : 'off'; refreshTrack(t); return;
    }
    if (ctx.state !== 'running') {
      t.enabled = false; t.status = 'error'; refreshTrack(t); return;
    }
    const gain = ctx.createGain();
    gain.gain.value = Number(t.range.value) / 100 * .17;
    gain.connect(ctx.destination); t.gain = gain; t.nodes.add(gain);
    const notes = [60, 64, 67, 72, 71, 67, 64, 62, 57, 60, 64, 69, 67, 64, 60, 59];
    let step = 0;
    function note() {
      if (destroyed || !t.enabled || doc.hidden || !supportsRoom(room)) return;
      const oscillator = ctx.createOscillator(), envelope = ctx.createGain(), now = ctx.currentTime;
      oscillator.type = 'triangle';
      oscillator.frequency.value = 440 * 2 ** ((notes[step++ % notes.length] - 69) / 12);
      envelope.gain.setValueAtTime(.65, now);
      envelope.gain.exponentialRampToValueAtTime(.001, now + 1.1);
      oscillator.connect(envelope); envelope.connect(gain);
      t.nodes.add(oscillator); t.nodes.add(envelope);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); t.nodes.delete(oscillator); t.nodes.delete(envelope); };
      oscillator.start(); oscillator.stop(now + 1.2);
    }
    note(); t.timer = setInterval(note, 470);
    t.status = 'playing'; refreshTrack(t);
  }
  async function setEnabled(id, enabled) {
    const t = tracks.get(id);
    if (destroyed) return;
    const generation = ++t.generation;
    t.enabled = enabled;
    if (id !== 'classical') {
      try { await recorded.setEnabled(id, enabled); } catch { /* Recorded state supplies the inline error. */ }
      return;
    }
    if (!enabled) { syncClassical(); return; }
    t.status = 'loading'; refreshTrack(t);
    try {
      const Context = scope.AudioContext || scope.webkitAudioContext;
      if (!Context) throw new Error('audio unavailable');
      ctx ||= new Context();
      await ctx.resume();
      if (destroyed || generation !== t.generation || !t.enabled) return;
      syncClassical();
    } catch {
      if (destroyed || generation !== t.generation) return;
      t.enabled = false; t.status = 'error'; stopClassical(t); refreshTrack(t);
    }
  }

  for (const [id, name, description] of TRACKS) {
    const row = element('section', 'ambient-track'), top = element('div', 'ambient-track-top');
    const copy = element('div', 'ambient-track-copy'), heading = element('label', 'ambient-track-name', name);
    const check = element('input', 'ambient-switch');
    check.type = 'checkbox'; check.id = 'ambient-switch-' + id; check.setAttribute('role', 'switch');
    check.setAttribute('aria-label', name + ' 재생'); heading.htmlFor = check.id;
    const descriptionNode = element('p', 'ambient-track-description', description);
    descriptionNode.id = 'ambient-description-' + id; check.setAttribute('aria-describedby', descriptionNode.id);
    copy.append(heading, descriptionNode); top.append(copy, check);
    const volume = element('div', 'ambient-volume'), label = element('label', 'ambient-volume-label', '볼륨');
    const range = element('input'); range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1';
    range.id = 'ambient-volume-' + id; label.htmlFor = range.id; range.setAttribute('aria-label', name + ' 볼륨');
    const preference = savedVolumes?.[id];
    range.value = typeof preference === 'number' && Number.isFinite(preference) ? String(Math.max(0, Math.min(100, preference))) : '25';
    const output = element('output', 'ambient-volume-output', range.value + '%'); output.setAttribute('for', range.id);
    range.setAttribute('aria-valuetext', range.value + '%');
    volume.append(label, range, output);
    const statusNode = element('p', 'ambient-track-status', '꺼짐');
    const t = { row, check, range, output, statusNode, enabled: false, status: 'off', generation: 0, nodes: new Set(), timer: null, gain: null };
    tracks.set(id, t); row.append(top, volume, statusNode); root.append(row);
    check.addEventListener('change', () => { void setEnabled(id, check.checked); });
    range.addEventListener('input', () => {
      output.value = range.value + '%'; range.setAttribute('aria-valuetext', range.value + '%');
      if (id !== 'classical') recorded.setVolume(id, range.value);
      else if (Number(range.value) === 0 || !t.gain) syncClassical();
      else t.gain.gain.setTargetAtTime(Number(range.value) / 100 * .17, ctx.currentTime, .08);
      refreshTrack(t); persistVolumes();
    });
    if (id !== 'classical') recorded.setVolume(id, range.value);
    refreshTrack(t);
  }
  root.append(allOff); host.append(root);
  allOff.addEventListener('click', () => { for (const id of tracks.keys()) void setEnabled(id, false); });
  const visibility = () => { syncClassical(); for (const t of tracks.values()) refreshTrack(t); };
  doc.addEventListener('visibilitychange', visibility);
  return {
    setRoom(next) {
      if (destroyed) return;
      const wasSupported = supportsRoom(room);
      room = next; recorded.setRoom(next);
      if (wasSupported !== supportsRoom(next)) syncClassical();
      for (const t of tracks.values()) refreshTrack(t);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; recorded.destroy();
      const t = tracks.get('classical'); t.generation++; stopClassical(t);
      if (ctx) void ctx.close().catch(() => {});
      doc.removeEventListener('visibilitychange', visibility); root.remove();
    },
  };
}
