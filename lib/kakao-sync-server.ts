import { createAdminClient } from '@/lib/supabase/admin';
import { POLICY_VERSION, CURRENT_PRIVACY_VERSION } from '@/lib/legal-policies';
import { defaultKakaoSyncConfig, validateKakaoSyncConfig, verifiedKakaoIdentity, kakaoConsentSnapshot, kakaoPhoneNumber } from '@/lib/kakao-sync';
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
    const [terms, channels, details] = await Promise.all([
      get('/v2/user/service_terms?result=app_service_terms'),
      config.readChannel ? get('/v2/api/talk/channels?channel_ids=' + encodeURIComponent(config.channelId)) : Promise.resolve(null),
      config.readPhone ? get('/v2/user/me') : Promise.resolve(null),
    ]);
    const snapshot = kakaoConsentSnapshot(identity, config, terms, channels);
    const { error } = await createAdminClient().rpc('edu_record_kakao_consent', {
      p_user: user.id, p_kakao_id: identity, p_app_id: config.appId,
      p_revision: config.revision, p_policy: `${POLICY_VERSION}/${config.privacyVersion || POLICY_VERSION}`,
      p_terms: snapshot.terms, p_channel: config.channelId, p_relation: snapshot.channelRelation,
    });
    // An unavailable audit store must not silently mark required terms accepted.
    if (error || !snapshot.requiredAgreed) return false;
    const phone = config.readPhone ? kakaoPhoneNumber(details, identity) : null;
    if (phone) {
      // A checkout/profile number entered by the member always takes precedence.
      try { await createAdminClient().from('profiles').update({ phone }).eq('id', user.id).eq('status', 'active').or('phone.is.null,phone.eq.'); }
      catch { /* Phone autofill is optional and must not block sign-in. */ }
    }
    return true;
  } catch {
    // Keep normal login/onsite consent available during Kakao or DB outages.
    return false;
  }
}

/** Only a server-recorded, identity-bound receipt for the current wording can
 * remove a required checkbox. Query strings and user-editable metadata cannot. */
export async function getKakaoRequiredConsent(user: User): Promise<{ agreedAt:string } | null> {
  if (!user.identities?.some(identity=>identity.provider==='kakao')) return null;
  try {
    const config=await getKakaoSyncConfig();
    if (!config.enabled || config.privacyVersion!==CURRENT_PRIVACY_VERSION) return null;
    const {data:receipt,error}=await createAdminClient().from('kakao_sync_members')
      .select('app_id,kakao_user_id,policy_version,terms,checked_at').eq('user_id',user.id).maybeSingle();
    if(error || !receipt || receipt.app_id!==config.appId || receipt.policy_version!==`${POLICY_VERSION}/${CURRENT_PRIVACY_VERSION}` ||
      !user.identities.some(identity=>identity.provider==='kakao' && identity.id===receipt.kakao_user_id)) return null;
    const checked=Date.parse(receipt.checked_at),signedIn=Date.parse(user.last_sign_in_at || '');
    if(!Number.isFinite(checked) || !Number.isFinite(signedIn) || checked<signedIn || checked>Date.now()+60000)return null;
    const snapshot=kakaoConsentSnapshot(receipt.kakao_user_id,config,{id:receipt.kakao_user_id,service_terms:receipt.terms},null);
    if(!snapshot.requiredAgreed)return null;
    return {agreedAt:snapshot.terms.map(term=>term.agreed_at!).sort().at(-1)!};
  } catch { return null; }
}
