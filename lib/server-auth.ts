import { createClient } from '@/lib/supabase/server';
import { cache } from 'react';
const loginLabels = new Map([['kakao', '카카오'], ['google', '구글'], ['email', '이메일']]);

export const getAuthenticatedUser = cache(async (includeLoginMethod = false) => {
  try {
    const db = await createClient();
    const { data, error } = await db.auth.getUser();
    if (error) {
      if (error.name === 'AuthSessionMissingError' || [400, 401, 403].includes(error.status || 0)) return null;
      throw error;
    }
    if (!data.user) return null;
    const { data: profile, error: profileError } = await db.from('profiles').select('id,email,contact_email,full_name,phone,role,status,marketing_consent').eq('id',data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.status !== 'active') return null;
    const user: typeof profile & { loginMethod?: string } = { ...profile, email: data.user.email || profile.email || '', id: data.user.id };
    if (!includeLoginMethod) return user;
    const providers = data.user.identities?.length
      ? data.user.identities.map(identity => identity.provider)
      : [data.user.app_metadata?.provider];
    const loginMethod = [...new Set(providers.map(provider => loginLabels.get(provider ?? '')).filter(Boolean))].join(' · ');
    return { ...user, loginMethod: loginMethod || undefined };
  } catch {
    // A temporary Auth/DB failure must remain retryable, not become a logout.
    throw Object.assign(new Error('로그인 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'), { status: 503 });
  }
});
export async function getAdminUser() {
  const user = await getAuthenticatedUser();
  return user?.role === 'admin' ? user : null;
}
