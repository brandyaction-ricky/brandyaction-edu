import { safeNext } from './platform';

// A hint, never an authentication/authorization decision. Some apps hide their UA.
export function isEmbeddedLoginBrowser(ua: string) {
  if (/Telegram|KAKAOTALK|FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(ua)) return true;
  return /iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) &&
    !/Safari\/|CriOS\/|FxiOS\/|EdgiOS\//i.test(ua);
}

// Start OAuth again in the destination browser; never copy a code, token or PKCE URL.
export function browserLoginPath(next: string) {
  return '/login?next=' + encodeURIComponent(safeNext(next));
}
