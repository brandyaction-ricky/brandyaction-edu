import { getOperatorUser } from '@/lib/operator-permissions';
import { JEV_V4_BOUNDARY_CASES, type JevV4BoundaryCaseId } from '@/lib/conversion-jev-v4-boundary-cases';
import { createJevV4Judgment } from '@/lib/conversion-jev-v4';
import { conversionCapabilities, conversionError } from '@/lib/conversion-review-server';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.', 403);
    if (!conversionCapabilities(process.env).can_jev) conversionError('Jev 실험은 개발·검수 환경에서만 실행할 수 있습니다.', 403);
    const user = await getOperatorUser('members');
    if (!user) conversionError('회원 관리 권한이 필요합니다.', 403);
    const raw = await request.text();
    if (raw.length > 100) conversionError('요청 형식을 확인해 주세요.', 413);
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { conversionError('요청 형식을 확인해 주세요.'); }
    const id = decoded && typeof decoded === 'object' && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>).case_id : null;
    const testCase = JEV_V4_BOUNDARY_CASES.find(item => item.id === id as JevV4BoundaryCaseId);
    if (!testCase) conversionError('등록된 합성 경계 사례를 찾을 수 없습니다.', 400);
    const result = await createJevV4Judgment(testCase.subject, testCase.content, process.env.TYPESAFE_API_KEY || '');
    return reply({ ok: true, case: { id: testCase.id, title: testCase.title, reviewGuide: testCase.reviewGuide }, result });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
    return reply({ error: error instanceof Error && status !== 503 ? error.message : 'Jev v4 합성 사례 시험을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, status);
  }
}
