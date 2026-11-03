import { uuid } from './edu-workflows';

export function analyticsExclusionInput(value: unknown) {
  const body = value as Record<string, unknown> | null;
  if (!body || Array.isArray(body) || typeof body !== 'object'
    || Object.keys(body).some(key => !['kind', 'id', 'excluded', 'expected', 'reason'].includes(key))
    || !['member', 'order'].includes(String(body.kind)) || !uuid(body.id)
    || typeof body.excluded !== 'boolean' || typeof body.expected !== 'boolean'
    || typeof body.reason !== 'string' || body.reason.trim().length < 2 || body.reason.trim().length > 500) {
    throw Object.assign(new Error('변경 대상과 표시 사유(2~500자)를 확인해 주세요.'), { status: 400 });
  }
  return { kind: body.kind as 'member' | 'order', id: body.id as string, excluded: body.excluded, expected: body.expected, reason: body.reason.trim() };
}

export function analyticsExclusionFailure(error: unknown) {
  const messages: Record<string, [number, string]> = {
    ANALYTICS_FORBIDDEN: [403, '관리자만 집계 제외 표시를 변경할 수 있습니다.'],
    ANALYTICS_INVALID: [400, '변경 대상과 표시 사유를 확인해 주세요.'],
    ANALYTICS_NOT_FOUND: [404, '대상을 찾지 못했습니다. 목록을 다시 확인해 주세요.'],
    ANALYTICS_FORCED: [400, '관리자·스태프 계정은 항상 내부 집계에서 제외됩니다.'],
    ANALYTICS_STALE: [409, '다른 관리자가 표시를 변경했습니다. 새로 확인한 뒤 다시 저장해 주세요.'],
  };
  const message = (error as { message?: string })?.message || '';
  const known = Object.entries(messages).find(([code]) => message.includes(code))?.[1];
  if (known) return { status: known[0], message: known[1] };
  const status = (error as { status?: number })?.status;
  return { status: status && status < 500 ? status : 503, message: status && status < 500 ? message : '집계 제외 표시를 확인하지 못했습니다. 저장 여부를 새로 확인해 주세요.' };
}
