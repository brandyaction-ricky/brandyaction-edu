import { imagePreviewUrl } from './qa-rules';

/** Resolve local assets against the current deployment, not a different environment. */
export function sharingOrigin(host: string | null) {
  if (!host || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return 'https://brandyaction-edu.com';
  const local = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host);
  try { return new URL(`${local ? 'http' : 'https'}://${host}`).origin; }
  catch { return 'https://brandyaction-edu.com'; }
}

export function productShareImage(metadata: Record<string, unknown>, origin: string, supabaseUrl: string) {
  const image = imagePreviewUrl(String(metadata.thumbnail_url || metadata.thumbnailUrl || ''), supabaseUrl);
  return new URL(image || '/og', origin).href;
}
