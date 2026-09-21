export type FunnelCourse = { id: string; title: string };
export type FunnelCohort = { id: string; course_id: string; name: string };
export type FunnelDraft = {
  freeCourseId: string;
  paidCourseId: string;
  paidCohortId: string;
};

export const EMPTY_FUNNEL_DRAFT: FunnelDraft = {
  freeCourseId: '', paidCourseId: '', paidCohortId: '',
};

// Catalog membership is separate from verified pricing and live measurement.
// This check never authorizes publication, tracking or experiment execution.
export function validateFunnelDraft(draft: FunnelDraft, courses: FunnelCourse[], cohorts: FunnelCohort[]) {
  const issues: string[] = [];
  for (const [kind, courseId] of [['무료', draft.freeCourseId], ['유료', draft.paidCourseId]]) {
    if (!courses.some(course => course.id === courseId)) issues.push(`${kind} 교육 상품을 선택해 주세요.`);
  }
  if (!draft.paidCohortId) issues.push('유료 교육의 회차·기수를 선택해 주세요.');
  else if (!cohorts.some(cohort => cohort.id === draft.paidCohortId && cohort.course_id === draft.paidCourseId)) {
    issues.push('유료 교육의 회차·기수가 선택한 상품과 맞지 않습니다.');
  }
  if (draft.freeCourseId && draft.freeCourseId === draft.paidCourseId) {
    issues.push('무료 교육과 유료 교육은 서로 다른 상품으로 연결해 주세요.');
  }
  return { valid: issues.length === 0, issues };
}

export const FUNNEL_FLOW_VERSION = 2;
export const FUNNEL_ACQUISITION_CHANNELS = [
  { id: 'paid', label: '광고', evidence: '광고·캠페인별 유입 링크', room: '광고 전용 오픈채팅방' },
  { id: 'organic', label: '오가닉 콘텐츠', evidence: '콘텐츠·게시물별 유입 링크', room: '오가닉 전용 오픈채팅방' },
] as const;

export const FUNNEL_MEASUREMENT_STEPS = [
  { id: 'landing', label: '유입 경로', evidence: '광고 / 오가닉 구분 · 출처가 없으면 미확인으로 보존' },
  { id: 'chat_click', label: '카톡방 이동', evidence: '유입 링크 클릭 · 실제 입장과 구분' },
  { id: 'chat_join', label: '카톡방 입장', evidence: '입장 확인 근거가 있을 때만 집계 · 닉네임으로 회원을 추정하지 않음' },
  { id: 'signup', label: '무료 신청', evidence: '사이트 신청 완료 기록 · 카톡방 입장과 별도 확인' },
  { id: 'attendance', label: '무료 웨비나 참여', evidence: 'YouTube Live 참여 증거 · 링크 클릭만으로 시청 완료를 판단하지 않음' },
  { id: 'purchase', label: '1차 유료 전환', evidence: '문샷 챌린지 4기 결제 확정 · 안내 노출과 거래 구분' },
  { id: 'crm', label: '후속 CRM', evidence: '미구매자 대상·수신 동의 확인 · 발송 직전 구매자 제외 · 전달/열람 구분' },
  { id: 'encore', label: '앵콜 라이브 참여', evidence: '앵콜 YouTube Live 참여 증거 · 최초 라이브 중복 참여자는 별도 구분' },
  { id: 'encore_purchase', label: '2차 유료 전환', evidence: '동일 4기 추가 모집 기준 · 관찰 기간 확정 후 집계 · 주문 중복 집계 금지' },
  { id: 'refund', label: '환불 확인', evidence: '1·2차 구매의 주문 원장 · 부분 환불과 집계 기준일' },
] as const;
