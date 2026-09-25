import { useState } from 'react';
import { AdminCatalog, type MissionScope } from '../../../app/ui/final/admin-catalog';
import { Editor } from '../../../app/ui/platform';
import { sections, type Row } from '../../../lib/platform';
import type { MissionContext } from '../../../app/ui/final/mission-target-fields';
import type { Data } from '../../../app/ui/learning-workflows';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const section = sections.find(item => item.key === 'missions')!;
const initial: Data = {
  courses: [{ id: id(1), title: '합성 상품 A' }, { id: id(2), title: '합성 상품 B' }],
  curriculum_weeks: [{ id: id(11), course_id: id(1), week_number: 1, title: 'A 시작 주차' }, { id: id(12), course_id: id(1), week_number: 2, title: 'A 다음 주차' }, { id: id(13), course_id: id(2), week_number: 1, title: 'B 시작 주차' }],
  curriculum_lessons: [{ id: id(21), week_id: id(11), day_number: 1, title: 'A 첫 학습' }, { id: id(22), week_id: id(12), day_number: 2, title: 'A 다음 학습' }, { id: id(23), week_id: id(13), day_number: 1, title: 'B 첫 학습' }],
  curriculum_missions: [{ id: id(31), lesson_id: id(21), title: '보관된 합성 미션', submission_type: 'text', is_required: true, is_published: false, archived_at: '2026-09-25' }],
};

// In-memory UI fixture only. The actual route and DB query boundaries are tested
// separately in admin-operation-integrity.test.mjs; no Auth/DB calls occur here.
export function MissionIntegrityFixture() {
  const [data, setData] = useState(initial), [scope, setScope] = useState<MissionScope>({ courseId: '', weekId: '', state: 'active' });
  const [editor, setEditor] = useState<{ row?: Row; context?: MissionContext } | null>(null);
  const [selection, setSelection] = useState<string[]>([]), [fail, setFail] = useState(false), [pending, setPending] = useState(false), [notice, setNotice] = useState('');
  async function save(values: Record<string, unknown>, row?: Row) {
    if (fail) { setFail(false); throw new Error('합성 저장 실패: 입력은 유지됩니다.'); }
    setData(current => ({ ...current, curriculum_missions: row ? current.curriculum_missions.map(item => item.id === row.id ? { ...item, ...values, archived_at: null } : item) : [...current.curriculum_missions, { id: crypto.randomUUID(), ...values }] }));
    setNotice('저장 완료');
  }
  return <div className="edu-admin" style={{ padding: 24 }}>
    <h1>미션 운영 정합성 QA</h1>
    <p>합성 데이터 · 외부 연결 없음</p>
    <label className="checkline"><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} />저장 실패 시뮬레이션</label>
    <button className="btn primary" onClick={() => setEditor({ context: scope })}>새 미션 등록</button>
    {notice && <p role="status">{notice}</p>}
    <AdminCatalog section={section} data={data} missionScope={scope} onMissionScopeChange={setScope} selection={selection} setSelection={setSelection} edit={(_, row, context) => setEditor({ row, context: context || scope })} archive={() => {}} pending={pending} loading={false} pagination={null} setPage={() => {}} exportCsv={() => {}} send={async body => {
      setPending(true);
      try { await save(body.values as Record<string, unknown>, data.curriculum_missions.find(item => item.id === body.id)); return {}; }
      finally { setPending(false); }
    }} />
    {editor && <Editor section={section} row={editor.row} context={editor.context} data={data} pending={pending} close={() => setEditor(null)} save={async values => { setPending(true); try { await save(values, editor.row); setEditor(null); } finally { setPending(false); } }} />}
  </div>;
}
