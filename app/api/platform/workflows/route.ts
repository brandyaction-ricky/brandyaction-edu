import { processRefund } from '@/lib/refunds';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { hasLearningAccess } from '@/lib/platform-rules';
import { uuid, validateSetting } from '@/lib/edu-workflows';
import { publicQuiz, validateQuiz, type QuizDefinition } from '@/lib/mission-quiz';
import { safeUrl } from '@/lib/platform';
import { normalizeOperatorPermissions, permissionsFor } from '@/lib/operator-permissions';
import { participantMatrix } from '@/lib/participant-matrix';
import type { Row } from '@/lib/platform';

const reply = (value: unknown, status = 200) =>
    Response.json(value, {
        status,
        headers: { 'Cache-Control': 'private, no-store' },
    });
function fail(message: string, status = 400): never {
    throw Object.assign(new Error(message), { status });
}
function string(v: unknown, max = 200) {
    const s = String(v || '').trim();
    if (s.length > max) fail('입력 내용이 너무 깁니다.');
    return s;
}
function ids(v: unknown) {
    if (!Array.isArray(v) || !v.length || v.length > 50 || !v.every(uuid) || new Set(v).size !== v.length) fail('대상을 최대 50개까지 선택해 주세요.');
    return v;
}
function date(v: unknown) {
    if (!v || !Number.isFinite(Date.parse(String(v)))) fail('날짜를 확인해 주세요.');
    return new Date(String(v)).toISOString();
}
export async function GET(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
        const params = new URL(request.url).searchParams;
        const kind = params.get('kind');
        const db = createAdminClient();
        if (kind === 'quiz') {
            const missionId = params.get('mission');
            if (!uuid(missionId)) fail('미션을 확인해 주세요.');
            const { data: mission } = await db.from('curriculum_missions').select('*,curriculum_lessons!inner(is_published,curriculum_weeks!inner(is_published,course_id))').eq('id', missionId).single();
            if (!mission) fail('미션을 찾을 수 없습니다.', 404);
            if (user.role !== 'admin') {
                const lesson = mission.curriculum_lessons;
                const { data: enrollment } = await db.from('enrollments').select('*').eq('id', params.get('enrollment')).eq('user_id', user.id).eq('course_id', lesson.curriculum_weeks.course_id).maybeSingle();
                if (!enrollment || !hasLearningAccess(enrollment) || !mission.is_published || !lesson.is_published || !lesson.curriculum_weeks.is_published) fail('수강 권한이 필요합니다.', 403);
            }
            const { data: row, error } = await db.from('mission_quizzes').select('*').eq('mission_id', missionId).maybeSingle();
            if (error) throw error;
            const quiz = row
                ? ({
                      questions: row.questions,
                      passPercent: row.pass_percent,
                  } as QuizDefinition)
                : null;
            return reply({
                quiz: quiz ? (user.role === 'admin' ? { ...quiz, revision: row!.revision } : publicQuiz(quiz, row!.revision)) : null,
            });
        }
        const permissions = await permissionsFor(user);
        if (!permissions.members && !permissions.marketing) return reply({ error: '조회 권한이 필요합니다.' }, 403);
        if (kind === 'participants') {
            if (!permissions.members) return reply({ error: '회원 관리 권한이 필요합니다.' }, 403);
            const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1));
            const level = Number(params.get('level'));
            const r = await db.rpc('admin_participant_report', {
                p_cohort: uuid(params.get('cohort')) ? params.get('cohort') : null,
                p_search: string(params.get('search')),
                p_level: [1, 2, 3, 4, 5].includes(level) ? level : null,
                p_attention: params.get('attention') === '1' ? true : null,
                p_page: page,
            });
            if (r.error) throw r.error;
            const report = r.data as { rows: Row[]; weeks: Row[] };
            const week = report.weeks.find(row => row.id === params.get('week')) || report.weeks[0];
            const lessons = week ? await db.from('curriculum_lessons').select('id,title,day_number,display_order').eq('week_id', week.id).eq('is_published', true).order('display_order') : { data: [], error: null };
            if (lessons.error) throw lessons.error;
            const columns = (lessons.data || []) as Row[];
            const missionResult = columns.length ? await db.from('curriculum_missions').select('id,lesson_id').in('lesson_id', columns.map(row => row.id)).eq('is_published', true).eq('is_required', true) : { data: [], error: null };
            if (missionResult.error) throw missionResult.error;
            const missions = (missionResult.data || []) as Row[];
            const submissions: Row[] = [];
            if (report.rows.length && missions.length) {
                // Read only the authorized report page and selected week's required missions.
                for (let offset = 0; ; offset += 1000) {
                    const pageResult = await db.from('mission_submissions').select('id,enrollment_id,mission_id,status,attempt_number').in('enrollment_id', report.rows.map(row => row.id)).in('mission_id', missions.map(row => row.id)).order('id').range(offset, offset + 999);
                    if (pageResult.error) throw pageResult.error;
                    submissions.push(...(pageResult.data || []) as Row[]);
                    if ((pageResult.data || []).length < 1000) break;
                    if (offset >= 99000) fail('해당 주차의 제출 이력이 너무 많습니다. 더 좁은 회원 조건으로 조회해 주세요.');
                }
            }
            return reply({ ...report, weekId: week?.id || null, columns, matrix: participantMatrix(report.rows, columns, missions, submissions) });
        }
        if (kind === 'analytics') {
            if (!permissions.marketing) return reply({ error: '마케팅 관리 권한이 필요합니다.' }, 403);
            const from = date(params.get('from')),
                to = date(params.get('to'));
            if (from >= to || Date.parse(to) - Date.parse(from) > 366 * 86400000) fail('조회 기간은 1년 이내로 선택해 주세요.');
            const r = await db.rpc('edu_analytics_report', {
                p_from: from,
                p_to: to,
            });
            if (r.error) throw r.error;
            return reply(r.data);
        }
        fail('조회 종류를 확인해 주세요.');
    } catch (e) {
        const error = e as Error & { status?: number };
        if (!error.status || error.status >= 500) console.error('workflow read', 'unexpected');
        return reply({ error: error.status ? error.message : '정보를 불러오지 못했습니다.' }, error.status || 503);
    }
}
export async function POST(request: Request) {
    try {
        if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
        const user = await getAuthenticatedUser();
        if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
        const body = await request.json();
        const permissions = await permissionsFor(user);
        const db = createAdminClient();
        if (body.action === 'staff-permissions') {
            if (user.role !== 'admin') return reply({ error: '최고 관리자만 스태프 권한을 변경할 수 있습니다.' }, 403);
            if (!uuid(body.memberId) || body.memberId === user.id) fail('권한을 설정할 다른 회원을 선택해 주세요.');
            const value = normalizeOperatorPermissions(body.permissions);
            const member = await db.from('profiles').select('id,role,status').eq('id', body.memberId).maybeSingle();
            if (member.error || !member.data || member.data.status !== 'active') fail('활성 회원을 선택해 주세요.');
            if (member.data.role === 'admin') fail('최고 관리자 권한은 이 화면에서 변경할 수 없습니다.');
            const role = Object.values(value).some(Boolean) ? 'staff' : 'member';
            const profile = await db.from('profiles').update({ role }).eq('id', body.memberId);
            if (profile.error) throw profile.error;
            const key = `edu_staff_permissions_${body.memberId}`;
            const saved = role === 'staff' ? await db.from('site_settings').upsert({ key, value, is_public: false, updated_by: user.id }, { onConflict: 'key' }) : await db.from('site_settings').delete().eq('key', key);
            if (saved.error) throw saved.error;
            return reply({
                ok: true,
                message: role === 'staff' ? '스태프 권한을 저장했습니다.' : '스태프 권한을 해제했습니다.',
            });
        }
        const actionScope = ['session', 'clone-cohort', 'quiz'].includes(body.action) ? 'products' : ['review', 'grant-enrollment', 'assign'].includes(body.action) ? 'members' : body.action === 'refund' ? 'orders' : ['settings', 'crm-save'].includes(body.action) ? 'marketing' : null;
        if (!actionScope || !permissions[actionScope as keyof typeof permissions]) return reply({ error: '이 작업에 필요한 운영 권한이 없습니다.' }, 403);
        let result;
        if (body.action === 'crm-save') {
            const kind = String(body.kind || '');
            const id = body.id ? String(body.id) : null;
            if (id && !uuid(id)) fail('수정할 항목을 확인해 주세요.');
            if (kind === 'template') {
                const channel = String(body.channel || '');
                const purpose = String(body.purpose || '');
                const content = string(body.content, 2000);
                if (!string(body.name, 100) || !content || !['sms', 'lms', 'alimtalk'].includes(channel) || !['marketing', 'transactional'].includes(purpose)) fail('템플릿 이름·채널·내용을 확인해 주세요.');
                if (channel === 'alimtalk' && !string(body.alimtalkTemplateId, 200)) fail('승인된 알림톡 템플릿 ID를 입력해 주세요.');
                const values = {
                    name: string(body.name, 100),
                    channel,
                    purpose,
                    content,
                    alimtalk_template_id: channel === 'alimtalk' ? string(body.alimtalkTemplateId, 200) : null,
                    is_active: body.isActive === true,
                };
                result = id
                    ? await db.from('crm_templates').update(values).eq('id', id).select().single()
                    : await db
                          .from('crm_templates')
                          .insert({ ...values, created_by: user.id })
                          .select()
                          .single();
            } else if (kind === 'campaign') {
                if (!string(body.name, 100) || !uuid(body.templateId) || (body.tagId && !uuid(body.tagId))) fail('캠페인 이름·템플릿·대상을 확인해 주세요.');
                const scheduledAt = date(body.scheduledAt);
                if (Date.parse(scheduledAt) < Date.now() - 60000) fail('예약 시각은 현재 이후로 선택해 주세요.');
                const values = {
                    name: string(body.name, 100),
                    template_id: body.templateId,
                    target_tag_id: body.tagId || null,
                    scheduled_at: scheduledAt,
                    status: 'scheduled',
                    error_message: null,
                };
                result = id
                    ? await db.from('crm_campaigns').update(values).eq('id', id).in('status', ['draft', 'scheduled', 'failed', 'cancelled']).select().single()
                    : await db
                          .from('crm_campaigns')
                          .insert({ ...values, created_by: user.id })
                          .select()
                          .single();
            } else if (kind === 'automation') {
                const trigger = String(body.triggerType || '');
                const delay = Number(body.delayMinutes);
                if (!string(body.name, 100) || !uuid(body.templateId) || !['member_joined', 'marketing_consent', 'tag_assigned', 'purchase_completed'].includes(trigger) || !Number.isSafeInteger(delay) || delay < 0 || delay > 525600) fail('자동 메시지 조건을 확인해 주세요.');
                if (trigger === 'tag_assigned' && body.tagId && !uuid(body.tagId)) fail('자동화 태그를 확인해 주세요.');
                if (trigger === 'purchase_completed' && body.courseId && !uuid(body.courseId)) fail('자동화 상품을 확인해 주세요.');
                const values = {
                    name: string(body.name, 100),
                    trigger_type: trigger,
                    trigger_tag_id: trigger === 'tag_assigned' ? body.tagId || null : null,
                    trigger_course_id: trigger === 'purchase_completed' ? body.courseId || null : null,
                    template_id: body.templateId,
                    delay_minutes: delay,
                    is_active: body.isActive === true,
                };
                result = id
                    ? await db.from('crm_automations').update(values).eq('id', id).select().single()
                    : await db
                          .from('crm_automations')
                          .insert({ ...values, created_by: user.id })
                          .select()
                          .single();
            } else fail('CRM 작업 종류를 확인해 주세요.');
            if (result.error) throw result.error;
            return reply({
                ok: true,
                result: result.data,
                message: kind === 'campaign' ? '캠페인 발송을 예약했습니다.' : 'CRM 설정을 저장했습니다.',
            });
        }
        if (body.action === 'refund') return processRefund(user.id, body);
        if (body.action === 'grant-enrollment') {
            if (!uuid(body.memberId) || !uuid(body.cohortId) || string(body.reason, 500).length < 2) fail('회원·기수·발급 사유를 확인해 주세요.');
            const ends = body.endsAt ? date(body.endsAt) : null;
            if (ends && Date.parse(ends) <= Date.now()) fail('만료일은 현재 이후로 선택해 주세요.');
            result = await db.rpc('edu_grant_enrollment', {
                p_actor: user.id,
                p_member: body.memberId,
                p_cohort: body.cohortId,
                p_ends: ends,
                p_reason: string(body.reason, 500),
            });
        } else if (body.action === 'session') {
            const v = body.values || {};
            if (!uuid(v.cohort_id) || (body.id && !uuid(body.id)) || !Number.isSafeInteger(v.session_number) || v.session_number < 1 || v.session_number > 365 || !string(v.title) || typeof v.is_public !== 'boolean') fail('회차의 기수·순서·제목을 확인해 주세요.');
            for (const field of ['live_url', 'replay_url']) if (v[field] && (!safeUrl(v[field]) || !/^https?:\/\//.test(v[field]) || String(v[field]).length > 2000)) fail('라이브·다시보기 주소를 확인해 주세요.');
            result = await db.rpc('edu_save_session', {
                p_actor: user.id,
                p_id: body.id || null,
                p_values: {
                    cohort_id: v.cohort_id,
                    session_number: v.session_number,
                    title: string(v.title),
                    description: string(v.description, 3000),
                    scheduled_at: v.scheduled_at ? date(v.scheduled_at) : null,
                    is_public: v.is_public,
                    live_url: v.live_url || '',
                    replay_url: v.replay_url || '',
                },
            });
        } else if (body.action === 'clone-cohort') {
            if (!uuid(body.id) || !string(body.name, 100) || !string(body.code, 80) || !Number.isInteger(body.shift) || Math.abs(body.shift) > 3650) fail('복제할 기수 정보를 확인해 주세요.');
            result = await db.rpc('edu_clone_cohort', {
                p_actor: user.id,
                p_source: body.id,
                p_name: body.name.trim(),
                p_code: body.code.trim(),
                p_shift: body.shift,
            });
        } else if (body.action === 'quiz') {
            if (!uuid(body.missionId) || (body.revision && !uuid(body.revision))) fail('미션을 확인해 주세요.');
            if (body.quiz !== null) {
                const error = validateQuiz(body.quiz);
                if (error) fail(error);
            }
            result = await db.rpc('edu_save_quiz', {
                p_actor: user.id,
                p_mission: body.missionId,
                p_revision: body.revision || null,
                p_quiz: body.quiz,
            });
        } else if (body.action === 'review') {
            if (!['approved', 'changes_requested', 'rejected'].includes(body.decision)) fail('검토 결과를 선택해 주세요.');
            const feedback = string(body.feedback, 2000);
            if (body.decision !== 'approved' && !feedback) fail('보완·반려 사유를 입력해 주세요.');
            result = await db.rpc('review_mission_submissions', {
                p_actor: user.id,
                p_ids: ids(body.ids),
                p_decision: body.decision,
                p_feedback: feedback,
            });
        } else if (body.action === 'assign') {
            if (!['tag', 'coupon'].includes(body.kind) || !uuid(body.targetId) || typeof body.remove !== 'boolean') fail('태그 또는 쿠폰을 선택해 주세요.');
            result = await db.rpc('edu_assign_customers', {
                p_actor: user.id,
                p_members: ids(body.ids),
                p_kind: body.kind,
                p_target: body.targetId,
                p_remove: body.remove,
            });
        } else if (body.action === 'settings') {
            let value;
            try {
                value = validateSetting(body.kind, body.values || {});
            } catch (e) {
                fail((e as Error).message);
            }
            const key = body.kind === 'seo' ? 'edu_seo' : body.kind === 'settings' ? 'edu_operations' : 'edu_metric_' + value.date + '_' + Buffer.from(String(value.campaign)).toString('base64url');
            result = await db.from('site_settings').upsert({ key, value, is_public: false }, { onConflict: 'key' });
        } else fail('작업 종류를 확인해 주세요.');
        if (result.error) {
            if (!['23505', '23514', '23503', '23502', 'P0001'].includes(result.error.code)) console.error('workflow write', result.error.code);
            const message = /[가-힣]/.test(result.error.message) ? result.error.message : result.error.code === '23505' ? '이미 사용 중인 코드 또는 회차 순서입니다.' : '저장하지 못했습니다. 입력값을 확인해 주세요.';
            return reply({ error: message }, 409);
        }
        return reply({ ok: true, result: result.data });
    } catch (e) {
        const error = e as Error & { status?: number };
        return reply({ error: error.status ? error.message : '요청 내용을 확인해 주세요.' }, error.status || 400);
    }
}
