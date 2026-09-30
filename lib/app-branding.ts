export const APP_BRANDING_KEY = 'edu_app_branding';
export const APP_BRANDING_TAG = 'edu-app-branding';
export const APP_ICON_MAX_BYTES = 2 * 1024 * 1024;
export const APP_ICON_SIZES = ['192', '512', 'maskable-512', 'apple-180'] as const;
export type AppIconSize = typeof APP_ICON_SIZES[number];
export type AppBranding = { revision: string | null; iconId: string | null; sourceHash: string | null };
export const defaultBranding: AppBranding = { revision: null, iconId: null, sourceHash: null };
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function readAppBranding(value: unknown): AppBranding {
  if (value == null) return { ...defaultBranding };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('앱 아이콘 설정을 확인하지 못했습니다.');
  const row = value as Record<string, unknown>;
  if (!uuid(row.revision) || !(row.iconId === null && row.sourceHash === null || uuid(row.iconId) && typeof row.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(row.sourceHash))) throw Error('앱 아이콘 설정을 확인하지 못했습니다.');
  return { revision: row.revision, iconId: row.iconId as string | null, sourceHash: row.sourceHash as string | null };
}
export function iconPath(id: string, size: AppIconSize) {
  if (!uuid(id) || !APP_ICON_SIZES.includes(size)) throw Error('아이콘 경로를 확인해 주세요.');
  return `edu/app-icons/${id}/${size}.png`;
}
export function publicAppBranding(value: AppBranding, storageUrl?: string) {
  let base = '';
  if (value.iconId) {
    const url = new URL(storageUrl || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('아이콘 저장소를 확인해 주세요.');
    base = `${url.origin}/storage/v1/object/public/course-assets/`;
  }
  const url = (size: AppIconSize) => value.iconId ? base + iconPath(value.iconId, size) : `/icons/edu-${size}.png`;
  return { revision: value.revision, custom: Boolean(value.iconId), icon: url('192'), apple: url('apple-180'), icons: [
    { src: url('192'), sizes: '192x192', type: 'image/png', purpose: 'any' as const },
    { src: url('512'), sizes: '512x512', type: 'image/png', purpose: 'any' as const },
    { src: url('maskable-512'), sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
  ] };
}
export type PublicAppBranding = ReturnType<typeof publicAppBranding>;
export function validateIconFile(file: Pick<File, 'size' | 'type'>) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('PNG, JPG, WEBP 이미지를 선택해 주세요.');
  if (!file.size || file.size > APP_ICON_MAX_BYTES) throw Error('2MB 이하의 이미지를 선택해 주세요.');
}
