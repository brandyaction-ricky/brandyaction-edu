export type RecruitmentAnnouncementFields = {
  material1: string;
  material2: string;
  material3: string;
  material2Date: string;
  material3Date: string;
  materialsUrl: string;
  liveDate: string;
  liveTime: string;
  bonus1: string;
  bonus2: string;
  bonus3: string;
  passwordUrl: string;
};

export const emptyRecruitmentAnnouncement: RecruitmentAnnouncementFields = {
  material1: '', material2: '', material3: '', material2Date: '', material3Date: '',
  materialsUrl: '', liveDate: '', liveTime: '오후 9시', bonus1: '', bonus2: '', bonus3: '', passwordUrl: '',
};

export function recruitmentAnnouncement(fields: RecruitmentAnnouncementFields): string {
  const value = (key: keyof RecruitmentAnnouncementFields, label: string) => fields[key].trim() || `[${label}]`;
  const date = value('liveDate', '라이브 날짜');
  const time = value('liveTime', '라이브 시간');
  return `👇🏻 (클릭) 받아가실 자료가 여기 다 있어요!

🎁 지금 바로 받는 자료 3종
1. ${value('material1', '자료 1')} (즉시 공개)
2. ${value('material2', '자료 2')} (${value('material2Date', '자료 2 공개일')} 공개)
3. ${value('material3', '자료 3')} (${value('material3Date', '자료 3 공개일')} 공개)
👉🏻 ${value('materialsUrl', '자료 링크')}

⬇️ AI를 200% 활용하는 법은
${date} ${time} 라이브에서
전부 알려드려요!

🗓 ${date} 라이브에서 배우는 것
1. 맞춤형 AI 마케팅 팀 만드는 법
2. 내 회사 데이터를 한 곳에 모으는 법
3. 반복 작업 99% 자동화 시키는 법
4. 광고비 250억 사용한 지식 적용법
5. 메타광고, 콘텐츠 자동화 하는 법

🎁 + 라이브 참여자 한정 추가혜택 3종!
1. ${value('bonus1', '추가 혜택 1')}
2. ${value('bonus2', '추가 혜택 2')}
3. ${value('bonus3', '추가 혜택 3')}
(자료 비밀번호는 ${date} 라이브에서 공개)
👉🏻 ${value('passwordUrl', '비밀번호 링크')}

🚨 안내사항
- 라이브 입장 링크는 ${date} ${time}
오직 이 방에서만 안내드립니다

- 라이브는 강의 및 QnA까지
약 2시간 소요될 예정입니다

- 다시보기는 없습니다

P.S 실시간 업데이트될 추가 자료는
톡방을 통해 지속적으로 제공됩니다.
(주의) 본 톡방을 나가시면 추가 자료를 받기 어려워요`;
}

export function incompleteRecruitmentAnnouncement(fields: RecruitmentAnnouncementFields): boolean {
  return Object.values(fields).some(value => !value.trim());
}
