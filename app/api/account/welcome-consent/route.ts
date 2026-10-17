import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validWelcomeRequest, type WelcomeSnapshot, type WelcomeRequest } from '@/lib/welcome-consent';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
function failure(message = '') {
  if (/FORBIDDEN/.test(message)) return reply({ error: '이 계정에서는 설정을 변경할 수 없어요.' }, 403);
  if (/CONFLICT|TERMS|ANSWERED/.test(message)) return reply({ error: '다른 화면에서 설정이나 안내가 바뀌었어요. 저장된 설정을 다시 불러와 주세요.' }, 409);
  if (/INVALID/.test(message)) return reply({ error: '선택한 내용을 다시 확인해 주세요.' }, 400);
  return reply({ error: '저장 결과를 확인하지 못했어요. 같은 선택으로 다시 확인해 주세요.' }, 503);
}
function accepting() { return { marketing: process.env.EDU_OPTIONAL_CONSENT_ENABLED === 'true', personal: process.env.EDU_PERSONALIZATION_CONSENT_ENABLED === 'true' }; }
async function execute(member: string, body?: WelcomeRequest) {
  const { data, error } = await createAdminClient().rpc('edu_welcome_consent', { p_member: member, p_allow_marketing: accepting().marketing, p_allow_personal: accepting().personal, p_allow_reward: process.env.EDU_CONSENT_REWARD_ENABLED === 'true', ...(body ? { p_request: body.requestId, p_payload: body } : {}) });
  if (error) return failure(error.message);
  const s = data as WelcomeSnapshot, flags = accepting();
  return reply({ ...s, accepting: { marketing: flags.marketing, personal: flags.personal && !!s.personal.terms, meta: flags.marketing && !!s.meta.terms },
    reward: { ...s.reward, available: flags.marketing && process.env.EDU_CONSENT_REWARD_ENABLED === 'true' && s.reward.available } });
}
export async function GET() {
  try { const user = await getAuthenticatedUser(); return user ? await execute(user.id) : reply({ error: '로그인이 필요해요.' }, 401); }
  catch { return failure(); }
}
export async function PUT(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '이 사이트에서 다시 시도해 주세요.' }, 403);
    const user = await getAuthenticatedUser(); if (!user) return reply({ error: '로그인이 필요해요.' }, 401);
    const raw = await request.text(); if (raw.length > 4096) return reply({ error: '입력 내용을 확인해 주세요.' }, 413);
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: '입력 내용을 확인해 주세요.' }, 400); }
    if (!validWelcomeRequest(body)) return reply({ error: '선택한 내용을 다시 확인해 주세요.' }, 400);
    return await execute(user.id, body);
  } catch { return failure(); }
}
