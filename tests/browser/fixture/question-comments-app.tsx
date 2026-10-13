import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { QuestionThreadDialog } from '../../../app/ui/final/question-thread';
import { sections, type Row } from '../../../lib/platform';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/admin.css';
import '../../../features/admin-ui/styles/admin-system.css';
import '../../../app/ui/final/integration.css';
function Fixture() {
  const [active, setActive] = useState<Row | null>(null), [revision, setRevision] = useState(0), [render, setRender] = useState(0);
  const question: Row = {
    id: '22222222-2222-4222-8222-222222222222', title: '예시 학습 질문', content: '예시: 다음 학습 단계가 궁금합니다.',
    answer: '목록에 저장된 이전 답변', answer_head_id: '33333333-3333-4333-8333-333333333333',
    updated_at: 'revision-' + revision, created_at: '2026-10-13', status: revision ? 'answered' : 'open', is_archived: false,
    profiles: { full_name: '예시 수강생', email: 'synthetic@example.test' }, courses: { title: '예시 과정' },
  };
  return <main className="edu-admin" style={{ padding: '24px 16px' }}>
    <h1>질문함</h1><p>가상 질문으로 만든 검수 화면입니다.</p>
    <button type="button" onClick={() => setRender(value => value + 1)}>일반 화면 갱신 {render}</button>
    <button type="button" onClick={() => setRevision(value => value + 1)}>목록 새로고침</button>
    <AdminCatalog section={sections.find(section => section.key === 'questions')!} data={{ edu_questions: [question] }} selection={[]} setSelection={() => {}} edit={(_section, row) => setActive(row || null)} archive={() => {}} pending={false} loading={false} pagination={{ page: 1, pageSize: 20, total: 1 }} setPage={() => {}} exportCsv={() => {}} onQuestionChanged={() => setRevision(value => value + 1)}/>
    {active && <QuestionThreadDialog questionId={String(active.id)} close={() => setActive(null)} changed={() => setRevision(value => value + 1)}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
