import { MemberViews } from '../../../app/ui/final/member-views';
import type { Row } from '../../../lib/platform';
import type { LessonGate } from '../../../lib/learning-overview';
import { withExistingCohortVisibility } from './cohort-visibility';

export function LearningOverviewFixture() {
  const params = new URLSearchParams(location.search), scenario = params.get('scenario');
  const enrollment: Row = { id: 'sample-enrollment', user_id: 'sample-user', course_id: 'sample-course', cohort_id: 'sample-cohort', status: 'active' };
  const gates: LessonGate[] = ['daily', 'learning'].flatMap(track => Array.from({ length: 30 }, (_, index) => ({
    lessonId: `${track}-${index + 1}`, track: track as 'daily' | 'learning', dayNumber: index + 1,
    isUnlocked: scenario === 'complete' || (scenario !== 'locked' && index < (track === 'daily' ? 5 : 2)),
    automaticApproval: false, reason: track === 'daily' ? '운영자가 다음 주차를 열면 시작할 수 있습니다.' : '이전 학습을 완료해 주세요.',
  })));
  gates.push({ lessonId: 'intro', track: null, dayNumber: null, isUnlocked: true, automaticApproval: false, reason: '' }, { lessonId: 'ongoing', track: null, dayNumber: null, ongoing: true, isUnlocked: true, automaticApproval: false, reason: '' });
  const progress = gates.filter(gate => gate.ongoing || (gate.track && (scenario === 'complete' || (scenario !== 'locked' && Number(gate.dayNumber) <= (gate.track === 'daily' ? 5 : 1))))).map(gate => ({ id: 'p-' + gate.lessonId, enrollment_id: enrollment.id, lesson_id: gate.lessonId, completed_at: '2026-01-01' }));
  const data: Record<string, Row[]> = {
    enrollments: [enrollment], courses: [{ id: 'sample-course', title: '합성 문샷 과정', category: 'paid_class' }], cohorts: [{ id: 'sample-cohort', name: '합성 기수' }],
    curriculum_weeks: [{ id: 'sample-week', course_id: enrollment.course_id, week_number: 0, is_published: true }],
    curriculum_lessons: gates.map(gate => ({ id: gate.lessonId, week_id: 'sample-week', day_number: gate.track === 'learning' ? Number(gate.dayNumber) + 30 : gate.dayNumber || 0, title: gate.track ? `${gate.track === 'daily' ? '데일리' : '학습'} ${gate.dayNumber}일차` : gate.ongoing ? '매주 실천 기록' : '온보딩 안내', is_published: true })),
    lesson_progress: progress,
    learning_overviews: scenario === 'missing' ? [] : [{ id: enrollment.id, status: scenario === 'error' ? 'error' : 'ready', lessons: gates }],
  };
  if (scenario === 'multiple') {
    data.enrollments.push({ ...enrollment, id: 'second', course_id: 'second-course', cohort_id: 'second-cohort' }, { ...enrollment, id: 'expired', status: 'revoked' });
    data.courses.push({ id: 'second-course', title: '독립된 다른 과정' });
    data.cohorts.push({ id: 'second-cohort', course_id: 'second-course', name: '별도 기수' });
    data.curriculum_weeks.push({ id: 'second-week', course_id: 'second-course', week_number: 1, is_published: true });
    data.curriculum_lessons.push({ id: 'second-lesson', week_id: 'second-week', day_number: 1, title: '두 번째 과정 시작', is_published: true });
    data.learning_overviews.push({ id: 'second', status: 'ready', lessons: [{ ...gates[0], lessonId: 'second-lesson' }] });
  }
  return <main className="edu-front"><MemberViews section={params.get('view') || 'dashboard'} data={withExistingCohortVisibility(data)} user={{ id: 'sample-user', full_name: '학습 QA 회원', email: 'learner@example.test', role: params.get('role') === 'admin' ? 'admin' : params.get('role') === 'staff' ? 'staff' : 'member', phone: null }} pending={false} send={async () => ({})} logout={async () => {}} blockLearningEnabled={scenario !== 'legacy'}/></main>;
}
