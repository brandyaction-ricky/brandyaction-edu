export const OPTIONAL_CONSENT_VERSION = '2026-10-20';
export type ConsentChoices = { marketingUse: boolean; sms: boolean; kakao: boolean; email: boolean };
export const emptyConsent: ConsentChoices = { marketingUse: false, sms: false, kakao: false, email: false };
export type ConsentSnapshot = {
  choices: ConsentChoices; revision: string | null; updatedAt: string | null;
  dates: Record<keyof ConsentChoices, string | null>; legacyRetired: boolean; legacyActive?: boolean;
  changed?: { kind: keyof ConsentChoices; action: 'consent' | 'refusal' | 'withdrawal' }[];
};
export function validateConsentChoices(value: unknown): value is ConsentChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 4 && Object.keys(emptyConsent).every(key => typeof row[key] === 'boolean') &&
    row.sms === false && (row.marketingUse === true || (!row.kakao && !row.email));
}
export function consentReceipt(snapshot: ConsentSnapshot): string {
  if (!snapshot.updatedAt) return '';
  const day = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(snapshot.updatedAt));
  const labels = { marketingUse: '마케팅 목적 개인정보 이용', sms: '문자 광고', kakao: '카카오톡 광고', email: '이메일 광고' };
  const actions = { consent: '동의', refusal: '거부', withdrawal: '동의 철회' };
  const changes = snapshot.changed?.map(change => `${labels[change.kind]} ${actions[change.action]}`).join(', ') || '수신 설정';
  return `브랜디에듀(주식회사 브랜디액션)가 ${day} ${changes}를 처리했습니다.`;
}
