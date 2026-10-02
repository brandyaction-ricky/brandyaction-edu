import type { SupabaseClient, User } from '@supabase/supabase-js';
import { emailAddress, loginEmailChangeError } from './email-auth';

const action = 'member.login_email_change';
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export function validateAdminEmailChange(body: Record<string, unknown>) {
  const email = String(body.email || '').trim().toLowerCase();
  const reason = String(body.reason || '').trim();
  try { emailAddress(email); } catch { fail('이메일 주소를 확인해 주세요.'); }
  if (email !== String(body.confirmEmail || '').trim().toLowerCase()) fail('새 이메일을 두 칸에 똑같이 입력해 주세요.');
  if (!reason || reason.length > 500) fail('변경 사유를 1~500자로 입력해 주세요.');
  if (body.confirmed !== true) fail('회원과 새 이메일을 확인한 뒤 확인란을 선택해 주세요.');
  return { email, reason };
}

export function adminEmailOrigin(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) fail('이 사이트의 회원 상세 화면에서 다시 신청해 주세요.', 403);
  const host = new URL(origin).hostname;
  // Never derive an authentication link from a supplied redirect URL or Host header.
  if (host === 'brandyaction-edu.com') return origin;
  if (host === 'brandyaction-edu-dev.vercel.app' || host.endsWith('-brandyaction.vercel.app')) return 'https://brandyaction-edu-dev.vercel.app';
  fail('메일 확인 링크의 사이트 주소를 확인해 주세요.', 403);
}

export async function sendAdminEmailChange(email: string, link: string, id: string, request: typeof fetch = fetch) {
  if (!process.env.RESEND_API_KEY || !process.env.CRM_EMAIL_FROM) fail('이메일 발송 설정이 준비되지 않았습니다. 운영 담당자에게 문의해 주세요.', 503);
  const result = await request('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `edu-member-email-${id}` },
    body: JSON.stringify({ from: process.env.CRM_EMAIL_FROM, to: [email], subject: '[브랜디에듀] 새 로그인 이메일을 확인해 주세요',
      text: `관리자가 회원님의 요청에 따라 로그인 이메일 변경을 신청했습니다.\n\n아래 링크를 누르면 이 주소로 변경됩니다. 기존 수강권과 학습 기록은 그대로 유지됩니다.\n${link}\n\n확인 후 브랜디에듀 로그인 비밀번호를 직접 설정할 수 있습니다. 네이버·구글 메일의 비밀번호와는 별개입니다.\n요청한 적이 없다면 링크를 누르지 말고 고객센터로 알려 주세요.` }),
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) fail('메일을 보내지 못했습니다. 잠시 후 새로 신청해 주세요.', 503);
  const response = await result.json();
  if (!response.id) fail('메일 접수 결과를 확인하지 못했습니다. 잠시 후 다시 신청해 주세요.', 503);
}

