export const purchaseBatchLimit = 100;
export const purchaseRecipientLimit = 10_000;
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

export const purchaseTextLimits = { sms: 90, lms: 2000 };

let eucKrCharacters: Set<string> | undefined;

export function purchaseTextBytes(text: string) {
  let bytes = 0;
  for (const character of text) {
    if (/^[\x20-\x7e\r\n\t]$/.test(character)) {
      bytes += 1;
      continue;
    }
    if (!eucKrCharacters) {
      const pairs = [];
      for (let lead = 0xa1; lead <= 0xfe; lead += 1) {
        for (let trail = 0xa1; trail <= 0xfe; trail += 1) pairs.push(lead, trail, 0x20);
      }
      eucKrCharacters = new Set(new TextDecoder('euc-kr').decode(Uint8Array.from(pairs)));
      eucKrCharacters.delete('�');
    }
    if (!eucKrCharacters.has(character)) return null;
    bytes += 2;
  }
  return bytes;
}
