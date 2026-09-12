export type KakaoSyncConfig = {
  enabled: boolean;
  appId: string;
  channelId: string;
  termsTag: string;
  privacyTag: string;
  readChannel: boolean;
  setupConfirmed: boolean;
  revision: number;
};
export const defaultKakaoSyncConfig: KakaoSyncConfig = {
  enabled: false, appId: '', channelId: '', termsTag: '', privacyTag: '',
  readChannel: false, setupConfirmed: false, revision: 0,
};
export function validateKakaoSyncConfig(input: unknown): KakaoSyncConfig {
  if (!input || typeof input !== 'object') throw Error('설정을 확인해 주세요.');
  const v = input as Record<string, unknown>;
  const field = (key: string, pattern: RegExp) => {
    if (typeof v[key] !== 'string') throw Error('설정 값을 확인해 주세요.');
    const value = v[key].trim();
    if (value && !pattern.test(value)) throw Error('앱 ID, 채널 ID, 약관 태그 형식을 확인해 주세요.');
    return value;
  };
  for (const key of ['enabled', 'readChannel', 'setupConfirmed'])
    if (typeof v[key] !== 'boolean') throw Error('활성화 설정을 확인해 주세요.');
  const config: KakaoSyncConfig = {
    enabled: v.enabled === true,
    appId: field('appId', /^[1-9][0-9]{0,19}$/),
    channelId: field('channelId', /^_[a-zA-Z0-9]{1,80}$/),
    termsTag: field('termsTag', /^[a-zA-Z0-9_-]{1,100}$/),
    privacyTag: field('privacyTag', /^[a-zA-Z0-9_-]{1,100}$/),
    readChannel: v.readChannel === true,
    setupConfirmed: v.setupConfirmed === true,
    revision: Number(v.revision),
  };
  if (!Number.isSafeInteger(config.revision) || config.revision < 0) throw Error('설정을 다시 불러와 주세요.');
  if (config.termsTag && config.termsTag === config.privacyTag) throw Error('이용약관과 개인정보 태그는 서로 달라야 합니다.');
  if (config.enabled && (!config.appId || !config.channelId || !config.termsTag || !config.privacyTag || !config.setupConfirmed))
    throw Error('기존 카카오 앱·대표 채널·약관 설정을 완료한 뒤 활성화해 주세요.');
  return config;
}
// Channel-add consent itself is configured on Kakao's consent screen. plusfriends
// is only an optional permission to READ the relationship, never an add-channel API.
export function kakaoOAuthOptions(config: KakaoSyncConfig): { scopes?: string } {
  return config.enabled && config.readChannel ? { scopes: 'plusfriends' } : {};
}
type Json = Record<string, unknown>;
const obj = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
export function providerId(value: unknown): string {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
  return typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) ? value : '';
}
export function verifiedKakaoIdentity(user: { identities?: { provider: string; id: string }[] }, tokenInfo: unknown, config: KakaoSyncConfig) {
  const info = obj(tokenInfo), id = providerId(info.id);
  return id && providerId(info.app_id) === config.appId && user.identities?.some(i => i.provider === 'kakao' && i.id === id) ? id : null;
}
export function kakaoConsentSnapshot(id: string, config: KakaoSyncConfig, termsResponse: unknown, channelResponse: unknown) {
  const t = obj(termsResponse), c = obj(channelResponse);
  const terms = [config.termsTag, config.privacyTag].map(tag => {
    const matches = providerId(t.id) === id && Array.isArray(t.service_terms) ? t.service_terms.filter(item => obj(item).tag === tag) : [];
    const item = matches.length === 1 ? obj(matches[0]) : {};
    const date = typeof item.agreed_at === 'string' && Number.isFinite(Date.parse(item.agreed_at)) && Date.parse(item.agreed_at) <= Date.now() + 60000 ? new Date(item.agreed_at).toISOString() : null;
    return { tag, agreed: item.agreed === true && date !== null, agreed_at: date };
  });
  const matches = config.readChannel && providerId(c.user_id) === id && Array.isArray(c.channels) ? c.channels.filter(item => obj(item).channel_public_id === config.channelId) : [];
  const relation = matches.length === 1 ? obj(matches[0]).relation : null;
  const channelRelation = relation === 'ADDED' || relation === 'BLOCKED' || relation === 'NONE' ? relation : 'UNKNOWN';
  return { terms, requiredAgreed: terms.every(term => term.agreed), channelRelation };
}
