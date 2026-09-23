import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { conversionAdjudicationPayload, conversionCapabilities, conversionDatabaseError, conversionError } from '@/lib/conversion-review-server';
import type { JevCalibration, JevResult } from '@/lib/conversion-review';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.', 403);
    if (!conversionCapabilities(process.env).can_jev) conversionError('재검토 기록은 개발·검수 환경에서만 사용할 수 있습니다.', 403);
    const user = await getOperatorUser('members');
    if (!user) conversionError('회원 관리 권한이 필요합니다.', 403);
    const raw = await request.text();
    if (raw.length > 3000) conversionError('입력 내용이 너무 큽니다.', 413);
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { conversionError('요청 형식을 확인해 주세요.'); }
    const { requestId, payload, payloadHash } = conversionAdjudicationPayload(decoded);
    const db = createAdminClient();
    const runQuery = await db.from('edu_conversion_runs').select('id,case_id,input_version,provider,result').eq('id', payload.run_id).maybeSingle();
    if (runQuery.error) conversionDatabaseError(runQuery.error);
    const run = runQuery.data;
    if (!run || run.provider !== 'jev' || run.result?.mode !== 'jev') conversionError('Jev 판정 기록을 찾을 수 없습니다.', 404);
    const [caseQuery, reviewQuery, firstQuery] = await Promise.all([
      db.from('edu_conversion_cases').select('id,input_version').eq('id', run.case_id).maybeSingle(),
      db.from('edu_conversion_reviews').select('id,case_id,run_id,calibration,calibration_sample_kind').eq('id', payload.calibration_review_id).maybeSingle(),
      db.from('edu_conversion_reviews').select('id').eq('case_id', run.case_id).not('calibration', 'is', null).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle(),
    ]);
    for (const query of [caseQuery, reviewQuery, firstQuery]) if (query.error) conversionDatabaseError(query.error);
    const review = reviewQuery.data;
    if (!caseQuery.data || caseQuery.data.input_version !== run.input_version) conversionError('문의가 변경됐습니다. 최신 내용을 확인해 주세요.', 409);
    if (!review || review.id !== firstQuery.data?.id || review.case_id !== run.case_id || review.run_id !== run.id
      || review.calibration_sample_kind !== 'operational' || !review.calibration) conversionError('첫 실제 문의 독립 판정 기록을 확인해 주세요.', 409);
    const dimension = payload.dimension as keyof JevCalibration;
    const calibration = review.calibration as JevCalibration;
    const result = run.result as JevResult;
    const answer = result.decisions?.[dimension];
    if (!answer) conversionError('Jev 판정 항목을 확인해 주세요.');
    const predicted = dimension === 'purchase_readiness' ? Math.round(result.decisions.purchase_readiness.score) : (answer as { choice: string }).choice;
    if (predicted === calibration[dimension] && ['human_better_supported', 'jev_better_supported'].includes(payload.assessment)) {
      conversionError('두 의견이 같은 항목에는 한쪽 우세를 선택할 수 없습니다.');
    }
    const saved = await db.from('edu_conversion_adjudication_notes').insert({
      ...payload, actor_id: user.id, request_id: requestId, payload_hash: payloadHash,
    }).select('id,run_id,calibration_review_id,dimension,assessment,basis,rationale,actor_id,created_at').single();
    if (saved.error?.code === '23505') {
      const previous = await db.from('edu_conversion_adjudication_notes').select('id,run_id,calibration_review_id,dimension,assessment,basis,rationale,actor_id,created_at,payload_hash').eq('actor_id', user.id).eq('request_id', requestId).maybeSingle();
      if (previous.error) conversionDatabaseError(previous.error);
      if (previous.data?.payload_hash !== payloadHash) conversionError('같은 요청 ID로 다른 내용을 저장할 수 없습니다.', 409);
      const { payload_hash: _hash, ...note } = previous.data;
      void _hash;
      return reply({ ok: true, note });
    }
    if (saved.error) conversionDatabaseError(saved.error);
    return reply({ ok: true, note: saved.data });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
    return reply({ error: error instanceof Error && status !== 503 ? error.message : '재검토 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, status);
  }
}
