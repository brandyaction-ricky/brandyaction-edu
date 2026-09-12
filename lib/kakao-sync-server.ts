import { createAdminClient } from '@/lib/supabase/admin';
import { POLICY_VERSION } from '@/lib/legal-policies';
import { defaultKakaoSyncConfig, validateKakaoSyncConfig, verifiedKakaoIdentity, kakaoConsentSnapshot } from '@/lib/kakao-sync';
import type { User } from '@supabase/supabase-js';

export async function getKakaoSyncConfig() {
  const { data, error } = await createAdminClient().from('kakao_sync_config').select('value,revision').eq('id', true).single();
  if (error) throw Error('카카오싱크 설정을 불러오지 못했습니다.');
  return validateKakaoSyncConfig({ ...defaultKakaoSyncConfig, ...data.value, revision: data.revision });
}

// Provider tokens are used only in server-to-Kakao calls; never logged or saved in
// application tables. A client-supplied metadata flag cannot certify consent.
export async function syncKakaoConsent(user: User, token: string | undefined | null): Promise<boolean> {
  if (!token || !user.identities?.some(identity => identity.provider === 'kakao')) return false;
  try {
    const config = await getKakaoSyncConfig();
    if (!config.enabled) return false;
    const get = async (path: string) => {
      try {
        const response = await fetch('https://kapi.kakao.com' + path, {
          headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(2500),
        });
        return response.ok ? await response.json() : null;
      } catch { return null; }
    };
    const identity = verifiedKakaoIdentity(user, await get('/v1/user/access_token_info'), config);
    if (!identity) return false;
    const [terms, channels] = await Promise.all([
      get('/v2/user/service_terms?result=app_service_terms'),
      config.readChannel ? get('/v2/api/talk/channels?channel_ids=' + encodeURIComponent(config.channelId)) : Promise.resolve(null),
    ]);
    const snapshot = kakaoConsentSnapshot(identity, config, terms, channels);
    const { error } = await createAdminClient().rpc('edu_record_kakao_consent', {
      p_user: user.id, p_kakao_id: identity, p_app_id: config.appId,
      p_revision: config.revision, p_policy: POLICY_VERSION,
      p_terms: snapshot.terms, p_channel: config.channelId, p_relation: snapshot.channelRelation,
    });
    // An unavailable audit store must not silently mark required terms accepted.
    return !error && snapshot.requiredAgreed;
  } catch {
    // Keep normal login/onsite consent available during Kakao or DB outages.
    return false;
  }
}
