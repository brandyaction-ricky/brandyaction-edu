import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validPersonalizationChoices } from '@/lib/personalization-consent';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v);
function failure(message?: string) {
  if (message?.includes('PERSONALIZATION_CONFLICT')) return reply({ error: '다른 화면에서 설정이 바뀌었어요. 저장된 설정을 다시 불러와 주세요.' }, 409);
  if (message?.includes('PERSONALIZATION_TERMS')) return reply({ error: '동의 안내가 바뀌었어요. 다시 불러온 뒤 내용을 확인해 주세요.' }, 409);
  if (message?.includes('PERSONALIZATION_FORBIDDEN')) return reply({ error: '이 계정에서는 설정을 변경할 수 없어요.' }, 403);
  return reply({ error: '설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
}
async function execute(args: Record<string, unknown>) {
  const { data, error } = await createAdminClient().rpc('edu_personalization_consent', args);
  if (error) return failure(error.message);
  const accepting = process.env.EDU_PERSONALIZATION_CONSENT_ENABLED === 'true' && !!data?.terms;
  return reply({ ...data, accepting, eligible: accepting && data?.eligible === true });
}
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요해요.' }, 401);
    return await execute({ p_member: user.id });
  } catch { return failure(); }
}
export async function PUT(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '이 사이트에서 다시 시도해 주세요.' }, 403);
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요해요.' }, 401);
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: '입력 내용을 확인해 주세요.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: '입력 내용을 확인해 주세요.' }, 400); }
    if (!body || !uuid(body.requestId) || (body.expectedRevision !== null && !uuid(body.expectedRevision)) ||
      !validPersonalizationChoices(body.choices) || (body.wordingVersion !== null && (typeof body.wordingVersion !== 'string' || body.wordingVersion.length > 100))) {
      return reply({ error: '선택한 내용을 다시 확인해 주세요.' }, 400);
    }
    // Turning collection off must never prevent withdrawal.
    if ((body.choices.analysis || body.choices.overseas) && process.env.EDU_PERSONALIZATION_CONSENT_ENABLED !== 'true') {
      return reply({ error: '맞춤 안내를 준비 중이에요. 기존 동의는 언제든 취소할 수 있어요.' }, 503);
    }
    return await execute({ p_member: user.id, p_request: body.requestId, p_choices: body.choices,
      p_expected: body.expectedRevision, p_version: body.wordingVersion });
  } catch { return failure(); }
}
