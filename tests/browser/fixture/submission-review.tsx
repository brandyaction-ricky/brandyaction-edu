import { useState } from 'react';
import Link from 'next/link';
import { SubmissionReview } from '../../../app/ui/final/submission-review';
import type { Data } from '../../../app/ui/learning-workflows';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const member = { id: id(1), full_name: '합성 검토 QA 회원', email: 'review-fixture@example.test' };
const enrollment = { id: id(2), user_id: member.id, course_id: id(3) };
export function SubmissionReviewFixture() {
  const [pending, setPending] = useState(false), [mode, setMode] = useState('success'), [requests, setRequests] = useState(0);
  const [data, setData] = useState<Data>({
    profiles: [member], courses: [{ id: id(3), title: '합성 신규 상품' }], enrollments: [enrollment],
    curriculum_missions: [10, 11, 12].map(n => ({ id: id(n + 10), title: n === 12 ? '기존 승인 미션' : `실행 미션 ${n - 9}`, instructions: '실행 내용과 증빙을 확인하세요.' })),
    mission_submissions: [10, 11, 12].map(n => ({ id: id(n), enrollment_id: enrollment.id, mission_id: id(n + 10), status: n === 12 ? 'approved' : 'submitted', submitted_at: `2026-09-2${n - 9}T09:00:00Z`, reviewed_at: n === 12 ? '2026-09-25T09:00:00Z' : null, attempt_number: 1, reviewer_feedback: n === 12 ? '과거 승인 피드백' : null, response: { text: '합성 제출 답변입니다. 실제 회원 데이터가 아닙니다.' } })),
  });
  return <div className="edu-admin" style={{ padding: 16 }}>
    <h1>제출 검토 · 합성 QA</h1><p>외부 DB와 알림에 연결되지 않은 로컬 테스트입니다.</p>
    <label>합성 저장 상황 <select aria-label="합성 저장 상황" value={mode} onChange={event => setMode(event.target.value)}><option value="success">정상 저장</option><option value="conflict">다른 운영자 선처리</option><option value="network">응답 유실</option></select></label>
    <p role="status">합성 저장 요청 {requests}회</p><Link href="/admin-shell-test">다른 화면으로 이동</Link>
    <SubmissionReview data={data} pending={pending} send={async body => {
      setPending(true); setRequests(value => value + 1);
      try {
        const response = await fetch('/fixture-review-write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, scenario: mode }) });
        const result = await response.json();
        if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code });
        setData(previous => ({ ...previous, mission_submissions: previous.mission_submissions.map(row => (body.ids as string[]).includes(row.id) ? { ...row, status: body.decision, reviewer_feedback: body.feedback, reviewed_at: '2026-09-26T09:00:00Z' } : row) }));
        return result;
      } finally { setPending(false); }
    }}/>
  </div>;
}
