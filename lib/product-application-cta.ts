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
  // A real internal document destination is not an application merely because
  // its caption mentions applying. Legacy fallback is limited to whole actions.
  if (href.startsWith('/')) return false;
  const label = text.replace(/\s+/g, '');
  return /^(?:(?:무료로|무료|수강)?신청(?:하기|완료|마감)?|구매하기|결제하기|(?:무료(?:라이브)?강의)?대기방입장|무료(?:라이브)?강의(?:참여|입장)(?:하기)?|지금참여(?:하기)?)$/.test(label);
}
