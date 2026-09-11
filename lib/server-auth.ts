import { createClient } from '@/lib/supabase/server';
import { cache } from 'react';
export const getAuthenticatedUser = cache(async () => {
  try {
    const db = await createClient();
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) return null;
    const { data: profile } = await db.from('profiles').select('id,email,full_name,phone,role,status,marketing_consent').eq('id',data.user.id).single();
    if (!profile || profile.status !== 'active') return null;
    return { ...profile, email: data.user.email || profile.email || '', id: data.user.id };
  } catch { return null; }
});
export async function getAdminUser() {
  const user = await getAuthenticatedUser();
  return user?.role === 'admin' ? user : null;
}
