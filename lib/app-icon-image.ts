import sharp from 'sharp';
import { APP_ICON_MAX_BYTES, type AppIconSize } from '@/lib/app-branding';

export async function renderAppIcons(bytes: Buffer): Promise<{ size: AppIconSize; bytes: Buffer }[]> {
  if (!bytes.length || bytes.length > APP_ICON_MAX_BYTES) throw Error('2MB 이하의 이미지를 선택해 주세요.');
  try {
    const input = sharp(bytes, { limitInputPixels: 4096 * 4096, failOn: 'warning' });
    const meta = await input.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || (meta.pages || 1) !== 1) throw Error();
    if (!meta.width || meta.width !== meta.height || meta.width < 512 || meta.width > 4096) throw Error();
    // Decode and re-encode: discard embedded metadata and flatten transparency.
    const normalized = await input.rotate().flatten({ background: '#ffffff' }).resize(512, 512).png().toBuffer();
    const safe = await sharp(normalized).resize(360, 360).toBuffer();
    return [
      { size: '192', bytes: await sharp(normalized).resize(192, 192).png().toBuffer() },
      { size: '512', bytes: normalized },
      { size: 'apple-180', bytes: await sharp(normalized).resize(180, 180).png().toBuffer() },
      { size: 'maskable-512', bytes: await sharp({ create: { width: 512, height: 512, channels: 3, background: '#ffffff' } }).composite([{ input: safe, gravity: 'centre' }]).removeAlpha().png().toBuffer() },
    ];
  } catch { throw Error('가로·세로가 같은 512~4096px의 PNG, JPG, WEBP 이미지가 필요합니다. 움직이는 이미지는 사용할 수 없습니다.'); }
}
