import {getOperatorUser} from '@/lib/operator-permissions';
import {arrivalPublicationEnabled} from '@/features/campus/arrival/preview-gate';
import {readArrivalPublicationRequest} from '@/features/campus/arrival/publication';
import {arrivalPublicationStatus, publishArrival, readPublishedArrival} from '@/features/campus/arrival/publication-server';
import {readSpaceJson} from '@/features/campus/space/body';
import {fail} from '@/features/campus/webinar/domain';
import {privateReply, problem} from '@/features/campus/webinar/server';

async function actor() {
  if (!arrivalPublicationEnabled()) fail('이 환경에서는 모집 체험을 공개할 수 없어요.', 404);
  const user = await getOperatorUser('marketing');
  if (!user) fail('마케팅 운영 권한이 필요합니다.', 403);
  return user;
}

export async function GET() {
  try {
    await actor();
    return privateReply({publication: arrivalPublicationStatus(await readPublishedArrival())});
  } catch (error) {
    return problem(error);
  }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('요청 출처를 확인해 주세요.', 403);
    const user = await actor();
    const input = readArrivalPublicationRequest(await readSpaceJson(request, 2048));
    return privateReply({publication: await publishArrival(input, user.id)});
  } catch (error) {
    return problem(error);
  }
}
