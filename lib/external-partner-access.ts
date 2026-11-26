import { createAdminClient } from '@/lib/supabase/admin';
import type { createClient } from '@/lib/supabase/server';

export type ExternalPartnerScope = {
  id: string;
  course_id: string;
  cohort_id: string;
  course_title: string;
  cohort_name: string;
  access_ends_at: string;
};

export async function externalPartnerScopes(userId: string, db = createAdminClient()): Promise<ExternalPartnerScope[]> {
  const result = await db.rpc('edu_external_partner_scopes', { p_user: userId });
  if (result.error) throw Object.assign(new Error('협력자 권한을 확인하지 못했습니다.'), { status: 503 });
  return result.data;
}

export async function externalPartnerScope(userId: string, accessId: string, db = createAdminClient()) {
  const scopes = await externalPartnerScopes(userId, db);
  return scopes.find(scope => scope.id === accessId);
}

type SessionDb = Pick<Awaited<ReturnType<typeof createClient>>, 'rpc'>;

export async function myExternalPartnerScopes(db: SessionDb, accessId: string | null = null): Promise<ExternalPartnerScope[]> {
  const { data, error } = await db.rpc('edu_my_external_partner_scopes', { p_access: accessId });
  if (error || !Array.isArray(data)) throw Object.assign(new Error('협력자 권한을 확인하지 못했습니다.'), { status: 503 });
  return data;
}

export async function myExternalPartnerScope(db: SessionDb, accessId: string) {
  return (await myExternalPartnerScopes(db, accessId))[0];
}
