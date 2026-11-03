export const purchaseBatchLimit = 100;
export const purchaseChannels = ['sms', 'lms', 'alimtalk', 'email'] as const;
export type PurchaseChannel = typeof purchaseChannels[number];
export const purchaseChannelLabels: Record<PurchaseChannel, string> = {
  sms: '문자 (SMS)', lms: '장문 문자 (LMS)', alimtalk: '카카오 알림톡', email: '이메일',
};
export const purchaseDestination = (channel: PurchaseChannel, member: { phone?: string | null; email?: string | null }) =>
  channel === 'email' ? (member.email || '').trim().toLowerCase() : (member.phone || '').replace(/\D/g, '');
export const validPurchaseDestination = (channel: PurchaseChannel, value: string) =>
  channel === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : /^0\d{8,10}$/.test(value);

export const purchaseRoomToken = (channel: PurchaseChannel) => channel === 'alimtalk' ? '#{공지방링크}' : '{{roomLink}}';
