import { moonshotPracticePlans, type StepPlan } from './moonshot-practice-plans';
import { LESSON_BODY_PREFIX, parseLessonDocument } from './lesson-body';
import type { PublicLessonBlock } from './lesson-blocks';
import { lessonEmbeddedImageIds } from './lesson-toggle-images';
import { lessonImageRows } from './lesson-image-row';

// Cohorts 3, 4 and 5 share one authored lesson. The private DEV mirror
// preserves its block identities; the normal classroom does not paginate.

const moonshotDayOne: StepPlan = [
    ['d5b0f5ca-578c-4602-a9ab-69cf60a4860e', '수업 중 질문하는 방법 확인하기'],
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
    ['f39f6182-6241-4a6f-8fd3-3273771a18f0', '수업 중 질문하는 방법 확인하기'],
    ['c23afc6f-34bc-48af-907a-201d05b40292', '오늘의 목표와 AI에게 알려줄 맥락 이해하기'],
    ['a33126c7-e2b7-4090-a435-6215830ca3a6', '클로드에 첫 질문을 보내고 답변 캡처하기'],
    ['facb487e-0f6b-4372-b273-f1228f04f965', '예시로 나의 직과 업 구분하기'],
    ['40c7cc11-b1cb-4146-916a-3a7d7bea23db', 'N6 진단의 목적과 방법 알아보기'],
    ['b408a8e6-ee86-47bb-ad81-9e0bf1cb89be', 'N6 진단을 시작하고 답변 제출하기'],
    ['4b97e8e6-2e5b-4358-a3a8-c1ad9c05ef73', '결과 파일 안내 확인하고 검사 완료 기록하기'],
    ['11ceba21-9eca-476a-921c-f1a6bb04646d', '쪽지시험으로 오늘 배운 내용 확인하기'],
    ['d17e0741-f644-411f-8e17-73da31f77369', '체크리스트로 2일차 마무리하기'],
];
const moonshotDayThree: StepPlan = [
    ['fa08ab0d-f423-4fc1-a5de-41acc7ec299c', '오늘의 목표와 질문 방법 확인하기'],
    ['d3-native-004', '볼트의 다섯 폴더와 메모 흐름 이해하기'],
    ['3edc70d8-d705-4529-ac08-6785c3517708', '텔레그램과 작업할 PC 준비하기'],
    ['49640b1d-a7bb-41d1-8d8c-e83212d797f8', '어사이드에서 텔레그램 웹 열기'],
    ['a10cbcec-99c0-409a-86f2-e4bdc5ed3c15', 'QR 코드로 텔레그램 로그인하기'],
    ['be31d44d-e6ee-4ef1-a467-215286be37f4', '전화번호로 텔레그램 로그인하기'],
    ['061ae060-64f2-4249-8682-74457c30246f', '작업 폴더를 지정해 제2의 뇌 프로젝트 만들기'],
    ['f3d0844f-e084-4733-bdcd-6905cd17c5b5', '텔레그램 채널 설정 시작하기'],
    ['6f30c04b-59c1-4ac1-8904-f1b5a3e24b10', '봇 이름과 프로젝트를 정하고 연결 확인하기'],
    ['e9fe140e-6591-45e5-af3e-2693c50b5c37', '내 봇에게 첫 인사를 보내고 답장 확인하기'],
    ['eaaadfe5-b609-4cf4-acdb-40722c90f75d', '연결 실패 화면으로 도움 요청하기'],
    ['91c54abf-447a-424a-8584-e289a4ad3ded', '제2의 뇌 정리 규칙 저장하기'],
    ['1f2ff803-b98a-4fac-9c4b-e652e812ff35', '새 대화에서 정리 규칙이 작동하는지 확인하기'],
    ['514e95b3-2c7c-4a12-834e-892a7b041aa5', '봇에게 볼트를 준비시키고 폴더 확인하기'],
    ['165e8b96-7008-4b94-9008-770228c161c5', 'N6 결과 파일 내려받기'],
    ['850d77f7-32fa-46a1-af19-80f17f68b555', '내 봇에 N6 파일을 보내고 원본 저장 확인하기'],
    ['c4cb99bc-a096-45f2-b0b9-837fb23808b4', '저장된 자료를 읽기 전용으로 점검하기'],
    ['a41cdf12-8fbb-499b-bfc3-130aa08265de', '점검 결과를 읽고 해결할 항목 정리하기'],
    ['d3-native-037', '내 말로 노트 두 개를 고쳐 확정하기'],
    ['9852996a-49d8-4066-b441-17e9068b0740', '봇에 링크를 보내고 정리된 메모 확인하기'],
    ['9852996a-49d8-4066-b441-17e9068b0740', '아이디어를 보내고 저장 위치 확인하기', '② 아이디어 보내기'],
    ['9852996a-49d8-4066-b441-17e9068b0740', '회의록을 보내고 원문과 결정 사항 구분하기', '③ 회의록 보내기'],
    ['9852996a-49d8-4066-b441-17e9068b0740', '밖에서도 봇이 답할 수 있는지 확인하기', '오늘 마지막으로 확인하세요.'],
    ['0cfe88b2-b7db-473b-a134-cace50a6d3aa', '내 상황에 맞춰 봇 연결 문제 점검하기'],
    ['389cd4e1-8c36-454a-a6d3-2a29c692c94a', '보관한 어사이드 프로젝트 복구하기', '만약 어사이드 프로젝트가 보관(Archived) 되었다면?'],
    ['d3-native-046', '쪽지시험과 체크리스트로 3일차 마무리하기'],
];
const plans: Record<string, StepPlan> = {
  'f5043754-4e32-493a-9f6c-666734d0c5fa': moonshotDayThree,
  '64e388ae-89e1-42fb-bac0-0a723e7b5c4c': moonshotDayThree,
  'b892a49e-1fe9-4094-89c0-144b9a0a27c0': moonshotDayTwo,
  '93b4bfe4-52fc-45d9-ae25-b890d4d23a80': moonshotDayTwo,
  'aeca0139-a836-436b-ae76-dd429952c7fa': moonshotDayOne,
  'cfe15c08-4dec-465f-92e2-c1cbce2728d3': moonshotDayOne,
};

