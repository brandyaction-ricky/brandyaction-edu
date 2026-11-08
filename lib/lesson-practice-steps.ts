import type { PublicLessonBlock } from './lesson-blocks';
import { lessonEmbeddedImageIds } from './lesson-toggle-images';
import { lessonImageRows } from './lesson-image-row';

// Cohorts 3, 4 and 5 share one authored lesson. The private DEV mirror
// preserves its block identities; the normal classroom does not paginate.
const moonshotDayOne: readonly (readonly [string, string])[] = [
    ['4c84becb-6361-4cc4-96cc-8a71329d2c13', '10초 답변 조교 사용법 살펴보기'],
    ['85232adb-66b5-4d7a-a038-429f5f288f15', '클로드에 답변 조교 연결하기'],
    ['ffd51bb2-8a9f-43e6-90b3-e38b1fd301e8', '막힌 화면을 캡처해 질문하기'],
    ['a844519d-ef39-44b4-9ed0-39021955487b', '오리엔테이션 다시 보기'],
    ['a3aeccd1-9fd2-425c-a2ad-153386d90cb8', '오늘 만들 AI 작업실 살펴보기'],
    ['8dc6ac15-a68e-4b07-9ca4-915cb64af2a1', '클로드 데스크톱 설치하고 로그인하기'],
    ['e3cd0364-9542-4b12-a292-a5df1ca3cf71', '내게 필요한 클로드 요금제 확인하기'],
    ['82472636-f8c4-4ea0-b48f-20a908a56591', 'Pro 결제하고 적용 확인하기'],
    ['f1bd6eb8-36e2-45fe-8bb9-8a94a97c1f8b', '어사이드의 역할 알아보기'],
    ['6b5a7ea7-bb1c-4f64-98d2-77aa1fcd1928', '어사이드 설치하고 로그인하기'],
    ['9e21911c-015e-47dd-a287-0cdf48f07c6c', '기존 크롬 프로필 가져오기'],
    ['95278b44-77b2-4907-b7c0-561b3cdfe989', '비밀번호 가져오기 건너뛰고 클로드 연결하기'],
    ['d6e3e523-f02b-42b2-998f-256217940a95', '어사이드의 클로드 모델 설정 확인하기'],
    ['402e820c-e098-4aec-8ded-d0cae0b16d63', '옵시디언 설치하기'],
    ['c90a5418-c42f-4e75-9872-6d377971d539', '볼트 만들고 첫 메모 작성하기'],
    ['c3f35ed0-1c2c-47d7-96e5-bb4c5e9832f6', '클로드 프로젝트 만들기'],
    ['06c8168b-54c3-472c-a74c-cfcccf79f3ac', '볼트 연결하고 양쪽에서 메모 확인하기'],
    ['44ad7524-2cf1-42a3-970f-bbdcdfa40941', '연결이 안 될 때 점검하기'],
    ['f3619ada-af38-4a63-a57a-1d73b4388ae8', '토큰과 사용량 한도 이해하기'],
    ['fb23fc28-d72e-4b10-a820-54d15bcb18e1', '프로젝트와 코워크 구분하기'],
    ['5fb5908f-4469-4be4-9225-d7173098f60b', '커넥터와 스킬 구분하기'],
    ['b6476c98-3d39-49f0-88b1-c3a15a3434e8', 'AI 브라우저와 볼트 복습하기'],
];
const moonshotDayTwo: typeof moonshotDayOne = [
    ['59dcfd83-78a6-42cb-85da-0a2c87c03585', '필요한 경우 10초 답변 조교 연결하기'],
    ['c23afc6f-34bc-48af-907a-201d05b40292', '오늘의 목표와 AI에게 알려줄 맥락 이해하기'],
    ['a33126c7-e2b7-4090-a435-6215830ca3a6', '클로드에 첫 질문을 보내고 답변 캡처하기'],
    ['facb487e-0f6b-4372-b273-f1228f04f965', '예시로 나의 직과 업 구분하기'],
    ['40c7cc11-b1cb-4146-916a-3a7d7bea23db', 'N6 진단의 목적과 방법 알아보기'],
    ['b408a8e6-ee86-47bb-ad81-9e0bf1cb89be', 'N6 진단을 시작하고 답변 제출하기'],
    ['4b97e8e6-2e5b-4358-a3a8-c1ad9c05ef73', '결과 파일 안내 확인하고 검사 완료 기록하기'],
    ['11ceba21-9eca-476a-921c-f1a6bb04646d', '쪽지시험으로 오늘 배운 내용 확인하기'],
    ['d17e0741-f644-411f-8e17-73da31f77369', '체크리스트로 2일차 마무리하기'],
];
const plans: Record<string, typeof moonshotDayOne> = {
  'b892a49e-1fe9-4094-89c0-144b9a0a27c0': moonshotDayTwo,
  '93b4bfe4-52fc-45d9-ae25-b890d4d23a80': moonshotDayTwo,
  'aeca0139-a836-436b-ae76-dd429952c7fa': moonshotDayOne,
  'cfe15c08-4dec-465f-92e2-c1cbce2728d3': moonshotDayOne,
};

export function practiceSteps(lessonId: string | undefined, blocks: PublicLessonBlock[]) {
  const plan = lessonId && plans[lessonId];
  if (!plan) return null;
  const embedded = lessonEmbeddedImageIds(blocks);
  const rows = lessonImageRows(blocks.filter(b => !embedded.has(b.id)));
  const starts = plan.map(([id]) => rows.findIndex(row => row[0].id === id));
  // A deleted/moved anchor or a new image row across a boundary invalidates
  // the plan. Fall back to normal pagination without dropping any new content.
  if (starts.some((n,i) => n < 0 || (i > 0 && n <= starts[i-1]))) return null;
  return plan.map(([,label], i) => ({label, blocks: rows.slice(i ? starts[i] : 0, starts[i+1]).flat()}));
}
