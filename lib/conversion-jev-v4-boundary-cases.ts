/** Synthetic, non-customer examples for isolated DEV contract review. */
export const JEV_V4_BOUNDARY_CASES = [
  {
    id: 'free-replay-plus-future-consideration',
    title: '무료 다시보기 오류 + 이후 유료 교육 검토',
    subject: '무료 다시보기 접근 문의',
    content: '무료 강의 다시보기를 누르면 결제 화면이 열립니다. 영상 내용을 확인한 뒤 유료 교육을 들을지 결정하려고 합니다.',
    reviewGuide: '무료 접근 실패와 이후 유료 검토가 동시에 있어도, 유료 신청·결제 시도로 합치지 않는지 확인합니다.',
  },
  {
    id: 'free-replay-only',
    title: '무료 자료 접근만 언급',
    subject: '무료 웨비나 다시보기 문의',
    content: '지난 무료 웨비나 다시보기 주소를 받을 수 있을까요? 유료 교육은 아직 알아보지 않았습니다.',
    reviewGuide: '무료 자료 요청을 유료 구매 의향으로 올려 잡지 않고, 명시된 유료 관심의 부재와 추론을 구분합니다.',
  },
  {
    id: 'paid-price-question-only',
    title: '유료 교육 가격만 질문',
    subject: '수강료 문의',
    content: '문샷 챌린지 수강료가 얼마인가요?',
    reviewGuide: '가격 질문은 정보 탐색으로 기록하되, 비용 부담이나 구매 의향을 자동 추론하지 않는지 확인합니다.',
  },
  {
    id: 'paid-application-failure',
    title: '유료 신청 버튼 실패',
    subject: '유료 과정 신청 오류',
    content: '유료 챌린지 신청 버튼을 눌러 신청 양식을 제출하려 했는데 오류가 나서 완료되지 않았습니다.',
    reviewGuide: '실패한 행동의 대상이 무료 영상이 아니라 유료 신청 양식임을 유지하는지 확인합니다.',
  },
  {
    id: 'free-access-and-no-paid-interest',
    title: '무료 접근 실패, 유료 관심 부정',
    subject: '무료 강의 영상 재생 오류',
    content: '무료 강의 영상이 재생되지 않습니다. 유료 과정은 신청할 생각이 없고 영상만 확인하고 싶습니다.',
    reviewGuide: '무료 운영 문제와 유료 관심 부정 표현을 분리하며 구매 단계나 장애물을 임의로 부여하지 않는지 확인합니다.',
  },
  {
    id: 'conditional-paid-interest',
    title: '무료 강의 이후 조건부 신청 고려',
    subject: '무료 수업 이후 유료 과정 검토',
    content: '무료 수업을 들어 보고 제 업종에 맞으면 유료 과정도 신청할 생각입니다. 먼저 다루는 내용을 확인하고 싶습니다.',
    reviewGuide: '조건부 관심과 이미 발생한 유료 신청·결제 행동을 구분하는지 확인합니다.',
  },
  {
    id: 'ambiguous-link-failure',
    title: '대상이 불분명한 링크 오류',
    subject: '링크 오류',
    content: '보내 주신 링크를 눌렀는데 다음 화면으로 넘어가지 않습니다. 어떤 링크였는지는 기억나지 않습니다.',
    reviewGuide: '무료·유료 행동 대상이 확인되지 않는 경우 결과를 단정하지 않고 불확실성을 표시하는지 확인합니다.',
  },
  {
    id: 'schedule-evaluation-not-barrier',
    title: '일정 확인과 명시 장애물 구분',
    subject: '모집 마감일 문의',
    content: '신청 마감이 언제인가요? 일정이 맞으면 참여를 검토하고 싶습니다. 아직 참여할 수 없는 시간대가 정해진 것은 아닙니다.',
    reviewGuide: '일정 문의·조건 검토를 직접 밝힌 일정 충돌과 구분하는지 확인합니다.',
  },
] as const;

export type JevV4BoundaryCaseId = typeof JEV_V4_BOUNDARY_CASES[number]['id'];
