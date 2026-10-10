// Synthetic operator personas. This is scenario coverage, not observed human research.
export const contexts = [
  { name: '처음 사용하는 소형 휴대폰 운영자', width: 320, height: 640, input: 'touch' },
  { name: '이동 중 아이폰으로 처리하는 담당자', width: 390, height: 844, input: 'touch' },
  { name: '큰 휴대폰으로 긴 문구를 읽는 담당자', width: 430, height: 932, input: 'touch' },
  { name: '가로 휴대폰으로 급한 업무를 처리하는 담당자', width: 844, height: 390, input: 'touch' },
  { name: '세로 태블릿으로 상담하는 담당자', width: 768, height: 1024, input: 'touch' },
  { name: '태블릿 분할 화면을 쓰는 담당자', width: 600, height: 900, input: 'touch' },
  { name: '작은 노트북에서 여러 창을 쓰는 담당자', width: 1024, height: 768, input: 'keyboard' },
  { name: '일반 노트북에서 반복 업무를 하는 담당자', width: 1366, height: 768, input: 'keyboard' },
  { name: '큰 모니터로 전체를 확인하는 관리자', width: 1920, height: 1080, input: 'keyboard' },
  { name: '움직임을 줄이고 키보드로 사용하는 담당자', width: 1280, height: 720, input: 'keyboard', reducedMotion: true },
] as const;
export const roles = [
  { key: 'questions', name: '상담 담당', task: '질문함을 메뉴에서 찾는다', menu: '질문함' },
  { key: 'learning', name: '커리큘럼 담당', task: '커리큘럼 편집으로 이동할 메뉴를 찾는다', menu: '커리큘럼 편집' },
  { key: 'cohorts', name: '기수 담당', task: '기수별 운영 메뉴를 찾는다', menu: '기수·회차 관리' },
  { key: 'orders', name: '정산 담당', task: '주문 결제 메뉴를 찾는다', menu: '주문 결제' },
  { key: 'edit', name: '학습 안내 담당', task: '목록 마지막 문구를 선택하고 바로 수정한다' },
  { key: 'create', name: '신입 안내 담당', task: '기존 목록을 확인하고 새 문구를 작성한다' },
  { key: 'help', name: '대체 근무자', task: '사용법을 펼쳐 확인하고 다시 작업으로 돌아온다' },
  { key: 'settings', name: '발송 설정 담당', task: '문구 목록을 유지한 채 발신번호 설정을 확인한다' },
  { key: 'restricted', name: '권한 제한 직원', task: '허용된 메뉴만 검색하고 결과 없음을 이해한다' },
  { key: 'resize', name: '운영 총괄', task: '창 크기를 바꿔도 메뉴와 작업 위치를 잃지 않는다' },
] as const;
export const personas = roles.flatMap((role, roleIndex) => contexts.map((context, contextIndex) => ({
  id: `P${String(roleIndex * 10 + contextIndex + 1).padStart(3, '0')}`,
  role, context, name: `${role.name} · ${context.name}`, synthetic: true,
})));
