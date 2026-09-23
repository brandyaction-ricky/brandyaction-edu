import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { createMockJudgment, type ConversionCase, type ConversionEvidence } from '@/lib/conversion-review';
import { createJevJudgment } from '@/lib/conversion-jev';
import { conversionCapabilities, conversionDatabaseError, conversionError, conversionPayload } from '@/lib/conversion-review-server';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
function failure(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
  return reply({ error: error instanceof Error && status !== 503 ? error.message : '전환 관리 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, status);
}
async function operator() {
  if (!conversionCapabilities(process.env).enabled) conversionError('전환 관리 기능이 활성화되지 않았습니다.', 404);
  const user = await getOperatorUser('members');
  if (!user) conversionError('회원 관리 권한이 필요합니다.', 403);
  return user;
}
export async function GET() {
  try {
    const user = await operator(), db = createAdminClient();
    const requests = [
      db.from('edu_conversion_cases').select('id,source_type,sample_origin,legacy_course_label,question_id,course_id,cohort_id,subject,content,source_label,received_at,customer_id,input_version,created_at').order('created_at', { ascending: false }).limit(200),
      db.from('edu_conversion_evidence').select('id,course_id,cohort_id,title,body,source_url,version,status').order('created_at', { ascending: false }).limit(500),
      db.from('edu_questions').select('id,title,content,course_id,user_id,created_at,updated_at').eq('is_archived', false).order('created_at', { ascending: false }).limit(200),
      db.from('courses').select('id,title,status').order('created_at', { ascending: false }).limit(500),
      db.from('cohorts').select('id,course_id,name,status').order('created_at', { ascending: false }).limit(500),
      db.from('edu_conversion_runs').select('id,case_id,input_version,provider,result,evidence_versions,input_snapshot,evidence_snapshot,created_at').order('created_at', { ascending: false }).limit(500),
      db.from('edu_conversion_reviews').select('id,case_id,run_id,decision,reply_text,reason,calibration,calibration_sample_kind,created_at,actor_id').order('created_at', { ascending: false }).limit(500),
    ];
    const result = await Promise.all(requests);
    for (const item of result) if (item.error) conversionDatabaseError(item.error);
    const notes = await db.from('edu_conversion_adjudication_notes').select('id,run_id,calibration_review_id,dimension,assessment,basis,rationale,actor_id,created_at').order('created_at', { ascending: false }).limit(500);
    // Vercel may switch to this code before the develop-branch migration job finishes.
    const pendingMigration = ['42P01', 'PGRST205'].includes(notes.error?.code || '');
    if (notes.error && !pendingMigration) conversionDatabaseError(notes.error);
    const v2 = await db.from('edu_conversion_jev_v2_runs').select('id,v1_run_id,case_id,calibration_review_id,input_version,status,result,created_at,updated_at').order('created_at', { ascending: false }).limit(500);
    const pendingV2Migration = ['42P01', 'PGRST205'].includes(v2.error?.code || '');
    if (v2.error && !pendingV2Migration) conversionDatabaseError(v2.error);
    const v3 = await db.from('edu_conversion_jev_v3_runs').select('id,v1_run_id,case_id,calibration_review_id,input_version,status,result,created_at,updated_at').order('created_at', { ascending: false }).limit(500);
    const pendingV3Migration = ['42P01', 'PGRST205'].includes(v3.error?.code || '');
    if (v3.error && !pendingV3Migration) conversionDatabaseError(v3.error);
    const v4 = await db.from('edu_conversion_jev_v4_runs').select('id,v1_run_id,case_id,calibration_review_id,input_version,status,result,created_at,updated_at').order('created_at', { ascending: false }).limit(500);
    const pendingV4Migration = ['42P01', 'PGRST205'].includes(v4.error?.code || '');
    if (v4.error && !pendingV4Migration) conversionDatabaseError(v4.error);
    const [cases, evidence, questions, courses, cohorts, runs, reviews] = result.map(item => item.data || []);
    return reply({ cases, evidence, questions, courses, cohorts, runs, reviews, adjudications: notes.data || [], jev_v2_runs: v2.data || [], jev_v3_runs: v3.data || [], jev_v4_runs: v4.data || [],
      capabilities: { can_manage_evidence: user.permissions.products, ...conversionCapabilities(process.env), can_adjudicate: !pendingMigration && conversionCapabilities(process.env).can_jev, can_jev_v2: !pendingV2Migration && conversionCapabilities(process.env).can_jev, can_jev_v3: !pendingV3Migration && conversionCapabilities(process.env).can_jev, can_jev_v4: !pendingV4Migration && conversionCapabilities(process.env).can_jev, can_manage_funnel: user.permissions.products && user.permissions.marketing },
      limits: { cases: 200, evidence: 500, questions: 200, runs: 500, reviews: 500, adjudications: 500, jev_v2_runs: 500, jev_v3_runs: 500, jev_v4_runs: 500 } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
    const user = await operator();
    const raw = await request.text();
    if (raw.length > 40000) return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { return reply({ error: '요청 형식을 확인해 주세요.' }, 400); }
    const { action, requestId, payload, payload_hash } = conversionPayload(decoded);
    if (action === 'save_evidence' && !user.permissions.products) return reply({ error: '설명자료 변경에는 상품 관리 권한도 필요합니다.' }, 403);
    const capabilities = conversionCapabilities(process.env);
    if (action === 'analyze' && !capabilities.can_analyze) return reply({ error: '판정 기능은 활성화된 개발·검수 환경에서만 실행할 수 있습니다.' }, 403);
    const db = createAdminClient();
    let result: unknown = null, evidence_versions: Record<string, number> | null = null, observed_version: number | null = null;
    if (action === 'analyze') {
      const found = await db.from('edu_conversion_cases').select('*').eq('id', payload.case_id).maybeSingle();
      if (found.error) conversionDatabaseError(found.error);
      if (!found.data) conversionError('문의를 찾을 수 없습니다.', 404);
      const inquiry = found.data as ConversionCase;
      observed_version = inquiry.input_version;
      const rows = inquiry.course_id
        ? await db.from('edu_conversion_evidence').select('*').eq('course_id', inquiry.course_id).eq('status', 'approved')
        : null;
      if (rows?.error) conversionDatabaseError(rows.error);
      const evidence = (rows?.data as ConversionEvidence[] || []).filter(item => item.cohort_id === null || item.cohort_id === inquiry.cohort_id);
      evidence_versions = Object.fromEntries(evidence.map(item => [item.id, item.version]));
      result = capabilities.can_jev
        ? await createJevJudgment(inquiry, evidence, process.env.TYPESAFE_API_KEY || '')
        : createMockJudgment(inquiry, evidence);
    }
    const saved = await db.rpc('edu_conversion_mutate', { p_actor: user.id, p_request: requestId, p_action: action, p_payload: payload, p_payload_hash: payload_hash, p_result: result, p_evidence_versions: evidence_versions, p_observed_version: observed_version });
    if (saved.error) conversionDatabaseError(saved.error);
    return reply({ ok: true, ...saved.data });
  } catch (error) { return failure(error); }
}