for (const { lessonId, reviewId, steps } of moonshotPracticePlans) {
  plans[lessonId] = steps;
  plans[reviewId] = steps;
}

export function practiceSteps(lessonId: string | undefined, blocks: PublicLessonBlock[]) {
  const plan = lessonId && plans[lessonId];
  if (!plan) return null;
  const embedded = lessonEmbeddedImageIds(blocks);
  const rows = lessonImageRows(blocks.filter(b => !embedded.has(b.id)));
  // A reviewed boundary can be inside a rich text block. Split only at an
  // whole heading or stand-alone section title; keep embedded media and lists whole.
  const units: {id: string; heading?: string; blocks: PublicLessonBlock[]}[] = [];
  for (const row of rows) {
    const block = row[0];
    const breaks = plan.flatMap(([id,,heading]) => id === block.id && heading ? [heading] : []);
    if (!breaks.length) { units.push({id:block.id, blocks:row}); continue; }
    const doc = block.type === 'text' && parseLessonDocument(block.content || '');
    if (!doc || !doc.content) return null;
    const nodes = doc.content;
    const cuts = [0];
    for (const heading of breaks) {
      const matches = nodes.flatMap((node,i) => (node.type === 'heading' || node.type === 'paragraph') &&
        node.content?.map(child => child.text || '').join('').trim() === heading ? [i] : []);
      if (matches.length !== 1 || matches[0] <= cuts[cuts.length - 1]) return null;
      cuts.push(matches[0]);
    }
    cuts.forEach((start,i) => units.push({id:block.id, heading:breaks[i-1], blocks:[{
      ...block, content:LESSON_BODY_PREFIX + JSON.stringify({...doc, content:nodes.slice(start,cuts[i+1])}),
    }]}));
  }
  const starts = plan.map(([id,,heading]) => units.findIndex(unit => unit.id === id && unit.heading === heading));
  if (starts.some((n,i) => n < 0 || (i > 0 && n <= starts[i-1]))) return null;
  return plan.map(([,label],i) => ({label, blocks:units.slice(i ? starts[i] : 0,starts[i+1]).flatMap(unit => unit.blocks)}));
}
