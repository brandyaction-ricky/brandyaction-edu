import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validMetaPurchaseRequest } from '@/lib/meta-purchase-consent';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
function failure(message?: string) {
  if (message?.includes('META_CONSENT_CONFLICT')) return reply({ error: '다른 화면에서 Meta 동의가 바뀌었어요. 저장된 설정을 다시 불러와 주세요.' }, 409);
  if (message?.includes('META_CONSENT_TERMS')) return reply({ error: 'Meta 동의 안내가 바뀌었어요. 다시 불러온 뒤 확인해 주세요.' }, 409);
  if (message?.includes('META_CONSENT_FORBIDDEN')) return reply({ error: '이 계정에서는 설정을 변경할 수 없어요.' }, 403);
  return reply({ error: 'Meta 동의 설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
}
async function execute(args: Record<string, unknown>) {
  const { data, error } = await createAdminClient().rpc('edu_meta_purchase_consent', args);
  return error ? failure(error.message) : reply(data);
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
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return reply({ error: '입력 내용을 확인해 주세요.' }, 400); }
    if (!validMetaPurchaseRequest(body)) return reply({ error: '선택한 내용을 다시 확인해 주세요.' }, 400);
    return await execute({ p_member: user.id, p_request: body.requestId, p_expected: body.expectedRevision,
      p_consented: body.consented, p_version: body.wordingVersion, p_surface: body.surface });
  } catch { return failure(); }
}
