export type FunnelCourse = { id: string; title: string };
export type FunnelCohort = { id: string; course_id: string; name: string };
export type FunnelDraft = {
  freeCourseId: string;
  freeCohortId: string;
  paidCourseId: string;
  paidCohortId: string;
};

export const EMPTY_FUNNEL_DRAFT: FunnelDraft = {
  freeCourseId: '', freeCohortId: '', paidCourseId: '', paidCohortId: '',
};

// Catalog membership is separate from verified pricing and live measurement.
// This check never authorizes publication, tracking or experiment execution.
export function validateFunnelDraft(draft: FunnelDraft, courses: FunnelCourse[], cohorts: FunnelCohort[]) {
  const issues: string[] = [];
  for (const [kind, courseId, cohortId] of [
    ['무료', draft.freeCourseId, draft.freeCohortId],
    ['유료', draft.paidCourseId, draft.paidCohortId],
  ]) {
    if (!courses.some(course => course.id === courseId)) issues.push(`${kind} 교육 상품을 선택해 주세요.`);
    if (!cohortId) issues.push(`${kind} 교육의 회차·기수를 선택해 주세요.`);
    else if (!cohorts.some(cohort => cohort.id === cohortId && cohort.course_id === courseId)) {
      issues.push(`${kind} 교육의 회차·기수가 선택한 상품과 맞지 않습니다.`);
    }
  }
  if (draft.freeCourseId && draft.freeCourseId === draft.paidCourseId) {
    issues.push('무료 교육과 유료 교육은 서로 다른 상품으로 연결해 주세요.');
  }
  return { valid: issues.length === 0, issues };
}

export const FUNNEL_MEASUREMENT_STEPS = [
  { id: 'landing', label: '모집 페이지', evidence: '대상 페이지 방문과 모집 자료 버전' },
  { id: 'signup', label: '무료 신청', evidence: '신청 완료 기록 · 참여 버튼 클릭과 구분' },
  { id: 'attendance', label: '실제 참여', evidence: '해당 회차의 참여 증거 · 외부 라이브는 별도 확인' },
  { id: 'offer', label: '유료 교육 안내', evidence: '안내 내용의 버전과 실제 노출 기록' },
  { id: 'purchase', label: '유료 구매', evidence: '대상 상품·기수의 결제 확정 기록' },
  { id: 'refund', label: '환불 확인', evidence: '부분 환불을 포함한 주문 원장과 집계 기준일' },
] as const;
