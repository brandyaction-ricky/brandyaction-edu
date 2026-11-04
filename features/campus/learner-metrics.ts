import type { CampusMission, CampusSnapshot } from './contracts';

export type LearnerNextAction = {
  kind: 'revision' | 'start_mission' | 'continue_lesson';
  lessonId: string;
  missionId?: string;
  day: number;
  title: string;
  description: string;
  href: string;
};
export type LearnerMilestone = {
  id: 'first' | 'half' | 'all';
  title: string;
  description: string;
  earned: boolean;
};
export type LearnerProgressStep = {
  lessonId: string;
  day: number;
  title: string;
  href: string;
  completed: boolean;
  approvedRequired: number;
  totalRequired: number;
  status: 'revision' | 'waiting' | 'ready' | 'in_progress' | 'complete' | 'not_started' | 'unknown';
};
export type LearnerMetrics = {
  completedLessons: number;
  totalLessons: number;
  approvedRequired: number;
  totalRequired: number;
  approvalPercent: number | null;
  submittedCount: number;
  revisionCount: number;
  unknownCount: number;
  nextActions: LearnerNextAction[];
  milestones: LearnerMilestone[];
  steps: LearnerProgressStep[];
  reportText: string;
};

type Lesson = CampusSnapshot['lessons'][number];
const revising = (mission: CampusMission) => ['changes_requested', 'rejected'].includes(mission.status);

// Transport normally contains unique IDs. Duplicate rows must not inflate a student's result.
// Conflicting duplicate statuses are unconfirmed; neither row can earn a milestone.
function uniqueLessons(source: Lesson[]): Lesson[] {
  const lessons = new Map<string, Lesson>();
  const missions = new Map<string, CampusMission>();
  for (const incoming of source) {
    let lesson = lessons.get(incoming.id);
    if (!lesson) {
      lesson = { ...incoming, missions: [] };
      lessons.set(incoming.id, lesson);
    } else {
      lesson.completed = lesson.completed && incoming.completed;
    }
    for (const item of incoming.missions) {
      const existing = missions.get(item.id);
      if (existing) {
        if (existing.status !== item.status || existing.version !== item.version) existing.status = 'unknown';
        existing.required ||= item.required;
      } else {
        const mission = { ...item };
        missions.set(item.id, mission);
        lesson.missions.push(mission);
      }
    }
  }
  return [...lessons.values()].sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
}

function asOfLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(date) + ' KST'
    : '조회 시각 확인 필요';
}

/** Derived from the latest authorized snapshot. No score, rank, study time, or revenue is invented. */
export function learnerMetrics(snapshot: CampusSnapshot): LearnerMetrics {
  const lessons = uniqueLessons(snapshot.lessons);
  const missions = lessons.flatMap(lesson => lesson.missions);
  const required = missions.filter(mission => mission.required);
  const totalRequired = required.length;
  const approvedRequired = required.filter(mission => mission.status === 'approved').length;
  const completedLessons = lessons.filter(lesson => lesson.completed).length;
  const submittedCount = missions.filter(mission => mission.status === 'submitted').length;
  const revisionCount = missions.filter(revising).length;
  const unknownCount = missions.filter(mission => mission.status === 'unknown').length;
  const approvalPercent = totalRequired ? Math.round(approvedRequired / totalRequired * 100) : null;
  const nextActions: LearnerNextAction[] = [];
  const steps: LearnerProgressStep[] = lessons.map(lesson => {
    const needed = lesson.missions.filter(mission => mission.required);
    const approved = needed.filter(mission => mission.status === 'approved').length;
    const base = { lessonId: lesson.id, day: lesson.day };
    for (const mission of lesson.missions) {
      if (revising(mission)) nextActions.push({ ...base, missionId: mission.id, kind: 'revision', title: mission.title,
        description: '검토 의견을 확인하고 과제를 보완해 주세요.', href: mission.href });
      else if (mission.required && mission.status === 'not_started') nextActions.push({ ...base, missionId: mission.id, kind: 'start_mission', title: mission.title,
        description: '수업 내용을 적용해 필수 과제를 제출해 보세요.', href: mission.href });
    }
    if (!lesson.completed) nextActions.push({ ...base, kind: 'continue_lesson', title: lesson.title,
      description: '수업을 이어서 보고 배운 내용을 정리해 보세요.', href: lesson.href });
    const status: LearnerProgressStep['status'] = lesson.missions.some(m => m.status === 'unknown') ? 'unknown'
      : lesson.missions.some(revising) ? 'revision'
      : lesson.missions.some(m => m.status === 'submitted') ? 'waiting'
      : lesson.completed && approved === needed.length ? 'complete'
      : needed.some(m => m.status === 'not_started') ? 'ready'
      : lesson.missions.some(m => m.status === 'approved') ? 'in_progress' : 'not_started';
    return { ...base, title: lesson.title, href: lesson.href, completed: lesson.completed,
      approvedRequired: approved, totalRequired: needed.length, status };
  });
  const priority: Record<LearnerNextAction['kind'], number> = { revision: 0, start_mission: 1, continue_lesson: 2 };
  nextActions.sort((a, b) => priority[a.kind] - priority[b.kind] || a.day - b.day || a.lessonId.localeCompare(b.lessonId));
  const confirmed = totalRequired > 0 && unknownCount === 0;
  const milestones: LearnerMilestone[] = [
    { id: 'first', title: '첫 실행의 증거', description: '공개된 필수 미션 1개 이상 승인', earned: confirmed && approvedRequired >= 1 },
    { id: 'half', title: '반환점 통과', description: '공개된 필수 미션의 절반 이상 승인', earned: confirmed && approvedRequired >= Math.ceil(totalRequired / 2) },
    { id: 'all', title: '필수 미션 완주', description: '현재 공개된 필수 미션 모두 승인', earned: confirmed && approvedRequired === totalRequired },
  ];
  const scope = snapshot.scopes.find(item => item.enrollmentId === snapshot.selectedEnrollmentId);
  const reportText = [
    '나의 문샷 성장 기록',
    `${snapshot.viewer.displayName} · ${[scope?.courseTitle, scope?.cohortName].filter(Boolean).join(' / ') || '선택한 과정 없음'}`,
    `조회 기준: ${asOfLabel(snapshot.fetchedAt)}`,
    `수업 완료: ${completedLessons} / ${lessons.length}개`,
    `필수 미션 승인: ${approvedRequired} / ${totalRequired}개${approvalPercent === null ? ' (필수 미션 없음)' : ` (${approvalPercent}%)`}`,
    `검토 대기: ${submittedCount}개 · 보완할 과제: ${revisionCount}개 · 상태 확인 필요: ${unknownCount}개`,
    '현재 공개된 수업과 미션의 최신 제출 상태 기준입니다. 과거 기간의 성과 추이나 실제 사업 매출을 뜻하지 않습니다.',
  ].join('\n');
  return { completedLessons, totalLessons: lessons.length, approvedRequired, totalRequired, approvalPercent,
    submittedCount, revisionCount, unknownCount, nextActions, milestones, steps, reportText };
}
