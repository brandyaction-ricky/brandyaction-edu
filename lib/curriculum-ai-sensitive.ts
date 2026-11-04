export const sensitiveQuestionMessage = '비밀번호, 카드번호, 주민등록번호 또는 API 키로 보이는 정보가 있어요. 해당 부분을 지운 뒤 다시 보내 주세요.';

export function hasSensitiveQuestionText(text: string): boolean {
 const normalized = text.normalize('NFKC').replace(/[‐‑‒–—−]/g, '-').replace(/[\u200b-\u200d\ufeff]/g, '');
 const explicitPassword = /(?:비밀\s*번호|비\s*번|패스워드|\b(?:password|passcode|pwd|pw)\b)(?:은|는|이|가)?\s*[:=]\s*\S+/iu;
 const koreanPassword = /(?:비밀\s*번호|비\s*번|패스워드)(?:은|는|이|가)?\s+["'`]?[!-~]{4,}/u;
 const englishPassword = /\b(?:password|passcode|pwd|pw)\b\s+(?:is\s+)?(?:["'`][!-~]{4,}|(?=[!-~]{4})(?=[!-~]*[\d!@$%^&*_=+])[!-~]+)/iu;
 if (explicitPassword.test(normalized) || koreanPassword.test(normalized) || englishPassword.test(normalized)) return true;
 if (/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\s*\/\s*(?=[!-~]{6})(?=[!-~]*\d)[!-~]+/u.test(normalized)) return true;
 if (/(?<![\w-])(?:sk-(?:proj-|svcacct-|ant-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/u.test(normalized)) return true;
 if (/(?<!\d)\d{6}[ -]\d{7}(?!\d)|(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/u.test(normalized)) return true;

 const candidates = normalized.matchAll(/(?<!\d)(?<!\d[ -])(?:\d[ -]?){12,18}\d(?![ -]?\d)/g);
 for (const [candidate] of candidates) {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length === 16) return true;
  if (/^(\d)\1+$/.test(digits)) continue;
  const sum = [...digits].reverse().reduce((total, digit, index) => {
   const value = Number(digit) * (index % 2 ? 2 : 1);
   return total + (value > 9 ? value - 9 : value);
  }, 0);
  if (sum % 10 === 0) return true;
 }
 return false;
}
