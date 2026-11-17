import type { Row } from '@/lib/platform';
import { hasLearningAccess } from '@/lib/platform-rules';

export type CampusAdminSnapshot = {
  schemaVersion: 1;
  fetchedAt: string;
  cohort: { id: string; name: string; courseId: string; courseTitle: string };
  metrics: {
    activeLearners: number; requiredMissions: number; participatingLearners: number;
    allApprovedLearners: number; revisionLearners: number; unstartedLearners: number;
    pendingReviews: number; pendingOver2Days: number; oldestPendingDays: number | null; unknownStatuses: number;
  };
  lessons: {
    id: string; title: string; day: number; requiredMissions: number;
    submittedLearners: number; approvedLearners: number; revisionLearners: number;
    waitingLearners: number; notStartedLearners: number;
  }[];
  queue: {
    enrollmentId: string; displayName: string; lessonId: string; lessonTitle: string;
    missionId: string; missionTitle: string; status: 'submitted' | 'changes_requested' | 'rejected';
    waitingDays: number | null; href: '/admin/reviews';
  }[];
  queueTotal: number;
  definitions: string[];
};
const str = (value: unknown) => typeof value === 'string' ? value : '';
const submittedTime = (row: Row) => Date.parse(str(row.submitted_at));
const known = new Set(['submitted', 'approved', 'changes_requested', 'rejected']);

