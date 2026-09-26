export type RecruitmentRooms = { label: string; organicUrl: string; paidUrl: string; paidMode: 'undecided' | 'new' | 'reuse' };
export const EMPTY_RECRUITMENT_ROOMS: RecruitmentRooms = { label: '', organicUrl: '', paidUrl: '', paidMode: 'undecided' };
export function recruitmentPeriod(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new Error('모집 구분은 영문 소문자·숫자·하이픈으로 입력해 주세요.');
  return value;
}
export function recruitmentRooms(value: unknown): RecruitmentRooms {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('방 설정을 확인해 주세요.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['label','organicUrl','paidUrl','paidMode'].includes(key))) throw new Error('허용되지 않은 설정입니다.');
  const url = (input: unknown) => {
    if (typeof input !== 'string' || !/^https:\/\/open\.kakao\.com\/o\/[a-zA-Z0-9]+\/?$/.test(input.trim()) || input.trim().length > 200) throw new Error('https://open.kakao.com/o/... 형식의 방 주소를 입력해 주세요.');
    return input.trim().replace(/\/$/, '');
  };
  if (typeof v.label !== 'string' || !v.label.trim() || v.label.trim().length > 80) throw new Error('모집 이름을 80자 이내로 입력해 주세요.');
  if (!['undecided','new','reuse'].includes(String(v.paidMode))) throw new Error('광고 방 운영 방식을 확인해 주세요.');
  const result = { label: v.label.trim(), organicUrl: url(v.organicUrl), paidUrl: url(v.paidUrl), paidMode: v.paidMode as RecruitmentRooms['paidMode'] };
  if (result.organicUrl === result.paidUrl) throw new Error('광고와 오가닉 전용 방은 다른 주소로 입력해 주세요.');
  return result;
}
