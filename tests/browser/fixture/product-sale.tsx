import { useState } from 'react';
import { ProductEditor } from '../../../app/ui/final/admin-editors';
import type { Row } from '../../../lib/platform';
import '../../../app/ui/final/product-editor.css';

export function ProductSaleFixture() {
  const [saves, setSaves] = useState(0);
  const [cohortSaves, setCohortSaves] = useState(0);
  const [cohortMutation, setCohortMutation] = useState<Record<string, unknown> | null>(null);
  const [missionSaves, setMissionSaves] = useState(0);
  const [missionMutation, setMissionMutation] = useState<Record<string, unknown> | null>(null);
  const [curriculumSaves, setCurriculumSaves] = useState(0);
  const [curriculumMutation, setCurriculumMutation] = useState<Record<string, unknown> | null>(null);
  const [extraCohorts, setExtraCohorts] = useState<Row[]>([]);
  const ready = new URLSearchParams(location.search).has('ready');
  const course = { id: 'synthetic-course', title: '합성 판매 점검 상품', slug: 'synthetic', category: 'paid_class', status: 'published', list_price: 100000, description: '합성 상세', duration_label: '4주', schedule_label: '매주', metadata: {} };
  const data = { courses: [course], cohorts: [{ id: 'synthetic-cohort', course_id: course.id, name: '합성 4기', cohort_code: 'FOURTH', status: 'upcoming', price: 100000, recruitment_end_at: '2099-10-01T14:59:00Z' }, ...extraCohorts], curriculum_weeks: ready ? [{ id: 'week', course_id: course.id, is_published: true }] : [], curriculum_lessons: ready ? [{ id: 'lesson', week_id: 'week', is_published: true }] : [] };
  return <div className="edu-admin" style={{ padding: 20 }}><output aria-label="합성 저장 횟수">{saves}</output><output aria-label="합성 기수 저장 횟수">{cohortSaves}</output><output aria-label="합성 기수 요청">{JSON.stringify(cohortMutation)}</output><output aria-label="합성 미션 저장 횟수">{missionSaves}</output><output aria-label="합성 미션 요청">{JSON.stringify(missionMutation)}</output><output aria-label="합성 커리큘럼 저장 횟수">{curriculumSaves}</output><output aria-label="합성 커리큘럼 요청">{JSON.stringify(curriculumMutation)}</output><ProductEditor row={course} data={data} pending={false} back={() => {}} send={async body => {
    if (body.section === 'weeks' || body.section === 'learning') {
      setCurriculumSaves(value => value + 1);
      setCurriculumMutation(body);
      return { row: { ...(body.values as Record<string, unknown>), id: body.id } };
    }
    if (body.section === 'cohorts') {
      setCohortSaves(value => value + 1);
      setCohortMutation(body);
      const row = { ...(body.values as Record<string, unknown>), id: String(body.id || 'synthetic-added-cohort') };
      if (!body.id) setExtraCohorts(value => [...value, row]);
      return { row };
    }
    if (body.section === 'missions') {
      setMissionSaves(value => value + 1);
      setMissionMutation(body);
      return { row: { ...(body.values as Record<string, unknown>), id: String(body.id || 'synthetic-added-mission') } };
    }
    setSaves(value => value + 1); return {};
  }} /></div>;
}
