// Public evidence and labelled examples for one business throughout the walk.
export const welcomeCase = {
  product: '문샷 챌린지 · AI 직원 교육',
  sources: [
    {label:'동종 강좌 수강 후기 · Coursera',text:'Google AI Essentials의 입문 수업 후기에는 처음 이해하기 쉽다는 의견과, 이미 아는 기초 내용이라 더 구체적인 도구와 실습이 필요하다는 의견이 함께 나옵니다. 아래는 공개 후기의 요약입니다.',url:'https://www.coursera.org/specializations/ai-essentials-google/reviews'},
    {label:'비교한 강좌 안내 · Google',text:'Google은 일상 업무에서 아이디어를 내고 콘텐츠를 만드는 실습을 소개합니다. 처음 접하는 사람도 어떤 업무에 쓸 수 있는지 읽을 수 있습니다.',url:'https://grow.google/ai-essentials/'},
    {label:'우리 상품 안내 · 브랜디에듀',text:'문샷 커리큘럼에는 우리 AI 직원과 마케팅 흐름을 정리하고, 실제 업무 자료와 판단 기준을 세팅하는 수업이 있습니다.',url:'https://brandyaction-edu.com/classes/product-cf147f74-6783-43f7-a205-8c2128a48997'},
  ],
  observations:[
    {observation:'기초가 쉽다는 점은 처음 배우는 사람에게 장점이고, 이미 써본 사람에게는 아쉬움이었어요.',emphasis:'첫 장면에서 직원이 완성한 광고와 답변을 먼저 보여줍시다. 각자 내 일에 쓸 만한지 바로 판단할 수 있어요.'},
    {observation:'비교한 수업도 실무 활용을 이야기해요. ‘AI를 배운다’만으로는 문샷에서 무엇을 직접 할지 알기 어렵습니다.',emphasis:'내가 기준 한 줄을 고치면 두 직원의 결과가 어떻게 달라지는지 같은 사례로 보여줍시다.'},
  ],
  positioning:'사람이 회사 기준을 정하면, 광고 담당자와 응대 담당자가 그 기준을 각자의 일에 반영합니다.',
  intro:'오늘 검토할 광고와 문의 답변이 도착했습니다. 두 AI 직원에게 우리 팀 기준을 한 줄 알려주세요.',
  artwork:{src:'/campus/arrival/moonshot-ad-scene.webp',alt:'광고·디자인·콘텐츠·고객 응대를 맡은 네 명의 AI 직원이 나오는 문샷 모집 광고',caption:'문샷 모집 광고의 한 장면'},
  video:{src:'/campus/arrival/moonshot-campaign-preview.mp4',poster:'/campus/arrival/moonshot-ad-scene.webp',caption:'문샷 모집 광고 영상 발췌'},
  support:{question:'이미 AI로 글을 쓰고 있어요. 여기서는 뭘 더 해볼 수 있나요?',answer:'문샷에서는 평소 쓰는 자료와 원하는 결과의 기준을 직원에게 알려줍니다. 이 체험에서는 소개글을 고친 기준을 고객 문의 답변에도 써봅니다.',summary:'이 문의에서 궁금했던 건 설치 방법보다, 평소 혼자 AI를 쓸 때와 무엇이 달라지는지였어요.',proposal:'상품 소개 첫 화면에 같은 회사 기준이 광고 문장과 문의 답변에 각각 적용된 예시를 나란히 넣어주세요.'},
  rules:[
    {label:'읽는 사람이 오늘 할 일로 시작한다.',approvedIntro:'오늘 보낼 광고와 답장, 아직 초안부터 쓰고 계세요? 우리 기준으로 초안을 준비하는 두 AI 직원을 만나보세요.',approvedAnswer:'오늘 답해야 할 문의 하나를 떠올려 보세요. 평소 쓰는 말투와 확인할 항목을 알려주면 응대 직원이 그 기준으로 답장 초안을 준비합니다.'},
    {label:'직원이 완성한 결과물을 먼저 보여준다.',approvedIntro:'광고 첫 문장과 고객 답변 초안을 가져왔어요. AI 직원의 결과를 보고, 다음 업무에도 쓸 기준을 정해보세요.',approvedAnswer:'소개글과 고객 답변, 두 가지 결과를 직접 확인합니다. 첫 문장을 고친 뒤 그 기준이 다음 답변에도 어떻게 적용되는지 보실 수 있어요.'},
  ],
};
