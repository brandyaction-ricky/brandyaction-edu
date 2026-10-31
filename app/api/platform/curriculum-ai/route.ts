import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';
import { parseAiTurns } from '@/lib/curriculum-ai';
import { aiErrorReply, generateCurriculumAnswer, readAiBody } from '@/lib/curriculum-ai-server';
export const maxDuration = 60;
const reply = (data:unknown,status=200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function POST(request:Request) {
 try {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({error:'요청 출처를 확인해 주세요.'},403);
  if (process.env.EDU_CURRICULUM_AI_ENABLED !== 'true') return reply({error:'AI 질문 기능은 준비 중이에요.'},404);
  const user = await getAuthenticatedUser(); if (!user) return reply({error:'로그인이 필요해요.'},401);
  const body = await readAiBody(request);
  if (![body.requestId,body.enrollmentId,body.lessonId].every(uuid) || typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000) return reply({error:'수업과 질문 내용을 확인해 주세요.'},400);
  if (body.imageId !== undefined && body.imageId !== null && (!uuid(body.imageId) || process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED !== 'true')) return reply({error:'첨부 이미지를 확인해 주세요.'},400);
  let history; try { history=parseAiTurns(body.history); } catch { return reply({error:'대화 길이를 줄여 다시 질문해 주세요.'},400); }
  const result = await generateCurriculumAnswer(createAdminClient(),{actor:user.id,requestId:body.requestId,mode:'student',enrollmentId:body.enrollmentId,lessonId:body.lessonId,question:body.question.trim(),history,...(body.imageId?{imageId:body.imageId}:{})});
  return reply(result);
 } catch (error) { const result=aiErrorReply(error); return reply({error:result.error},result.status); }
}
