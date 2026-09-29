import { useState } from 'react';
import { ProductEditor } from '../../../app/ui/final/admin-editors';
import type { Row } from '../../../lib/platform';
import '../../../app/ui/final/product-editor.css';

export function ProductSaleFixture() {
  const [saves, setSaves] = useState(0);
  const [resourceMutation, setResourceMutation] = useState<Record<string, unknown> | null>(null);
  const [resources, setResources] = useState(new URLSearchParams(location.search).has('resources') ? [{ id: '11111111-1111-4111-8111-111111111111', name: '과정 교재.pdf', path: 'edu/11111111-1111-4111-8111-111111111111.pdf', scope: 'purchaser' }] : []);
  const [savedCountdown, setSavedCountdown] = useState<unknown>();
  const [cohortSaves, setCohortSaves] = useState(0);
  const [cohortMutation, setCohortMutation] = useState<Record<string, unknown> | null>(null);
  const [missionSaves, setMissionSaves] = useState(0);
  const [missionMutation, setMissionMutation] = useState<Record<string, unknown> | null>(null);
  const [curriculumSaves, setCurriculumSaves] = useState(0);
  const [curriculumMutation, setCurriculumMutation] = useState<Record<string, unknown> | null>(null);
  const [archiveMutation, setArchiveMutation] = useState<Record<string, unknown> | null>(null);
  const [extraCohorts, setExtraCohorts] = useState<Row[]>([]);
  const params = new URLSearchParams(location.search);
  const missing = params.has("missing");
  const [cohortOverrides, setCohortOverrides] = useState<Record<string, unknown>>({});
  const ready = new URLSearchParams(location.search).has('ready');
  const course = { id: 'synthetic-course', title: '합성 판매 점검 상품', slug: 'synthetic', category: new URLSearchParams(location.search).has('digital') ? 'digital' : 'paid_class', status: new URLSearchParams(location.search).has('draft') ? 'draft' : 'published', list_price: 100000, description: missing ? '' : '합성 상세', duration_label: missing ? '' : '4주', schedule_label: missing ? '' : '매주', metadata: { product_resources: resources } };
  const [weeks, setWeeks] = useState<Row[]>([{ id: 'synthetic-week', course_id: course.id, is_published: ready }]);
  const [lessons, setLessons] = useState<Row[]>([{ id: 'synthetic-lesson', week_id: 'synthetic-week', is_published: ready }]);
  const data = { courses: [course], cohorts: [{ id: 'synthetic-cohort', course_id: course.id, name: '합성 4기', cohort_code: 'FOURTH', status: 'upcoming', price: 100000, recruitment_end_at: params.has('expired') ? '2020-10-01T14:59:00Z' : '2099-10-01T14:59:00Z', ...(params.has('closed') ? { status: 'closed' } : {}), ...cohortOverrides }, ...extraCohorts], curriculum_weeks: weeks, curriculum_lessons: lessons };
  if (params.has('new')) data.cohorts = [];
  return <div className="edu-admin" style={{ padding: 20, overflowWrap: "anywhere" }}><output aria-label="합성 자료 요청">{JSON.stringify(resourceMutation)}</output><output aria-label="저장한 카운트다운 설정">{String(savedCountdown)}</output><output aria-label="합성 저장 횟수">{saves}</output><output aria-label="합성 기수 저장 횟수">{cohortSaves}</output><output aria-label="합성 기수 요청">{JSON.stringify(cohortMutation)}</output><output aria-label="합성 미션 저장 횟수">{missionSaves}</output><output aria-label="합성 미션 요청">{JSON.stringify(missionMutation)}</output><output aria-label="합성 커리큘럼 저장 횟수">{curriculumSaves}</output><output aria-label="합성 커리큘럼 요청">{JSON.stringify(curriculumMutation)}</output><output aria-label="합성 보관 요청">{JSON.stringify(archiveMutation)}</output><ProductEditor row={params.has('new') ? undefined : course} data={data} pending={false} back={() => {}} send={async body => {
    if (body.action === 'set-curriculum-archive') {
      setArchiveMutation(body);
      const id = String(body.id);
      const archive = Boolean(body.archived);
      if (body.kind === 'week') setWeeks(rows => rows.map(row => row.id === id ? { ...row, archived_at: archive ? '2026-09-29T00:00:00Z' : null, is_published: false } : row));
      if (body.kind === 'lesson') setLessons(rows => rows.map(row => row.id === id ? { ...row, archived_at: archive ? '2026-09-29T00:00:00Z' : null, is_published: false } : row));
      return { ok: true };
    }
    if (body.action === 'save-product-resource') {
      setResourceMutation(body);
      setResources(rows => rows.map(row => row.id === body.resourceId ? { ...row, name: String(body.resourceName), scope: String(body.accessScope) } : row));
      return {};
    }
    if (body.section === 'weeks' || body.section === 'learning') {
      setCurriculumSaves(value => value + 1);
      setCurriculumMutation(body);
      const update = (rows: Row[]) => rows.map(row => row.id === body.id ? { ...row, ...(body.values as Record<string, unknown>) } : row);
      if (body.section === 'weeks') setWeeks(update);
      else setLessons(update);
      return { row: { ...(body.values as Record<string, unknown>), id: body.id } };
    }
    if (body.section === 'cohorts') {
      setCohortSaves(value => value + 1);
      setCohortMutation(body);
      const row = { ...(body.values as Record<string, unknown>), id: String(body.id || 'synthetic-added-cohort') };
      if (body.id === 'synthetic-cohort') setCohortOverrides(current => ({ ...current, ...(body.values as Record<string, unknown>) }));
      if (!body.id) setExtraCohorts(value => [...value, row]);
      return { row };
    }
    if (body.section === 'missions') {
      setMissionSaves(value => value + 1);
      setMissionMutation(body);
      return { row: { ...(body.values as Record<string, unknown>), id: String(body.id || 'synthetic-added-mission') } };
    }
    setSaves(value => value + 1); setSavedCountdown((body.values as Record<string, unknown>)?.recruitment_countdown_enabled); return {};
  }} /></div>;
}
