type MetaSettings = { meta_campaign_id?: string | null; meta_campaign_ids?: string[] | null };

export function normalizeMetaAccountId(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw Error('Meta 광고계정 ID는 숫자 문자열로 입력해 주세요.');
  if (!value.trim()) return '';
  const account = value.trim().replace(/^act_/, '');
  if (!/^\d+$/.test(account)) throw Error('Meta 광고계정 ID는 숫자 또는 act_숫자 형식으로 입력해 주세요.');
  return `act_${account}`;
}

export function parseMetaCampaignIds(value: unknown): string[] {
  if (value == null || value === '') return [];
  const parts = typeof value === 'string' ? value.split(/[\s,]+/) : value;
  if (!Array.isArray(parts) || parts.some(id => typeof id !== 'string')) throw Error('Meta 캠페인 ID는 숫자 문자열로 입력해 주세요.');
  const ids = [...new Set(parts.map(id => id.trim()).filter(Boolean))];
  if (ids.some(id => !/^\d+$/.test(id))) throw Error('Meta 캠페인 ID는 숫자만 입력하고 줄바꿈이나 쉼표로 구분해 주세요.');
  if (ids.length > 20) throw Error('Meta 캠페인은 최대 20개까지 연결할 수 있습니다.');
  return ids;
}

export function metaCampaignIds(campaign: MetaSettings): string[] {
  return parseMetaCampaignIds(campaign.meta_campaign_ids ?? campaign.meta_campaign_id);
}

export function metaConnectionHelp(campaign: MetaSettings & { meta_ad_account_id?: string | null }): string {
  if (!campaign.meta_ad_account_id) return '공통 광고계정이 설정되지 않았습니다. 운영 담당자에게 공통 설정을 요청해 주세요. 기본 정보는 연동 전에도 저장할 수 있습니다.';
  return !metaCampaignIds(campaign).length ? 'Meta 캠페인 ID를 입력하고 설정을 저장해 주세요. 기본 정보는 연동 전에도 저장할 수 있습니다.' : 'ID가 저장됐습니다. Meta 재동기화를 실행하면 광고비·노출을 가져옵니다. 서버의 Meta API 설정과 조회 권한도 필요합니다.';
}
