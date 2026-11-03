import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { OPTIONAL_CONSENT_VERSION, validateConsentChoices } from '@/lib/optional-consent';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
function failure(error: { message?: string }) {
  if (error.message?.includes('CONSENT_CONFLICT')) return reply({ error: '다른 화면에서 수신 설정을 바꿨어요. 저장된 설정을 다시 불러와 주세요.' }, 409);
  if (error.message?.includes('CONSENT_FORBIDDEN')) return reply({ error: '현재 계정으로 수신 설정을 변경할 수 없어요.' }, 403);
  return reply({ error: '수신 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
}
export async function GET() {
  try {
    const user = await getAuthenticatedUser(); if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (process.env.EDU_OPTIONAL_CONSENT_ENABLED !== 'true') return reply({ error: '새 수신 설정을 준비 중이에요.' }, 503);
    const { data, error } = await createAdminClient().rpc('edu_account_consent', { p_member: user.id });
    return error ? failure(error) : reply(data);
  } catch { return reply({ error: '수신 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503); }
}
export async function PUT(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '이 사이트에서 다시 시도해 주세요.' }, 403);
    const user = await getAuthenticatedUser(); if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const raw = await request.text(); if (raw.length > 2048) return reply({ error: '입력 내용을 확인해 주세요.' }, 413);
    let body: Record<string, unknown> | null;
    try { body = JSON.parse(raw); } catch { return reply({ error: '입력 내용을 확인해 주세요.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: '동의 여부를 확인해 주세요.' }, 400);
    if (process.env.EDU_OPTIONAL_CONSENT_ENABLED !== 'true') {
      // Preserve the old client until the separately approved schema + UI rollout.
      // Do not turn a new channel choice into the legacy SMS-eligibility field.
      if (typeof body.consent !== 'boolean' || 'choices' in body) return reply({ error: '새 수신 설정을 준비 중이에요.' }, 503);
      const now = new Date().toISOString();
      const changes = body.consent ? { marketing_consent: true, marketing_consent_at: now, marketing_opt_out_at: null } : { marketing_consent: false, marketing_opt_out_at: now };
      const { error } = await createAdminClient().from('profiles').update(changes).eq('id', user.id);
      return error ? failure(error) : reply({ ok: true });
    }
    if (!uuid(body.requestId) || (body.expectedRevision !== null && !uuid(body.expectedRevision)) ||
      !['signup', 'profile'].includes(String(body.surface)) || body.wordingVersion !== OPTIONAL_CONSENT_VERSION || !validateConsentChoices(body.choices)) {
      return reply({ error: '수신 설정을 확인해 주세요. 카카오톡·이메일을 받으려면 내 정보 사용에도 동의해야 해요.' }, 400);
    }
    const { data, error } = await createAdminClient().rpc('edu_account_consent', {
      p_member: user.id, p_request: body.requestId, p_choices: body.choices, p_surface: body.surface,
      p_version: OPTIONAL_CONSENT_VERSION, p_expected: body.expectedRevision,
    });
    return error ? failure(error) : reply(data);
  } catch { return reply({ error: '수신 설정을 저장하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.' }, 503); }
}
