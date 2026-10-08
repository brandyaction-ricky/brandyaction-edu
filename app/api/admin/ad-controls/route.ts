import { getAdminUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDay } from '@/lib/edu-export-contract';
import { evaluateAdControl, isAdControlApprover, missingControl, validateAdPolicy, type AdEvidence } from '@/lib/edu-ad-controls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const unavailable = () => reply({ error: '상태를 확인하지 못했습니다. 새로 확인한 뒤 다시 시도해 주세요.' }, 503);
export async function GET() {
  try {
    const user = await getAdminUser();
    if (!user) return reply({ error: '관리자 로그인이 필요합니다.' }, 403);
    if (process.env.EDU_AD_CONTROLS_ENABLED !== 'true') return reply({ enabled: false, canManage: false, policies: [], evidence: [], history: [] });
    const db = createAdminClient(), now = new Date(), day = kstDay(now), signal = AbortSignal.timeout(5000);
    const [policies, snapshot, history] = await Promise.all([
      db.from('edu_ad_control_policies').select('*').order('updated_at', { ascending: false }).abortSignal(signal),
      db.rpc('edu_ad_control_source', { p_from: day, p_to: day, p_asof: now.toISOString() }).abortSignal(signal),
      db.from('edu_ad_control_history').select('cohort_id,revision,occurred_at,policy').order('occurred_at', { ascending: false }).limit(50).abortSignal(signal),
    ]);
    if (policies.error || snapshot.error || history.error || !Array.isArray(snapshot.data)) return unavailable();
    return reply({ enabled: true, canManage: isAdControlApprover(user.id, process.env.EDU_AD_CONTROL_APPROVER_IDS),
      policies: policies.data, history: history.data, evidence: snapshot.data.map((e: AdEvidence) => ({ ...e, control: evaluateAdControl(e, now) })),
      fallback: missingControl(), checkedAt: now.toISOString() });
  } catch { return unavailable(); }
}
export async function PUT(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
  try {
    const user = await getAdminUser();
    if (!user || !isAdControlApprover(user.id, process.env.EDU_AD_CONTROL_APPROVER_IDS)) return reply({ error: '대표 승인 계정만 변경할 수 있습니다.' }, 403);
    if (process.env.EDU_AD_CONTROLS_ENABLED !== 'true') return reply({ error: '검수가 끝난 뒤 활성화할 수 있습니다.' }, 503);
    let policy;
    try {
      const raw = await request.text();
      if (raw.length > 4000) return reply({ error: '입력 내용이 너무 깁니다.' }, 413);
      policy = validateAdPolicy(JSON.parse(raw));
    } catch { return reply({ error: '기수·예산·날짜·변경 사유와 1~72시간 기한을 확인해 주세요.' }, 400); }
    const saved = await createAdminClient().rpc('edu_ad_control_save', { p_actor: user.id, p_policy: policy }).abortSignal(AbortSignal.timeout(5000));
    if (saved.error?.message?.includes('AD_CONTROL_CHANGED')) return reply({ error: '다른 변경이 먼저 저장됐습니다. 새로 확인한 뒤 다시 입력해 주세요.' }, 409);
    if (saved.error || !saved.data) return unavailable();
    return reply({ policy: saved.data });
  } catch { return unavailable(); }
}
