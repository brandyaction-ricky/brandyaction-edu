import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { APP_BRANDING_KEY, APP_BRANDING_TAG, defaultBranding, publicAppBranding, readAppBranding } from '@/lib/app-branding';

export async function readStoredAppBranding(db: ReturnType<typeof createAdminClient>, timeoutMs = 5000) {
  const result = await db.from('site_settings').select('value').eq('key', APP_BRANDING_KEY).eq('is_public', false).abortSignal(AbortSignal.timeout(timeoutMs)).maybeSingle();
  if (result.error) throw result.error;
  return readAppBranding(result.data?.value);
}
// The sole settings writer expires this tag after a successful save/reset.
// Polling every minute caused unnecessary background reads across routes;
// their errors are handled by Next itself, outside the caller's catch below.
const cached = unstable_cache(async () => {
  // Public metadata must not wait for the admin editor's longer read deadline.
  const value = await readStoredAppBranding(createAdminClient(), 2000);
  return publicAppBranding(value, process.env.NEXT_PUBLIC_SUPABASE_URL);
}, ['edu-app-branding-v2', process.env.NEXT_PUBLIC_SUPABASE_URL || 'unconfigured'], { tags: [APP_BRANDING_TAG], revalidate: false });
export async function getPublicAppBranding() {
  // Icon lookup must never hold up login/learning when settings are unavailable.
  if (process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED !== 'true') return publicAppBranding(defaultBranding);
  try { return await cached(); } catch {
    // Do not cache a fallback as a successful settings read, or expose DB errors.
    console.warn('[app-branding] Settings read unavailable; using default icons.');
    return publicAppBranding(defaultBranding);
  }
}
