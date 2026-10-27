import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { QuestionThreadDialog } from '../../../app/ui/final/question-thread';
import { sections, type Row } from '../../../lib/platform';
import { useSearchParams } from 'next/navigation';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/admin.css';
import '../../../app/ui/final/integration.css';
import '../../../features/admin-ui/styles/admin-system.css';
function Fixture() {
  const [active, setActive] = useState<Row | null>(null), [revision, setRevision] = useState(0), [render, setRender] = useState(0);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const question: Row = {
    id: '22222222-2222-4222-8222-222222222222', title: '예시 학습 질문', content: '예시: 다음 학습 단계가 궁금합니다.',
    answer: '목록에 저장된 이전 답변', answer_head_id: '33333333-3333-4333-8333-333333333333',
    updated_at: 'revision-' + revision, created_at: '2026-10-13', status: revision ? 'answered' : 'open', is_archived: false,
    profiles: { full_name: '예시 수강생', email: 'synthetic@example.test' }, courses: { title: '예시 과정' },
  };
  const fixtureParams = useSearchParams();
  const secondQuestion = {
    id: '55555555-5555-4555-8555-555555555555', title: '두 번째 학습 질문', content: '두 번째 질문의 본문입니다.',
    status: 'open', is_archived: false, created_at: '2026-10-14',
    profiles: { full_name: '두 번째 수강생', email: 'second@example.test' }, courses: { title: '예시 과정' },
  };
  const questionsAll: Row[] = fixtureParams.has('many')
    ? [question, ...Array.from({ length: 39 }, (_, index) => ({ ...secondQuestion, id: `synthetic-question-${index}`, title: `추가 질문 ${index + 1}` }))]
    : fixtureParams.has('tabs') ? [question, { ...secondQuestion, status: 'answered' }, { ...secondQuestion, id: '66666666-6666-4666-8666-666666666666', title: '보관된 질문', is_archived: true }] : fixtureParams.has('multiple') ? [question, secondQuestion] : [question];
  const state = fixtureParams.get('questionState') || 'active';
  const questions = questionsAll.map((item): Row => ({ ...item, is_archived: Boolean(item.is_archived) || archivedIds.includes(item.id) })).filter(item => state === 'archived' ? item.is_archived : !item.is_archived && (state === 'active' || item.status === state));
  return <main className="edu-admin" style={{ padding: '24px 16px' }}>
    <h1>질문함</h1><p>가상 질문으로 만든 검수 화면입니다.</p>
    <button type="button" onClick={() => setRender(value => value + 1)}>일반 화면 갱신 {render}</button>
    <button type="button" onClick={() => setRevision(value => value + 1)}>목록 새로고침</button>
    <AdminCatalog section={sections.find(section => section.key === 'questions')!} data={{ edu_questions: questions }} selection={[]} setSelection={() => {}} edit={(_section, row) => setActive(row || null)} archive={(_section, ids) => setArchivedIds(current => [...current, ...ids])} pending={false} loading={false} pagination={{ page: 1, pageSize: 20, total: questions.length }} setPage={() => {}} exportCsv={() => {}} onQuestionChanged={() => setRevision(value => value + 1)}/>
    {active && <QuestionThreadDialog questionId={String(active.id)} close={() => setActive(null)} changed={() => setRevision(value => value + 1)}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
