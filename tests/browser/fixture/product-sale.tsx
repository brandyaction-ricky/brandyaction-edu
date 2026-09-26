import { useState } from 'react';
import { ProductEditor } from '../../../app/ui/final/admin-editors';
import '../../../app/ui/final/product-editor.css';

export function ProductSaleFixture() {
  const [saves, setSaves] = useState(0);
  const [savedCountdown, setSavedCountdown] = useState<unknown>();
  const ready = new URLSearchParams(location.search).has('ready');
  const course = { id: 'synthetic-course', title: '합성 판매 점검 상품', slug: 'synthetic', category: 'paid_class', status: 'published', list_price: 100000, description: '합성 상세', duration_label: '4주', schedule_label: '매주', metadata: {} };
  const data = { courses: [course], cohorts: [{ id: 'synthetic-cohort', course_id: course.id, name: '합성 4기', status: 'upcoming', price: 100000, recruitment_end_at: '2099-10-01T14:59:00Z' }], curriculum_weeks: ready ? [{ id: 'week', course_id: course.id, is_published: true }] : [], curriculum_lessons: ready ? [{ id: 'lesson', week_id: 'week', is_published: true }] : [] };
  return <div className="edu-admin" style={{ padding: 20 }}><output aria-label="합성 저장 횟수">{saves}</output><output aria-label="저장한 카운트다운 설정">{String(savedCountdown)}</output><ProductEditor row={course} data={data} pending={false} back={() => {}} send={async payload => { setSaves(value => value + 1); setSavedCountdown((payload.values as Record<string, unknown>)?.recruitment_countdown_enabled); return {}; }} /></div>;
}
