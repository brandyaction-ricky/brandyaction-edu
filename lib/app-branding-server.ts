import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { APP_BRANDING_KEY, APP_BRANDING_TAG, defaultBranding, publicAppBranding, readAppBranding } from '@/lib/app-branding';

export async function readStoredAppBranding(db: ReturnType<typeof createAdminClient>) {
  const result = await db.from('site_settings').select('value').eq('key', APP_BRANDING_KEY).eq('is_public', false).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (result.error) throw result.error;
  return readAppBranding(result.data?.value);
}
const cached = unstable_cache(async () => {
  const value = await readStoredAppBranding(createAdminClient());
  return publicAppBranding(value, process.env.NEXT_PUBLIC_SUPABASE_URL);
}, ['edu-app-branding-v1'], { tags: [APP_BRANDING_TAG], revalidate: 60 });
export async function getPublicAppBranding() {
  // Icon lookup must never hold up login/learning when settings are unavailable.
  if (process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED !== 'true') return publicAppBranding(defaultBranding);
  try { return await cached(); } catch { return publicAppBranding(defaultBranding); }
}