export async function requestAdminEmailChange(db: SupabaseClient, actor: string, member: string, body: Record<string, unknown>, origin: string, send = sendAdminEmailChange) {
  const { email, reason } = validateAdminEmailChange(body);
  const profile = await db.from('profiles').select('id,status,role').eq('id', member).maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data || profile.data.status === 'withdrawn') fail('회원이 없거나 탈퇴한 계정입니다.', 404);
  if (profile.data.role !== 'student' || actor === member) fail('관리자·스태프 계정은 본인의 회원 정보에서 직접 변경해 주세요.', 403);
  const auth = await db.auth.admin.getUserById(member);
  if (auth.error || !auth.data.user?.email) fail('회원의 로그인 이메일을 확인하지 못했습니다.', 503);
  const current = auth.data.user.email;
  if (current.toLowerCase() === email) fail('현재 주소와 다른 새 이메일을 입력해 주세요.');
  const recent = await db.from('audit_logs').select('id').eq('action', action).eq('entity_type', 'member').eq('entity_id', member).gte('created_at', new Date(Date.now() - 60000).toISOString()).limit(1);
  if (recent.error) throw recent.error;
  if (recent.data?.length) fail('메일을 방금 요청했습니다. 1분 뒤 다시 신청해 주세요.', 429);
  if (!process.env.RESEND_API_KEY || !process.env.CRM_EMAIL_FROM) fail('이메일 발송 설정이 준비되지 않았습니다.', 503);
  const detail = { new_email: email, reason, status: 'requesting', requested_at: new Date().toISOString() };
  const audit = await db.from('audit_logs').insert({ actor_user_id: actor, action, entity_type: 'member', entity_id: member, before_data: { email: current }, after_data: detail }).select('id').single();
  if (audit.error) fail('변경 이력을 저장하지 못해 요청을 중단했습니다.', 503);
  const id = String(audit.data.id);
  try {
    // Auth keeps the current email until this token is verified. No impersonation,
    // password operation, email_confirm override, or direct identity edit.
    const generated = await db.auth.admin.generateLink({ type: 'email_change_new', email: current, newEmail: email });
    if (generated.error) fail(loginEmailChangeError(generated.error));
    if (generated.data.user?.id !== member) fail('인증 정보를 확인하지 못했습니다.', 503);
    // email_change_new's top-level hashed_token may hash the current address.
    // Use the new-address token from Auth's action link, after checking its origin.
    const authLink = new URL(generated.data.properties?.action_link || '');
    const authOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin;
    const token = authLink.searchParams.get('token');
    if (authLink.protocol !== 'https:' || authLink.origin !== authOrigin || authLink.pathname !== '/auth/v1/verify' || authLink.searchParams.get('type') !== 'email_change' || !token || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) fail('인증 정보를 확인하지 못했습니다.', 503);
    const link = new URL('/auth/confirm', origin);
    link.searchParams.set('token_hash', token);
    link.searchParams.set('type', 'email_change'); link.searchParams.set('flow', 'admin_email_change'); link.searchParams.set('change', id);
    await send(email, link.toString(), id);
    const saved = await db.from('audit_logs').update({ after_data: { ...detail, status: 'waiting', sent_at: new Date().toISOString() } }).eq('id', id);
    if (saved.error) fail('메일은 접수됐지만 처리 이력을 저장하지 못했습니다. 상태를 새로 확인해 주세요.', 503);
    return { message: '새 이메일로 확인 메일을 보냈습니다. 회원이 링크를 누르면 변경됩니다.', currentEmail: current, pendingEmail: email };
  } catch (error) {
    const status = (error as { status?: number }).status || 503;
    const message = status < 500 && error instanceof Error ? error.message : '변경 요청을 완료하지 못했습니다. 상태를 확인하고 다시 신청해 주세요.';
    const recorded = await db.from('audit_logs').update({ after_data: { ...detail, status: 'failed', error: message, finished_at: new Date().toISOString() } }).eq('id', id);
    if (recorded.error) fail('변경 요청과 이력 저장 결과를 확인하지 못했습니다. 운영 담당자에게 문의해 주세요.', 503);
    fail(message, status);
  }
}

// Only a verified Auth user can complete the matching request. No token in audit.
export async function completeAdminEmailChange(db: SupabaseClient, id: string, user: User) {
  if (!/^\d{1,20}$/.test(id) || user.new_email) return false;
  const result = await db.from('audit_logs').select('entity_id,after_data').eq('id', id).eq('action', action).eq('entity_type', 'member').maybeSingle();
  if (result.error) throw result.error;
  const row = result.data;
  if (!row || row.entity_id !== user.id || row.after_data?.new_email?.toLowerCase() !== user.email?.toLowerCase()) return false;
  const update = await db.from('audit_logs').update({ after_data: { ...row.after_data, error: null, status: 'completed', finished_at: new Date().toISOString() } }).eq('id', id);
  if (update.error) throw update.error;
  return true;
}
