import { homeConsultationEnabled } from '@/lib/home-consultation-enabled';
import { readPublicFacts, findReply } from '@/lib/home-public-guidance';

export const maxDuration = 60;
export async function POST(request: Request) {
  if (!homeConsultationEnabled()) return new Response(null,{status:404});
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return new Response(null,{status:403});
  const body = await request.json().catch(()=>null);
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 1000) return new Response(null,{status:400});
  try {
    const facts = await readPublicFacts();
    return Response.json(await findReply(question, facts), { headers:{'Cache-Control':'private, no-store'} });
  } catch {
    return Response.json({error:'상담 자료나 AI 연결을 일시적으로 확인할 수 없습니다.'},{status:503});
  }
}
