export const careChannelLabels = { push: '앱 푸시', email: '이메일', alimtalk: '알림톡', sms: '문자' } as const;
export type CareChannel = keyof typeof careChannelLabels;
export type CareDeliveryMode = 'push_first' | 'all';
export type CareReach = { memberId: string; push: boolean; email: boolean; alimtalk: boolean; sms: boolean; emailMasked: string | null; phoneMasked: string | null };
export type CareChannelConfig = { enabled: boolean; push: boolean; email: boolean; alimtalk: boolean; sms: boolean; alimtalkTemplateId: string | null };
export type CareDeliveryReceipt = { count: number; requestId: string; deliveries: { memberId: string; channel: CareChannel; status: string; code?: string | null }[] };
export const CARE_SMS_BODY = '브랜디에듀 학습 안내\nhttps://brandyaction-edu.com/my/messages';
export const CARE_ALIMTALK_BODY = '[브랜디에듀] 학습 안내\n\n#{이름}님, 수강 중인 과정의 학습 안내가 도착했습니다.\n사이트에 로그인해 메시지함에서 확인해 주세요.\n\nhttps://brandyaction-edu.com/my/messages';
export const careDeliveryStatus: Record<string,string> = { pending:'발송 대기', processing:'접수 중', accepted:'발송사 접수', sent:'푸시 접수', delivered:'전달 완료', failed:'실패', unknown:'결과 확인 필요', skipped:'발송 제외' };
export function careChannelsFor(reach: CareReach, config: CareChannelConfig, selected: CareChannel[], mode: CareDeliveryMode): CareChannel[] {
  if (!config.enabled) return [];
  const available = selected.filter(c => config[c] && reach[c]);
  if (mode !== 'push_first') return available;
  if (available.includes('push')) return ['push'];
  return available.includes('alimtalk') ? available.filter(c => c !== 'sms') : available;
}
export function careReachSummary(reach?: CareReach) {
  return !reach ? '연락 수단 확인 필요' : [reach.push && '푸시 등록', reach.email && '이메일 등록', reach.alimtalk && '휴대전화 등록'].filter(Boolean).join(' · ') || '연락처·푸시 미등록';
}
export type CareDeliverySelection = { mode: CareDeliveryMode; channels: CareChannel[]; routes: { memberId: string; channels: CareChannel[] }[] };
export function careChannelRoutes(reach: CareReach[], config: CareChannelConfig, selected: CareChannel[], mode: CareDeliveryMode) {
  return reach.map(r=>({memberId:r.memberId,channels:careChannelsFor(r,config,selected,mode).sort()})).sort((a,b)=>a.memberId.localeCompare(b.memberId));
}
