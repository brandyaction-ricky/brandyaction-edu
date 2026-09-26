import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';

// Local, synthetic walkthrough only. No Auth, database, model or send provider.
const compiled = await build({ entryPoints: ['lib/conversion-review.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { createMockJudgment, evidenceVersions, isRunStale } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
const now = () => new Date().toISOString();
const course = '11111111-1111-4111-8111-111111111111';
const snapshot = {
  cases: [{ id: randomUUID(), source_type: 'manual', question_id: null, course_id: course, cohort_id: null,
    subject: '초보 수강과 녹화 문의', content: '초보자도 따라갈 수 있나요? 실시간 참석이 어려운데 녹화가 있나요?',
    source_label: '미리보기용 가상 문의', received_at: now(), customer_id: null, input_version: 1, created_at: now() }],
  evidence: [{ id: randomUUID(), course_id: course, cohort_id: null, title: '수강 수준 안내', body: '초보자를 대상으로 기초 개념부터 설명합니다.',
    source_url: 'https://example.com', version: 1, status: 'approved' }],
  courses: [{ id: course, title: '마케팅 교육 · 예시 상품' }], cohorts: [], questions: [], runs: [], reviews: [],
  capabilities: { can_manage_evidence: true, can_mock: true },
};
const bundle = await build({ entryPoints: ['tests/browser/fixture/app.tsx'], bundle: true, write: false, outdir: 'demo', platform: 'browser', format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, alias: { 'next/link': resolve('tests/browser/fixture/link.tsx') } });
const assets = new Map(bundle.outputFiles.map(file => ['/' + file.path.split('/').at(-1), file.contents]));
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  if (url.pathname === '/api/conversion') {
    if (req.method === 'GET') return send(200, snapshot);
    if (req.method !== 'POST' || req.headers.origin !== 'http://127.0.0.1:4175') return send(403, { error: '로컬 미리보기에서만 사용할 수 있습니다.' });
    try {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100000) return send(413, { error: '입력이 너무 깁니다.' }); }
      const body = JSON.parse(raw);
      if (body.action === 'save_case' || body.action === 'save_evidence') {
        const evidence = body.action === 'save_evidence';
        const list = evidence ? snapshot.evidence : snapshot.cases;
        const old = list.find(item => item.id === body.id);
        const item = { ...old, ...body, id: old?.id || randomUUID(), created_at: old?.created_at || now() };
        if (evidence) item.version = (old?.version || 0) + 1;
        else Object.assign(item, { source_type: 'manual', question_id: null, customer_id: null, input_version: (old?.input_version || 0) + 1 });
        if (old) list.splice(list.indexOf(old), 1, item); else list.push(item);
        return send(200, { ok: true, [evidence ? 'evidence' : 'case']: item });
      }
      const inquiry = snapshot.cases.find(item => item.id === body.case_id);
      if (!inquiry) return send(404, { error: '예시 문의를 선택하세요.' });
      if (body.action === 'analyze') {
        const run = { id: randomUUID(), case_id: inquiry.id, input_version: inquiry.input_version, provider: 'mock',
          result: createMockJudgment(inquiry, snapshot.evidence), evidence_versions: evidenceVersions(inquiry, snapshot.evidence),
          evidence_snapshot: structuredClone(snapshot.evidence), input_snapshot: structuredClone(inquiry), created_at: now() };
        snapshot.runs.push(run); return send(200, { ok: true, run });
      }
      if (body.action === 'review') {
        const run = snapshot.runs.find(item => item.id === body.run_id);
        if (!run || isRunStale(run, inquiry, snapshot.evidence)) return send(409, { error: '자료가 바뀌었습니다. 다시 판단해 주세요.' });
        const review = { ...body, id: randomUUID(), actor_id: 'demo', created_at: now() };
        snapshot.reviews.push(review); return send(200, { ok: true, review });
      }
      return send(400, { error: '지원하지 않는 예시 동작입니다.' });
    } catch { return send(400, { error: '예시 입력을 확인해 주세요.' }); }
  }
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return send(404, { error: '미리보기 전용입니다.' });
  const asset = assets.get(url.pathname);
  if (asset) { res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript'); return res.end(asset); }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>구매 전환 관리 · 미리보기</title><link rel="stylesheet" href="/app.css"><body style="overflow:auto"><aside style="padding:16px 24px;background:#fff3ce;color:#4a3900;font:15px/1.6 sans-serif"><strong>미리보기 · 가상 데이터</strong> — 실제 개발된 화면입니다. 예시 문의를 선택한 뒤 모의 판단과 검토 저장을 눌러보세요. 실제 AI·고객 발송·DB 저장은 없으며 서버를 종료하면 입력이 사라집니다.</aside><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
server.listen(4175, '127.0.0.1', () => console.log('Conversion demo: http://127.0.0.1:4175/admin/conversion'));
