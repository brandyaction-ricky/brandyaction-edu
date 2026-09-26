import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { createJevV2Judgment } from '@/lib/conversion-jev-v2';
import { conversionCapabilities, conversionDatabaseError, conversionError, conversionId } from '@/lib/conversion-review-server';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  let reservationId: string | null = null;
  const db = createAdminClient();
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.', 403);
    if (!conversionCapabilities(process.env).can_jev) conversionError('Jev 실험은 개발·검수 환경에서만 실행할 수 있습니다.', 403);
    const user = await getOperatorUser('members');
    if (!user) conversionError('회원 관리 권한이 필요합니다.', 403);
    const raw = await request.text();
    if (raw.length > 500) conversionError('입력 내용이 너무 큽니다.', 413);
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { conversionError('요청 형식을 확인해 주세요.'); }
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) conversionError('요청 형식을 확인해 주세요.');
    const v1RunId = conversionId((decoded as Record<string, unknown>).v1_run_id)!;
    const runQuery = await db.from('edu_conversion_runs').select('id,case_id,input_version,provider,result,input_snapshot').eq('id', v1RunId).maybeSingle();
    if (runQuery.error) conversionDatabaseError(runQuery.error);
    const run = runQuery.data;
    if (!run || run.provider !== 'jev' || run.result?.mode !== 'jev' || run.result?.decision_version !== 1
      || typeof run.input_snapshot?.subject !== 'string' || typeof run.input_snapshot?.content !== 'string') conversionError('비교할 v1 Jev 판정 원문을 찾을 수 없습니다.', 404);
    const [caseQuery, firstQuery] = await Promise.all([
      db.from('edu_conversion_cases').select('id,input_version,archived_at').eq('id', run.case_id).maybeSingle(),
      db.from('edu_conversion_reviews').select('id,run_id,calibration_sample_kind,calibration').eq('case_id', run.case_id).not('calibration', 'is', null)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (caseQuery.error) conversionDatabaseError(caseQuery.error);
    if (firstQuery.error) conversionDatabaseError(firstQuery.error);
    if (!caseQuery.data || caseQuery.data.input_version !== run.input_version) conversionError('문의가 변경됐습니다. 최신 내용을 확인해 주세요.', 409);
    if (caseQuery.data.archived_at) conversionError('삭제한 문의는 먼저 복구해야 다시 살펴볼 수 있습니다.', 409);
    const first = firstQuery.data;
    if (!first || first.run_id !== run.id || first.calibration_sample_kind !== 'operational' || !first.calibration) conversionError('첫 실제 문의 독립 판정이 있는 v1 기록만 비교할 수 있습니다.', 409);

    const existingQuery = await db.from('edu_conversion_jev_v2_runs').select('id,status,result,updated_at').eq('v1_run_id', run.id).maybeSingle();
    if (existingQuery.error) conversionDatabaseError(existingQuery.error);
    const existing = existingQuery.data;
    if (existing?.status === 'completed') return reply({ ok: true, result: existing.result, already_saved: true });
    if (existing) {
      const expired = existing.status === 'pending' && Date.parse(existing.updated_at) < Date.now() - 60_000;
      if (existing.status !== 'failed' && !expired) conversionError('이 문의의 v2 판정이 진행 중입니다. 잠시 후 새로고침해 주세요.', 409);
      let renewal = db.from('edu_conversion_jev_v2_runs').update({ status: 'pending', result: null, actor_id: user.id, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('status', existing.status);
      if (expired) renewal = renewal.eq('updated_at', existing.updated_at);
      const claimed = await renewal.select('id').maybeSingle();
      if (claimed.error) conversionDatabaseError(claimed.error);
      if (!claimed.data) conversionError('다른 작업이 먼저 실행되었습니다. 새로고침해 주세요.', 409);
      reservationId = claimed.data!.id;
    } else {
      const claimed = await db.from('edu_conversion_jev_v2_runs').insert({ v1_run_id: run.id, case_id: run.case_id,
        calibration_review_id: first.id, input_version: run.input_version, status: 'pending', actor_id: user.id }).select('id').single();
      if (claimed.error?.code === '23505') conversionError('이 문의의 v2 판정이 진행 중입니다. 잠시 후 새로고침해 주세요.', 409);
      if (claimed.error) conversionDatabaseError(claimed.error);
      reservationId = claimed.data!.id;
    }

    const result = await createJevV2Judgment(run.input_snapshot.subject, run.input_snapshot.content, process.env.TYPESAFE_API_KEY || '');
    const saved = await db.from('edu_conversion_jev_v2_runs').update({ status: 'completed', result, updated_at: new Date().toISOString() })
      .eq('id', reservationId).eq('status', 'pending').select('id').maybeSingle();
    if (saved.error) conversionDatabaseError(saved.error);
    if (!saved.data) conversionError('판정 저장 상태가 변경되었습니다. 새로고침해 주세요.', 409);
    reservationId = null;
    return reply({ ok: true, result, already_saved: false });
  } catch (error) {
    if (reservationId) await db.from('edu_conversion_jev_v2_runs').update({ status: 'failed', result: null, updated_at: new Date().toISOString() }).eq('id', reservationId).eq('status', 'pending');
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
    return reply({ error: error instanceof Error && status !== 503 ? error.message : 'Jev v2 판정을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, status);
  }
}
