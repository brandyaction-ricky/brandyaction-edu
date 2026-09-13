export const DEFAULT_CTA_COLOR = '#E22400';

export function conversionUrl(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 2048 || /[\s\\\u0000-\u001f]/.test(text)) return '';
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function productConversion(metadata: Record<string, unknown>, legacy: Record<string, unknown> = {}) {
  const value = (key: string, fallback: unknown) => Object.hasOwn(metadata, key) ? metadata[key] : fallback;
  const color = String(metadata.cta_color || DEFAULT_CTA_COLOR);
  const pixelId = String(value('meta_pixel_id', legacy.pixel_enabled ? legacy.pixel_id : '') || '');
  return {
    label: String(value('cta_label', legacy.cta_label) || '').trim() || '참여하기',
    url: conversionUrl(value('cta_url', legacy.kakao_url)),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_CTA_COLOR,
    pixelId: /^\d{5,30}$/.test(pixelId) ? pixelId : '',
  };
}

export function ctaTextColor(color: string) {
  const [r, g, b] = [1, 3, 5].map(offset => {
    const s = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722 > 0.179 ? '#111111' : '#ffffff';
}
