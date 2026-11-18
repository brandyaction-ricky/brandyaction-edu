// Shared with the form; retention delivery stays separate from event automations.
export const retentionTrigger = (value: unknown) => value === 'member_inactive' || value === 'learning_stalled';
export const retentionDays = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 365;
export const retentionFailure = {
  TEMPLATE_UNVERIFIED: '승인된 정보성 알림톡의 채널·번호·본문을 확인하지 못해 발송하지 않았습니다.',
  PROVIDER_UNKNOWN: '발송업체 접수 결과를 확인할 수 없습니다. 중복 방지를 위해 자동 재발송하지 않습니다.',
};
