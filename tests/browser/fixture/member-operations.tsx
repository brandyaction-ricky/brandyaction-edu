import { useState } from 'react';
import Link from 'next/link';
import { Editor } from '../../../app/ui/platform';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { SubmissionReview } from '../../../app/ui/final/submission-review';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { sections, type Row } from '../../../lib/platform';
import type { Data } from '../../../app/ui/learning-workflows';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const member = { id: id(1), full_name: '운영 동선 QA 회원', email: 'operations-fixture@example.test', role: 'student', status: 'active', phone: '01012345678', created_at: '2026-09-20' };
const course = { id: id(10), title: '합성 신규 상품' }, cohort = { id: id(11), name: '1기' };
const enrollment = { id: id(12), user_id: member.id, course_id: course.id, cohort_id: cohort.id, profiles: member, courses: course, cohorts: cohort };
const mission = { id: id(20), title: '첫 실행 미션', instructions: '실행 내용을 작성하세요.' };
const submission = { id: id(30), enrollment_id: enrollment.id, mission_id: mission.id, enrollments: enrollment, curriculum_missions: mission, status: 'approved', attempt_number: 2, submitted_at: '2026-09-24T09:00:00Z', reviewed_at: '2026-09-24T10:00:00Z', reviewer_feedback: '실행 확인 완료', response: { text: '합성 제출 답변' } };
const question = { id: id(40), user_id: member.id, profiles: member, courses: course, title: '합성 보관 질문', content: '다음 학습은 어디에서 보나요?', answer: '학습 기록에서 확인해 주세요.', status: 'answered', is_archived: true, created_at: '2026-09-24T09:00:00Z' };
const data: Data = { profiles: [member], courses: [course], cohorts: [cohort], enrollments: [enrollment], curriculum_missions: [mission], mission_submissions: [submission], edu_questions: [question] };

// Only in-memory UI and synthetic GETs. Save never calls the real API.
export function MemberOperationsFixture() {
  const key = location.pathname.split('/').at(-1) || 'customers';
  const section = sections.find(item => item.key === (key === 'member-operations-test' ? 'customers' : key)) || sections.find(item => item.key === 'customers')!;
  const [editor, setEditor] = useState<Row | null>(null), [notice, setNotice] = useState('');
  const [editorSection, setEditorSection] = useState(sections.find(item => item.key === 'customers')!);
  const openMember = (row: Row) => { setEditorSection(sections.find(item => item.key === 'customers')!); setEditor(row); };
  const params = new URLSearchParams(location.search);
  const questionVisible = params.has('question') || params.get('questionState') === 'archived';
  return <div className="edu-admin" style={{ padding: 20, minHeight: '100vh' }}>
    <h1>회원 운영 동선 QA</h1><p>합성 데이터 · 외부 DB/인증 연결 없음</p>
    <nav className="row wrap-flex mt16"><Link className="btn" href="/admin/customers">회원 관리</Link><Link className="btn" href="/admin/questions">질문함</Link><Link className="btn" href="/admin/reviews">제출물 검토</Link></nav>
    <div className="row wrap-flex mt16"><button className="btn" onClick={() => openMember(member)}>회원 상세 열기</button><button className="btn" onClick={() => openMember({ ...member, id: id(3) })}>조회 오류 회원</button><button className="btn" onClick={() => openMember({ ...member, id: id(4) })}>기록 없는 회원</button></div>
    {notice && <p role="status">{notice}</p>}
    {section.key === 'members' ? <AdminWorkflows section="members" data={data} pending={false} send={async()=>({})}/> : section.key === 'reviews' ? <SubmissionReview data={data} pending={false} send={async () => { setNotice('합성 검토 저장'); return {}; }}/> : <AdminCatalog section={section} data={{ ...data, edu_questions: questionVisible ? data.edu_questions : [] }} selection={[]} setSelection={() => {}} edit={(selected, row) => { setEditorSection(selected); setEditor(row || member); }} archive={() => {}} pending={false} loading={false} pagination={null} setPage={() => {}} exportCsv={() => {}} send={async () => ({})}/>}
    {editor && <Editor section={editorSection} row={editor} data={data} pending={false} close={() => setEditor(null)} save={async values => { setNotice(`합성 저장 완료: ${values.full_name || values.answer}`); setEditor(null); }}/>}
  </div>;
}
