export const PASSWORD_REQUIREMENT = "8자 이상이며 영문과 숫자를 각각 포함해 주세요.";

export function isValidPassword(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

export function normalizePhone(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function isValidPhone(value: string) {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 11;
}