/** Metrics use distinct active members, not order/enrollment or historical attempt counts. */
export function campusAdminMetrics(input: {
  cohort: Row; course: Row; enrollments: Row[]; profiles: Row[]; weeks: Row[];
  lessons: Row[]; missions: Row[]; submissions: Row[]; now: number;
}): CampusAdminSnapshot {
  const { cohort, course, now } = input;
  const profiles = new Map(input.profiles.filter(p => p.status === 'active').map(p => [p.id, p]));
  const enrollments = input.enrollments.filter(e => e.cohort_id === cohort.id && e.course_id === course.id
    && hasLearningAccess(e, now) && profiles.has(str(e.user_id)));
  const enrollmentById = new Map(enrollments.map(e => [e.id, e]));
  const members = [...new Set(enrollments.map(e => str(e.user_id)))];
  const weekIds = new Set(input.weeks.filter(w => w.course_id === course.id && w.is_published === true).map(w => w.id));
  const lessons = input.lessons.filter(l => weekIds.has(str(l.week_id)) && l.is_published === true)
    .sort((a, b) => Number(a.day_number) - Number(b.day_number) || a.id.localeCompare(b.id));
  const lessonById = new Map(lessons.map(l => [l.id, l]));
  const missions = input.missions.filter(m => lessonById.has(str(m.lesson_id)) && m.is_published === true
    && m.is_required === true && !m.archived_at);
  const missionById = new Map(missions.map(m => [m.id, m]));
  const latestByEnrollment = new Map<string, Row>();
  for (const submission of input.submissions) {
    const enrollment = enrollmentById.get(str(submission.enrollment_id));
    if (!enrollment || !missionById.has(str(submission.mission_id))) continue;
    const key = `${enrollment.id}:${submission.mission_id}`;
    const previous = latestByEnrollment.get(key);
    if (!previous || Number(submission.attempt_number) > Number(previous.attempt_number)) latestByEnrollment.set(key, submission);
  }
  const latest = new Map<string, Row>();
  for (const submission of latestByEnrollment.values()) {
    const enrollment = enrollmentById.get(str(submission.enrollment_id))!;
    const key = `${enrollment.user_id}:${submission.mission_id}`;
    const previous = latest.get(key);
    // Across duplicate active enrollments, the most recent submission is the member's current state.
    const time = submittedTime(submission), oldTime = previous ? submittedTime(previous) : NaN;
    if (!previous || (Number.isFinite(time) && (!Number.isFinite(oldTime) || time > oldTime))
      || (time === oldTime && Number(submission.attempt_number) > Number(previous.attempt_number))
      || (!Number.isFinite(time) && !Number.isFinite(oldTime) && Number(submission.attempt_number) > Number(previous.attempt_number))) latest.set(key, submission);
  }
  const statesFor = (member: string, list: Row[]) => list.map(m => latest.get(`${member}:${m.id}`));
  const counts = (list: Row[]) => {
    const groups = members.map(member => statesFor(member, list));
    return {
      submittedLearners: groups.filter(group => group.some(Boolean)).length,
      approvedLearners: list.length ? groups.filter(group => group.every(s => s?.status === 'approved')).length : 0,
      revisionLearners: groups.filter(group => group.some(s => ['changes_requested', 'rejected'].includes(str(s?.status)))).length,
      waitingLearners: groups.filter(group => group.some(s => s?.status === 'submitted')).length,
      notStartedLearners: list.length ? groups.filter(group => group.every(s => !s)).length : 0,
    };
  };
  const queue: CampusAdminSnapshot['queue'] = [];
  let unknownStatuses = 0;
  for (const submission of latestByEnrollment.values()) {
    if (!known.has(str(submission.status))) { unknownStatuses++; continue; }
    if (submission.status === 'approved') continue;
    const mission = missionById.get(str(submission.mission_id))!;
    const lesson = lessonById.get(str(mission.lesson_id))!;
    const profile = profiles.get(str(enrollmentById.get(str(submission.enrollment_id))!.user_id))!;
    const time = submittedTime(submission);
    const waitingDays = submission.status === 'submitted' && Number.isFinite(time) && time <= now ? Math.floor((now - time) / 86400000) : null;
    queue.push({ enrollmentId: str(submission.enrollment_id), displayName: str(profile.full_name) || '이름 미등록',
      lessonId: lesson.id, lessonTitle: str(lesson.title), missionId: mission.id, missionTitle: str(mission.title),
      status: submission.status as 'submitted' | 'changes_requested' | 'rejected', waitingDays, href: '/admin/reviews' });
  }
  queue.sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted')
    || (b.waitingDays ?? -1) - (a.waitingDays ?? -1) || a.enrollmentId.localeCompare(b.enrollmentId));
  const all = counts(missions), pending = queue.filter(q => q.status === 'submitted');
  const days = pending.flatMap(q => q.waitingDays === null ? [] : [q.waitingDays]);
  return {
    schemaVersion: 1, fetchedAt: new Date(now).toISOString(),
    cohort: { id: cohort.id, name: str(cohort.name), courseId: course.id, courseTitle: str(course.title) },
    metrics: { activeLearners: members.length, requiredMissions: missions.length,
      participatingLearners: all.submittedLearners, allApprovedLearners: all.approvedLearners,
      revisionLearners: all.revisionLearners, unstartedLearners: all.notStartedLearners,
      pendingReviews: pending.length, pendingOver2Days: pending.filter(q => q.waitingDays !== null && q.waitingDays >= 2).length,
      oldestPendingDays: days.length ? Math.max(...days) : null, unknownStatuses },
    lessons: lessons.map(l => { const list = missions.filter(m => m.lesson_id === l.id); return {
      id: l.id, title: str(l.title), day: Number(l.day_number) || 0, requiredMissions: list.length, ...counts(list),
    }; }),
    queue: queue.slice(0, 100), queueTotal: queue.length,
    definitions: [
      '현재 수강 가능한 활성 회원을 중복 없이 집계합니다. 환불·만료·회수·탈퇴 회원은 제외합니다.',
      '공개된 필수 과제의 회원별 최신 제출 기준입니다. 참여는 한 번 이상 제출, 전체 승인은 모든 필수 과제 승인입니다.',
      '검토 대기는 수강권별 최신 제출이 검토 중인 과제 수입니다. 중복 수강권의 미처리 건도 보존합니다. 2일 이상은 제출 시각부터 경과한 기간이며 응답 기한을 뜻하지 않습니다.',
      '미시작은 제출 기록이 없다는 뜻이며 결석·이탈을 의미하지 않습니다. 수업별 상태 인원은 서로 겹칠 수 있습니다.',
      '수강권과 공개 과제가 바뀌면 분모도 달라집니다. 학습 시간·매출·교육 효과의 인과관계는 측정하지 않습니다.',
    ],
  };
}
