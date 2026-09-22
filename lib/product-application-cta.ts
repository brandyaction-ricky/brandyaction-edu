import { conversionUrl } from './product-conversion';

export type ProductApplicationCta = {
  href: string;
  label: string;
  disabled: boolean;
  enrolled: boolean;
  conversionUrl?: string;
};

/** Identify application links, leaving document navigation and editorial links alone. */
export function isProductApplicationLink(href: string, text: string, explicit = false, configuredUrl = '') {
  if (explicit) return true;
  if (href.startsWith('#') && href.length > 1) return false;
  if (configuredUrl && conversionUrl(href) === configuredUrl) return true;
  if (/^\/(?:apply|checkout)(?:[?#]|$)/.test(href)) return true;
  try { if (new URL(href).hostname === 'open.kakao.com') return true; } catch {}
  return /(?:신청\s*(?:하기|완료|마감)?|수강\s*신청|구매\s*하기|결제\s*하기|대기방\s*입장|무료\s*강의\s*(?:참여|입장)|지금\s*참여)/.test(text);
}
