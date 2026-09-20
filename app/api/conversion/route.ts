import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { createMockJudgment, type ConversionCase, type ConversionEvidence } from '@/lib/conversion-review';
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
      db.from('edu_conversion_cases').select('id,source_type,question_id,course_id,cohort_id,subject,content,source_label,received_at,customer_id,input_version,created_at').order('created_at', { ascending: false }).limit(200),
      db.from('edu_conversion_evidence').select('id,course_id,cohort_id,title,body,source_url,version,status').order('created_at', { ascending: false }).limit(500),
      db.from('edu_questions').select('id,title,content,course_id,user_id,created_at,updated_at').eq('is_archived', false).order('created_at', { ascending: false }).limit(200),
      db.from('courses').select('id,title,status').order('created_at', { ascending: false }).limit(500),
      db.from('cohorts').select('id,course_id,name,status').order('created_at', { ascending: false }).limit(500),
      db.from('edu_conversion_runs').select('id,case_id,input_version,provider,result,evidence_versions,input_snapshot,evidence_snapshot,created_at').order('created_at', { ascending: false }).limit(500),
      db.from('edu_conversion_reviews').select('id,case_id,run_id,decision,reply_text,reason,created_at,actor_id').order('created_at', { ascending: false }).limit(500),
    ];
    const result = await Promise.all(requests);
    for (const item of result) if (item.error) conversionDatabaseError(item.error);
    const [cases, evidence, questions, courses, cohorts, runs, reviews] = result.map(item => item.data || []);
    return reply({ cases, evidence, questions, courses, cohorts, runs, reviews,
      capabilities: { can_manage_evidence: user.permissions.products, can_mock: conversionCapabilities(process.env).can_mock },
      limits: { cases: 200, evidence: 500, questions: 200, runs: 500, reviews: 500 } });
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
    if (action === 'analyze' && !conversionCapabilities(process.env).can_mock) return reply({ error: '모의 판단은 활성화된 개발·검수 환경에서만 실행할 수 있습니다.' }, 403);
    const db = createAdminClient();
    let result: unknown = null, evidence_versions: Record<string, number> | null = null, observed_version: number | null = null;
    if (action === 'analyze') {
      const found = await db.from('edu_conversion_cases').select('*').eq('id', payload.case_id).maybeSingle();
      if (found.error) conversionDatabaseError(found.error);
      if (!found.data) conversionError('문의를 찾을 수 없습니다.', 404);
      const inquiry = found.data as ConversionCase;
      observed_version = inquiry.input_version;
      const rows = await db.from('edu_conversion_evidence').select('*').eq('course_id', inquiry.course_id).eq('status', 'approved');
      if (rows.error) conversionDatabaseError(rows.error);
      const evidence = (rows.data as ConversionEvidence[] || []).filter(item => item.cohort_id === null || item.cohort_id === inquiry.cohort_id);
      evidence_versions = Object.fromEntries(evidence.map(item => [item.id, item.version]));
      result = createMockJudgment(inquiry, evidence);
    }
    const saved = await db.rpc('edu_conversion_mutate', { p_actor: user.id, p_request: requestId, p_action: action, p_payload: payload, p_payload_hash: payload_hash, p_result: result, p_evidence_versions: evidence_versions, p_observed_version: observed_version });
    if (saved.error) conversionDatabaseError(saved.error);
    return reply({ ok: true, ...saved.data });
  } catch (error) { return failure(error); }
}
