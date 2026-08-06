export type Session = { title: string; output: string; date: string; description: string };
export type CurriculumLesson = {
  id: string;
  day: number;
  title: string;
  description: string;
  kind: "VOD" | "자료";
  duration: string;
  contentUrl?: string;
  resourceName?: string;
  resourceUrl?: string;
  resourcePath?: string;
};
export type CurriculumWeek = {
  id: string;
  label: string;
  title: string;
  goal: string;
  lessons: CurriculumLesson[];
};
export type ClassItem = {
  slug: string; title: string; summary: string; category: string; status: string;
  statusTone: "red" | "blue" | "gray"; startDate: string; operationPeriod?: string; schedule: string;
  duration: string; price: string; seats: string; instructor: string; accent: string;
  sessions: Session[];
  curriculum?: CurriculumWeek[];
};

export const classes: ClassItem[] = [
  {
    slug: "local-marketing", title: "매출을 만드는 자영업 마케팅 실전반", summary: "내 매장에 맞는 고객과 매출 구조를 4주 안에 설계합니다.",
    category: "마케팅", status: "1기 모집 중", statusTone: "red", startDate: "2026. 08. 19", operationPeriod: "2026. 08. 19 — 09. 09", schedule: "매주 수요일 20:00", duration: "4주 LIVE", price: "1,490,000원", seats: "잔여 7석", instructor: "리키", accent: "red",
    sessions: [
      { title: "고객 발견과 포지셔닝", output: "우리 매장 고객 정의", date: "8.19 (수) 20:00", description: "팔고 싶은 사람이 아닌 실제로 살 가능성이 높은 고객을 정의합니다." },
      { title: "매출 퍼널 설계", output: "매출 구조 맵", date: "8.26 (수) 20:00", description: "유입부터 재구매까지 끊긴 구간을 찾고 연결합니다." },
      { title: "콘텐츠 전략과 제작", output: "주간 콘텐츠 캘린더", date: "9.02 (수) 20:00", description: "고객의 행동을 이끄는 주제와 포맷을 만듭니다." },
      { title: "광고 운영과 최적화", output: "30일 광고 테스트 플랜", date: "9.09 (수) 20:00", description: "작은 예산으로 검증하고 확장하는 광고 기준을 세웁니다." },
    ],
  },
];

export const featuredClass = classes[0];

export const defaultCurriculum: CurriculumWeek[] = [
  {
    id: "week-1", label: "1주차", title: "고객 발견과 포지셔닝", goal: "우리 매장 핵심 고객 정의",
    lessons: [
      { id: "day-1", day: 1, title: "오리엔테이션 · 현재 매출 구조 진단", description: "4주 동안 바꿔야 할 핵심 지표와 실행 순서를 정합니다.", kind: "VOD", duration: "18분", contentUrl: "" },
      { id: "day-2", day: 2, title: "내 고객이 아닌 사람부터 제거하기", description: "모두를 설득하려는 메시지에서 벗어나 핵심 고객의 범위를 좁힙니다.", kind: "VOD", duration: "22분", contentUrl: "" },
      { id: "day-3", day: 3, title: "고객의 구매 욕구와 실제 언어 찾기", description: "후기와 상담 기록에서 고객이 반응하는 표현을 수집합니다.", kind: "자료", duration: "워크시트", resourceName: "고객_언어_수집_워크시트.pdf" },
    ],
  },
  {
    id: "week-2", label: "2주차", title: "매출 퍼널 설계", goal: "유입부터 재구매까지 매출 구조 맵",
    lessons: [
      { id: "day-4", day: 4, title: "현재 고객 여정과 이탈 구간 표시하기", description: "유입·문의·구매·재구매 단계의 실제 전환을 확인합니다.", kind: "VOD", duration: "24분", contentUrl: "" },
      { id: "day-5", day: 5, title: "첫 구매를 만드는 오퍼 구조", description: "고객이 지금 행동해야 하는 이유와 진입 상품을 설계합니다.", kind: "VOD", duration: "27분", contentUrl: "" },
      { id: "day-6", day: 6, title: "우리 매장 퍼널 맵 작성", description: "채널별 고객 행동과 다음 전환 장치를 한 장으로 정리합니다.", kind: "자료", duration: "템플릿", resourceName: "매출_퍼널맵_템플릿.xlsx" },
    ],
  },
  {
    id: "week-3", label: "3주차", title: "콘텐츠 전략과 제작", goal: "고객 행동을 이끄는 주간 콘텐츠 캘린더",
    lessons: [
      { id: "day-7", day: 7, title: "팔리는 콘텐츠 주제 3가지", description: "고객의 문제·욕구·반박을 기준으로 핵심 주제를 정합니다.", kind: "VOD", duration: "21분", contentUrl: "" },
      { id: "day-8", day: 8, title: "채널별 콘텐츠 포맷 선택", description: "블로그·인스타그램·유튜브 중 전환에 맞는 형식을 고릅니다.", kind: "VOD", duration: "19분", contentUrl: "" },
      { id: "day-9", day: 9, title: "7일 콘텐츠 캘린더 만들기", description: "주제와 CTA가 연결된 일주일 실행안을 완성합니다.", kind: "자료", duration: "템플릿", resourceName: "7일_콘텐츠_캘린더.xlsx" },
    ],
  },
  {
    id: "week-4", label: "4주차", title: "광고 운영과 최적화", goal: "30일 광고 테스트 플랜",
    lessons: [
      { id: "day-10", day: 10, title: "광고 전에 확인할 전환 기준", description: "클릭보다 매출에 가까운 핵심 지표와 목표값을 정합니다.", kind: "VOD", duration: "20분", contentUrl: "" },
      { id: "day-11", day: 11, title: "작은 예산으로 광고 세팅하기", description: "소재·타깃·예산을 한 번에 하나씩 검증하는 구조를 만듭니다.", kind: "VOD", duration: "28분", contentUrl: "" },
      { id: "day-12", day: 12, title: "30일 테스트 플랜 완성", description: "중단·유지·증액 조건이 포함된 광고 운영표를 작성합니다.", kind: "자료", duration: "실행표", resourceName: "30일_광고_테스트_플랜.xlsx" },
    ],
  },
];
