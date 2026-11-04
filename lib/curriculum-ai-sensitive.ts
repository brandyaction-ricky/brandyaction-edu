export const sensitiveQuestionMessage = '비밀번호나 카드번호로 보이는 정보가 있어요. 해당 부분을 지운 뒤 다시 보내 주세요.';

export function hasSensitiveQuestionText(text: string): boolean {
 if (/(?:비밀번호|패스워드|password|passcode|pwd)\s*(?:[:=：]|는\s+|은\s+)\s*\S+/iu.test(text)) return true;

 const candidates = text.matchAll(/(?<!\d)(?<!\d[ -])(?:\d[ -]?){12,18}\d(?![ -]?\d)/g);
 for (const [candidate] of candidates) {
  const digits = candidate.replace(/\D/g, '');
  if (/^(\d)\1+$/.test(digits)) continue;
  const sum = [...digits].reverse().reduce((total, digit, index) => {
   const value = Number(digit) * (index % 2 ? 2 : 1);
   return total + (value > 9 ? value - 9 : value);
  }, 0);
  if (sum % 10 === 0) return true;
 }
 return false;
}
