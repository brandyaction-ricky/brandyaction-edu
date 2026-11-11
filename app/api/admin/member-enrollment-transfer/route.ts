import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const messages: Record<string, string> = {
  TRANSFER_FORBIDDEN: '관리자만 수강권을 이전할 수 있습니다.',
  TRANSFER_INVALID: '이전할 회원과 수강권, 처리 사유를 확인해 주세요.',
  TRANSFER_NOT_FOUND: '선택한 회원의 수강권을 찾지 못했습니다.',
  TRANSFER_MEMBER_INACTIVE: '탈퇴·정지 계정 또는 운영자 계정으로는 이전할 수 없습니다.',
  TRANSFER_COHORT_UNAVAILABLE: '종료 처리된 기수의 수강권은 이전할 수 없습니다.',
  TRANSFER_NOT_ACTIVE: '이미 회수·환불·이전됐거나 이용 기간이 지난 수강권입니다. 새로고침해 주세요.',
  TRANSFER_TARGET_EXISTS: '받는 회원에게 이 기수의 수강권 이력이 있습니다. 기존 수강권을 먼저 확인해 주세요.',
  TRANSFER_REQUEST_REUSED: '이전 요청 내용이 달라졌습니다. 회원 기록을 새로고침해 확인해 주세요.',
};
async function operator() {
  const user = await getAuthenticatedUser();
  if (!user) throw Object.assign(Error('로그인이 필요합니다.'), { status: 401 });
  if (user.role !== 'admin') throw Object.assign(Error(messages.TRANSFER_FORBIDDEN), { status: 403 });
  return user;
}
function failure(error: unknown) {
  const status = (error as { status?: number })?.status;
  return reply({ error: status && status < 500 && error instanceof Error ? error.message : '수강권 이전 상태를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.' }, status || 503);
}

// Exact address lookup only: never expose a searchable directory of members.
export async function GET(request: Request) {
  try {
    await operator();
    const params = new URL(request.url).searchParams;
    const member = params.get('member'), source = params.get('source'), email = (params.get('email') || '').trim().toLowerCase();
    if (!uuid(member) || !uuid(source) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: '받는 회원의 가입 이메일을 정확히 입력해 주세요.' }, 400);
    const db = createAdminClient();
    const enrollment = await db.from('enrollments').select('cohort_id,status,revoked_at,access_ends_at').eq('id', source).eq('user_id', member).maybeSingle();
    if (enrollment.error) throw enrollment.error;
    if (!enrollment.data) return reply({ error: messages.TRANSFER_NOT_FOUND }, 404);
    if (enrollment.data.status !== 'active' || enrollment.data.revoked_at || (enrollment.data.access_ends_at && Date.parse(enrollment.data.access_ends_at) <= Date.now())) return reply({ error: messages.TRANSFER_NOT_ACTIVE }, 409);
    const found = await db.from('profiles').select('id,full_name,email').ilike('email', email.replace(/[\\%_]/g, '\\$&')).eq('role', 'student').eq('status', 'active').is('deleted_at', null).limit(2);
    if (found.error) throw found.error;
    if (found.data?.length !== 1) return reply({ error: '이 이메일로 가입한 활성 수강생 계정을 찾지 못했습니다.' }, 404);
    const target = found.data[0];
    if (target.id === member) return reply({ error: '다른 회원 계정을 선택해 주세요.' }, 400);
    const login = await db.auth.admin.getUserById(target.id);
    if (login.error) throw login.error;
    if (!login.data.user || login.data.user.deleted_at || (login.data.user.banned_until && Date.parse(login.data.user.banned_until) > Date.now()) || login.data.user.email?.toLowerCase() !== email) return reply({ error: '받는 회원의 현재 로그인 이메일과 계정 상태를 확인해 주세요.' }, 409);
    const existing = await db.from('enrollments').select('id').eq('user_id', target.id).eq('cohort_id', enrollment.data.cohort_id).limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.length) return reply({ error: messages.TRANSFER_TARGET_EXISTS }, 409);
    return reply({ target: { id: target.id, name: target.full_name || '이름 미등록', email: login.data.user.email } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
    const actor = await operator();
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: messages.TRANSFER_INVALID }, 400);
    const parts: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const item = await reader.read(); if (item.done) break;
        size += item.value.length;
        if (size > 4096) { await reader.cancel(); return reply({ error: '입력 내용이 너무 깁니다.' }, 413); }
        parts.push(item.value);
      }
    } finally { reader.releaseLock(); }
    let input;
    try { input = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return reply({ error: messages.TRANSFER_INVALID }, 400); }
    if (!input || Array.isArray(input) || Object.keys(input).length !== 6 || !uuid(input.requestId) || !uuid(input.source) || !uuid(input.member) || !uuid(input.target) || input.member === input.target || input.confirmed !== true || typeof input.reason !== 'string' || input.reason.trim().length < 2 || input.reason.trim().length > 500) return reply({ error: messages.TRANSFER_INVALID }, 400);
    const result = await createAdminClient().rpc('edu_transfer_enrollment', { p_actor: actor.id, p_request: input.requestId, p_source: input.source, p_member: input.member, p_target: input.target, p_reason: input.reason.trim() });
    if (result.error) {
      const message = messages[result.error.message];
      return reply({ error: message || '처리 결과를 확인하지 못했습니다. 입력을 바꾸지 말고 같은 요청으로 다시 확인해 주세요.' }, message ? 409 : 503);
    }
    if (!result.data?.enrollmentId || result.data?.targetMember !== input.target) return reply({ error: '처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.' }, 503);
    return reply({ ok: true, enrollmentId: result.data.enrollmentId, message: '수강권을 이전했습니다. 기존 계정의 수강 권한은 회수됐습니다.' });
  } catch (error) { return failure(error); }
}
