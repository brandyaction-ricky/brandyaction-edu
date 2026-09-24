import { getOperatorUser } from '@/lib/operator-permissions';
import { JEV_V4_BOUNDARY_CASES } from '@/lib/conversion-jev-v4-boundary-cases';
import { conversionCapabilities, conversionError } from '@/lib/conversion-review-server';

export async function GET(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.', 403);
    if (!conversionCapabilities(process.env).can_jev) conversionError('Jev 실험은 개발·검수 환경에서만 사용할 수 있습니다.', 403);
    const user = await getOperatorUser('members');
    if (!user) conversionError('회원 관리 권한이 필요합니다.', 403);
    return Response.json({ cases: JEV_V4_BOUNDARY_CASES.map(({ id, title, reviewGuide }) => ({ id, title, reviewGuide })) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
    return Response.json({ error: error instanceof Error && status !== 503 ? error.message : '합성 사례 목록을 불러오지 못했습니다.' },
      { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
