// In-memory synthetic state only, used exclusively by the localhost browser fixture.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const records = new Map();
const failed = new Set();
export function reviewFixture(request, response, url) {
  const reply = (body, code = 200) => { response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); };
  if (url.pathname === '/fixture-review-write' && request.method === 'POST') {
    let input = '';
    request.on('data', chunk => { input += chunk; });
    request.on('end', () => {
      const body = JSON.parse(input);
      const conflict = body.scenario === 'conflict';
      for (const target of body.ids) records.set(target, {
        id: `audit-${target}`, decision: conflict ? 'approved' : body.decision, feedback: conflict ? '다른 운영자의 저장된 피드백' : body.feedback,
        reviewer: conflict ? '합성 검토자 B' : '합성 검토자 A', reviewedAt: '2026-09-26T09:00:00Z',
        checks: conflict ? { version: 1, answers_complete: true, evidence_consistent: false, criteria_met: true } : body.reviewChecks || null, mode: conflict ? 'single' : body.reviewMode,
      });
      setTimeout(() => reply(conflict ? { error: '합성 충돌', code: 'REVIEW_CONFLICT' } : body.scenario === 'network' ? { error: '저장 응답을 확인하지 못했습니다.', code: 'REVIEW_UNAVAILABLE' } : { ok: true }, conflict ? 409 : body.scenario === 'network' ? 503 : 200), 500);
    });
    return true;
  }
  if (url.pathname !== '/api/admin/submission-review-history') return false;
  const target = url.searchParams.get('submission');
  if (target === id(11) && !failed.has(target)) { failed.add(target); setTimeout(() => reply({ error: '합성 조회 오류: 다시 불러오기로 복구하세요.' }, 503), 500); return true; }
  const row = records.get(target) || (target === id(12) ? { id: 'old', decision: 'approved', reviewedAt: '2026-09-25T09:00:00Z', reviewer: '합성 과거 검토자', feedback: '과거 승인 피드백', checks: null, mode: 'legacy' } : null);
  setTimeout(() => reply({ rows: row ? [row] : [], total: row ? 1 : 0, page: 1, pageSize: 20, current: { id: target, status: row?.decision || 'submitted', reviewed_at: row?.reviewedAt || null, reviewer_feedback: row?.feedback || null } }), 500);
  return true;
}
