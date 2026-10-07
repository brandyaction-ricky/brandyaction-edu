export type InstallDevice = 'ios' | 'android' | 'desktop';
export function installDevice(userAgent: string, platform: string, maxTouchPoints: number): InstallDevice {
  if (/iPad|iPhone|iPod/i.test(userAgent) || platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
  return /Android/i.test(userAgent) ? 'android' : 'desktop';
}
export function embeddedBrowser(userAgent: string) {
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|MicroMessenger|DaumApps|; wv\)/i.test(userAgent);
}
export const installDismissKey = 'edu-home-install-dismissed-until-v1';
export const installDismissMs = 7 * 24 * 60 * 60 * 1000;
export function installDismissed(value: string | null, now: number) {
  const until = Number(value); return Number.isFinite(until) && until > now && until <= now + installDismissMs;
}

// Chromium-based browsers can emit an install prompt too. Only offer our Chrome path.
export function chromeInstallBrowser(userAgent: string) {
  return /(?:Chrome|CriOS)\//i.test(userAgent) && !/Whale|Edg(?:e|A|iOS)?\/|OPR\/|Opera|SamsungBrowser|Vivaldi|YaBrowser|DuckDuckGo|GSA\//i.test(userAgent) && !embeddedBrowser(userAgent);
}
