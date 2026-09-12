import { safeNext } from '@/lib/platform';
import { isValidPassword, PASSWORD_REQUIREMENT } from '@/lib/auth-validation';

export function emailAddress(value: string) {
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('이메일 주소를 확인해 주세요.');
  return email;
}
export function signupValues(name: string, email: string, password: string, confirm: string) {
  const full_name = name.trim();
  if (!full_name || full_name.length > 80) throw Error('이름을 80자 이내로 입력해 주세요.');
  if (!isValidPassword(password) || password.length > 128) throw Error(PASSWORD_REQUIREMENT);
  if (password !== confirm) throw Error('비밀번호가 일치하지 않습니다.');
  return { email: emailAddress(email), password, options: { data: { full_name } } };
}
export function emailCallback(origin: string, next: string) {
  return new URL('/auth/callback?next=' + encodeURIComponent(safeNext(next)), origin).href;
}
export function afterEmailLogin(metadata: Record<string, unknown> | undefined, next: string) {
  const destination = safeNext(next);
  return metadata?.terms_version && metadata?.privacy_version ? destination : '/auth/consent?next=' + encodeURIComponent(destination);
}
export function emailAuthError(error: { code?: string; status?: number }) {
  if (error.code === 'invalid_credentials') return '이메일 또는 비밀번호를 확인해 주세요. 소셜 가입 계정은 해당 소셜 버튼으로 로그인해 주세요.';
  if (error.code === 'email_not_confirmed') return '인증 메일을 확인한 뒤 로그인해 주세요. 아래에서 인증 메일을 다시 받을 수 있습니다.';
  if (error.code === 'weak_password') return PASSWORD_REQUIREMENT;
  if (error.code === 'same_password') return '기존 비밀번호와 다른 비밀번호를 입력해 주세요.';
  if (error.code === 'user_already_exists') return '가입 정보를 확인해 주세요. 기존 계정이 있다면 로그인 또는 비밀번호 찾기를 이용해 주세요.';
  if (error.code === 'email_address_not_authorized' || error.code === 'unexpected_failure') return '인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도하거나 카카오·구글로 계속해 주세요.';
  if (error.status === 429 || error.code?.includes('rate_limit')) return '요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.';
  if (['signup_disabled', 'email_provider_disabled', 'email_address_invalid'].includes(error.code || '')) return '이메일 가입을 진행하지 못했습니다. 주소를 확인하거나 카카오·구글로 계속해 주세요.';
  return '요청을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
}
