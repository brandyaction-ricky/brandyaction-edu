import { serializeLessonDocument } from '../../../lib/lesson-body';

// Browser-only lab. API writes stay in this page's memory, never Auth or a DB.
export function installInternalClipboardLab() {
  const imeLab = new URLSearchParams(location.search).has('imeLab');
  const id = (n: number) => `aaaaaaab-1111-4111-8111-${String(n).padStart(12, '0')}`;
  const content = serializeLessonDocument({ type: 'doc', content: imeLab ? [
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: '기존 문장을 지운 뒤 입력', marks: [{ type: 'bold' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '일반 문장 시작에서 입력' }] },
  ] : [
    { type: 'paragraph', content: [{ type: 'text', text: '복사할 짧은 한 줄', marks: [{ type: 'bold' }] }] },
    ...Array.from({ length: 120 }, (_, n) => ({ type: 'paragraph', content: [{ type: 'text', text: `가상 본문 ${n} ` + '한글 학습 내용을 보존합니다. '.repeat(50) }] })),
  ] });
  const payload = { form: { basic: { week_id: id(5), day_number: '1', title: '가상 내부 복사 검수', description: '', duration_label: '10분', is_published: true, is_preview: false }, format: 'text', bodyText: '', videoUrl: '', externalUrl: '', resourceName: '', resourcePath: '' }, blocks: { active: true, document: { schemaVersion: 1, blocks: [{ id: 'body', type: 'text', content }], checklist: [] } } };
  const state = { lessonId: id(4), revision: null as string | null, publishedRevision: null, publishedStamp: null, baseStamp: 'a'.repeat(32), payload, public: { stamp: 'a'.repeat(32), payload: structuredClone(payload), blockRevision: id(70) }, history: [] };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.pathname !== '/api/admin/lesson-author') return originalFetch(input, init);
    if ((init?.method || 'GET') === 'GET') return Response.json(url.searchParams.get('history') ? { rows: [], next: null } : { ...state, public: { stamp: state.public.stamp, blockRevision: state.public.blockRevision } });
    const body = JSON.parse(String(init?.body));
    if (body.action !== 'save') return Response.json({ error: '가상 검수에서는 공개하지 않습니다.' }, { status: 400 });
    state.payload = structuredClone(body.payload); state.revision = body.requestId;
    return Response.json({ revision: state.revision });
  };
  const panel = document.createElement('aside'); panel.setAttribute('aria-label', '가상 내부 복사 계측');
  panel.style.cssText = 'position:fixed;right:12px;top:12px;background:white;border:2px solid #333;padding:10px;z-index:9999';
  const output = document.createElement('output'); output.setAttribute('aria-label', '가상 복사 계측'); output.textContent = '실제 수업·클립보드 원문을 조회하지 않는 가상 문서';
  const button = document.createElement('button'); button.textContent = '첫 문장 선택'; button.onclick = () => {
    const canvas = document.querySelector<HTMLElement>('[role="textbox"][aria-label="수업 문서"]');
    const span = canvas?.querySelector('.ldc-move-content'); if (!canvas || !span) return;
    canvas.focus(); const range = document.createRange(); range.selectNodeContents(span);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  };
  panel.append(output, document.createElement('br'), button); document.body.append(panel);
  if (imeLab) {
    const trace = document.createElement('pre'); trace.setAttribute('aria-label', '가상 한글 입력 이벤트');
    trace.style.cssText = 'max-width:450px;max-height:320px;overflow:auto;white-space:pre-wrap;font:12px monospace';
    panel.append(trace);
    const rows: string[] = [];
    const render = () => {
      const lines = [...document.querySelectorAll('[aria-label="수업 문서"] p')].map(p => p.textContent);
      trace.textContent = `${navigator.platform}\n${navigator.userAgent}\n문단: ${JSON.stringify(lines)}\n${rows.join('\n')}`;
    };
    for (const name of ['keydown', 'keyup', 'keypress', 'beforeinput', 'compositionstart', 'compositionupdate', 'compositionend', 'input']) {
      document.addEventListener(name, event => {
        if (!(event.target as HTMLElement).closest('[role="textbox"][aria-label="수업 문서"], [data-ime-control]')) return;
        const e = event as InputEvent & KeyboardEvent & CompositionEvent;
        rows.push(`${name} key=${e.key ?? ''} code=${e.keyCode ?? ''} data=${e.data ?? ''} composing=${e.isComposing ?? ''} mods=${[e.metaKey,e.ctrlKey,e.altKey,e.shiftKey].map(Boolean).map(Number).join('')}`);
        if (rows.length > 80) rows.shift();
        queueMicrotask(() => { if (e.defaultPrevented) rows.push(`${name} defaultPrevented`); });
        requestAnimationFrame(render);
      }, true);
    }
    const start = document.createElement('button'); start.textContent = '빈 문단에서 입력 시작';
    start.onclick = () => {
      const canvas = document.querySelector<HTMLElement>('[role="textbox"][aria-label="수업 문서"]');
      const content = canvas?.querySelector('.ldc-move-content'); if (!canvas || !content) return;
      canvas.focus(); const range = document.createRange(); range.setStart(content, 0); range.collapse(true);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
      rows.length = 0; render();
    };
    panel.append(start); render();
    const native = document.createElement('textarea'); native.setAttribute('aria-label', '기본 입력 비교'); native.setAttribute('data-ime-control', '');
    const plain = document.createElement('div'); plain.contentEditable = 'true'; plain.setAttribute('aria-label', '기본 편집 영역 비교'); plain.setAttribute('data-ime-control', ''); plain.style.cssText = 'border:1px solid #333;min-height:30px';
    panel.append(document.createElement('br'), native, plain);
  }
  document.addEventListener('copy', event => {
    if (!(event.target as HTMLElement).closest('[role="textbox"][aria-label="수업 문서"]')) return;
    const html = event.clipboardData?.getData('text/html') || '', text = event.clipboardData?.getData('text/plain') || '';
    output.textContent = `선택 ${text.length}자 · 복사 HTML ${html.length}자 · 미선택 본문 포함 ${html.includes('가상 본문 119') ? '있음' : '없음'}`;
  });
}
