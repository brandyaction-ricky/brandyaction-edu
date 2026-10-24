export type SurveyRoom = 'paid' | 'organic' | 'unknown';
export type TelegramPath = 'existing' | 'new';

export type PurchaseOnboardingSettings = {
  roomName: string;
  inviteUrl: string;
  paidImage: string;
  organicImage: string;
  enabled: boolean;
  orientationAt?: string;
  firstLessonId?: string;
  checklistEnabled?: boolean;
};

export const DEFAULT_ONBOARDING_ROOM_NAME = 'AI Moonshot project #4기';
export const MOONSHOT_SUPPORT_URL = 'http://pf.kakao.com/_ydxjhxj/chat';
export const TELEGRAM_IOS_INSTALL_URL = 'https://telegram.org/dl/ios';
export const TELEGRAM_ANDROID_INSTALL_URL = 'https://telegram.org/dl/android';
export const onboardingSettingsKey = (cohortId: string) => `edu_purchase_onboarding_${cohortId}`;
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isMoonshotFourth = (courseTitle: unknown, cohortName: unknown) =>
  typeof courseTitle === 'string' && /문샷/.test(courseTitle) && typeof cohortName === 'string' && /(^|\D)4기(\D|$)/.test(cohortName);

export function telegramInviteUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !['t.me', 'telegram.me'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.search || url.hash || !/^\/(?:\+|joinchat\/)?[A-Za-z0-9_-]{5,}$/.test(url.pathname)) throw Error();
    return url.href;
  } catch { throw new Error('텔레그램 초대 링크는 https://t.me/ 주소를 입력해 주세요.'); }
}

export function purchaseOnboardingSettings(value: unknown): PurchaseOnboardingSettings {
  const item = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const roomName = String(item.roomName || '').trim();
  if (!roomName || roomName.length > 80) throw new Error('방 이름을 80자 이내로 입력해 주세요.');
  const inviteUrl = telegramInviteUrl(item.inviteUrl);
  const paidImage = typeof item.paidImage === 'string' ? item.paidImage.trim() : '';
  const organicImage = typeof item.organicImage === 'string' ? item.organicImage.trim() : '';
  for (const image of [paidImage, organicImage]) {
    if (image && (!/^edu\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(image) || image.length > 240)) throw new Error('프로필 이미지는 업로드한 이미지 파일만 사용할 수 있습니다.');
  }
  const enabled = item.enabled === true;
  if (enabled && !inviteUrl) throw new Error('안내를 켜려면 텔레그램 초대 링크를 입력해 주세요.');
  const orientationAt = typeof item.orientationAt === 'string' ? item.orientationAt.trim() : '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(orientationAt);
  const validDate = dateOnly ? Number.isFinite(Date.parse(orientationAt)) && new Date(orientationAt).toISOString().slice(0,10) === orientationAt
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(orientationAt) && Number.isFinite(Date.parse(orientationAt)) && new Date(Date.parse(orientationAt) + 9 * 3600000).toISOString().slice(0,16) === orientationAt.slice(0,16);
  if (orientationAt && !validDate) throw new Error('OT 일정을 올바르게 입력해 주세요.');
  const firstLessonId = typeof item.firstLessonId === 'string' ? item.firstLessonId : '';
  if (firstLessonId && !uuid(firstLessonId)) throw new Error('첫 학습을 선택해 주세요.');
  const checklistEnabled = item.checklistEnabled === true;
  if (enabled && checklistEnabled && (!orientationAt || !firstLessonId)) throw new Error('4단계 안내를 켜려면 OT 일정과 첫 학습을 설정해 주세요.');
  return { roomName, inviteUrl, paidImage, organicImage, enabled, orientationAt, firstLessonId, checklistEnabled };
}

export function surveyRoom(value: unknown): SurveyRoom | null {
  return value === 'paid' || value === 'organic' || value === 'unknown' ? value : null;
}

export function telegramPath(value: unknown): TelegramPath | null {
  return value === 'existing' || value === 'new' ? value : null;
}
