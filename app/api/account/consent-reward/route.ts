import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validRewardRequest } from '@/lib/consent-reward';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const enabled = () => process.env.EDU_CONSENT_REWARD_ENABLED === 'true' && process.env.EDU_OPTIONAL_CONSENT_ENABLED === 'true';
function failure(message?: string) {
  if (message?.includes('CONFLICT') || message?.includes('PERSONALIZATION_TERMS')) return reply({ error: '설정이나 안내가 바뀌었어요. 다시 불러온 뒤 선택해 주세요.' }, 409);
  if (message?.includes('FORBIDDEN')) return reply({ error: '이 계정에서는 신청할 수 없어요.' }, 403);
  if (message?.includes('REWARD_UNAVAILABLE') || message?.includes('COUPON_')) return reply({ error: '쿠폰 발급이 현재 어려워요. 이번 선택은 저장되지 않았어요. 잠시 후 다시 시도해 주세요.' }, 503);
  return reply({ error: '저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.' }, 503);
}
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요해요.' }, 401);
    if (!enabled()) return reply({ available: false });
    const { data, error } = await createAdminClient().rpc('edu_consent_reward', { p_member: user.id });
    if (error) return failure(error.message);
    const analysisAvailable = process.env.EDU_PERSONALIZATION_CONSENT_ENABLED === 'true' && !!data?.terms;
    return reply({ ...data, terms: analysisAvailable ? data.terms : null, analysisAvailable });
  } catch { return failure(); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '이 사이트에서 다시 시도해 주세요.' }, 403);
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요해요.' }, 401);
    if (!enabled()) return reply({ error: '쿠폰 안내를 준비 중이에요. 수강은 그대로 이용할 수 있어요.' }, 503);
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: '입력 내용을 확인해 주세요.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return reply({ error: '입력 내용을 확인해 주세요.' }, 400); }
    if (!validRewardRequest(body)) return reply({ error: '동의할 항목을 선택해 주세요.' }, 400);
    if ((body.payload.choices.analysis || body.payload.choices.overseas) && process.env.EDU_PERSONALIZATION_CONSENT_ENABLED !== 'true') return reply({ error: '분석 동의 안내를 준비 중이에요. 다시 불러와 주세요.' }, 409);
    const { data, error } = await createAdminClient().rpc('edu_consent_reward', { p_member: user.id, p_request: body.requestId, p_payload: body.payload });
    return error ? failure(error.message) : reply(data);
  } catch { return failure(); }
}
