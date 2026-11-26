import { uuid } from '@/lib/edu-workflows';
import { hubBody, hubFail, hubReply } from '@/lib/question-hub-server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';

async function admin() {
  const user = await getAuthenticatedUser();
  if (!user) hubFail('로그인이 필요합니다.', 401);
  if (user.role !== 'admin') hubFail('관리자만 협력자 권한을 관리할 수 있습니다.', 403);
  return user;
}
function failure(error: unknown) {
  const status = (error as { status?: number }).status || 503;
  return hubReply({ error: status < 500 ? (error as Error).message : '협력자 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, status);
}

export async function GET(request: Request) {
  try {
    await admin();
    const member = new URL(request.url).searchParams.get('member');
    if (!uuid(member)) hubFail('회원을 확인해 주세요.');
    const db = createAdminClient();
    const [profile, grants, cohorts] = await Promise.all([
      db.from('profiles').select('id').eq('id', member).eq('role', 'student').eq('status', 'active').maybeSingle(),
      db.from('edu_external_partner_access')
        .select('id,access_ends_at,revoked_at,courses(title),cohorts(name)').eq('user_id', member)
        .order('created_at', { ascending: false }).limit(100),
      db.from('cohorts').select('id,name,course_id,courses!inner(title)')
        .is('archived_at', null).eq('courses.status', 'published').is('courses.archived_at', null).order('name'),
    ]);
    if (profile.error || grants.error || cohorts.error) throw Error('partner access query failed');
    if (!profile.data) hubFail('활성 회원 계정을 확인해 주세요.', 404);
    return hubReply({ grants: grants.data, cohorts: cohorts.data });
  } catch (error) {
    return failure(error);
  }
}

const errors: Record<string, string> = {
  PARTNER_ADMIN_REQUIRED: '관리자만 협력자 권한을 관리할 수 있습니다.',
  PARTNER_GRANT_NOT_FOUND: '회수할 권한을 찾지 못했습니다.',
  PARTNER_EXPIRY_INVALID: '오늘 또는 이후 날짜를 이용 종료일로 선택해 주세요.',
  PARTNER_MEMBER_UNAVAILABLE: '활성 회원 계정을 확인해 주세요.',
  PARTNER_COHORT_UNAVAILABLE: '이용할 수 있는 과정과 캠퍼스 기수를 선택해 주세요.',
  PARTNER_GRANT_EXISTS: '이 기수에 이미 이용 가능한 권한이 있습니다.',
};
export async function POST(request: Request) {
  try {
    const actor = await admin();
    const input = await hubBody(request);
    const { member, access, course, cohort, endDate } = input;
    const revoke = input.action === 'revoke';
    if (!uuid(member) || (revoke ? !uuid(access) : input.action !== 'grant' || !uuid(course) || !uuid(cohort))) {
      hubFail('회원과 이용 범위를 확인해 주세요.');
    }
    let expires = null;
    if (!revoke) {
      const date = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? new Date(endDate + 'T00:00:00.000Z') : null;
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== endDate) hubFail('이용 종료일을 확인해 주세요.');
      const endOfDay = new Date(Date.parse(endDate + 'T00:00:00+09:00') + 86_400_000);
      expires = endOfDay.toISOString();
    }
    const result = await createAdminClient().rpc('edu_set_external_partner_access', {
      p_actor: actor.id, p_access: revoke ? access : null, p_user: member, p_course: revoke ? null : course,
      p_cohort: revoke ? null : cohort, p_expires: expires,
    });
    if (result.error) {
      const known = errors[result.error.message];
      if (known) hubFail(known, result.error.code === '42501' ? 403 : 409);
      throw result.error;
    }
    return hubReply({ ok: true, access: result.data });
  } catch (error) {
    return failure(error);
  }
}
