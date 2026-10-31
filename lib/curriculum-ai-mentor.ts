import { randomUUID } from 'node:crypto';
import type { createAdminClient } from './supabase/admin';
import { loadQuestionAiContext } from './question-ai-context';
import { generateCurriculumAnswer } from './curriculum-ai-server';
export async function curriculumMentorDraft(db:ReturnType<typeof createAdminClient>, actor:string, questionId:string, unanswered:boolean) {
 const result=await db.from('edu_questions').select('id,title,content,lesson_id,course_id,enrollment_id,image_id,answer_head_id,is_resolved,status').eq('id',questionId).eq('is_archived',false).maybeSingle();
 if (result.error) throw result.error;
 const question=result.data;
 if (!question) throw Object.assign(new Error('질문을 찾을 수 없습니다.'),{status:404,expose:true});
 if (!question.enrollment_id || !question.lesson_id) return null;
 const recent=await db.from('edu_question_answers').select('source,content').eq('question_id',questionId).is('deleted_at',null).order('sequence',{ascending:false}).limit(6);
 if (recent.error) throw recent.error;
 const history=(recent.data || []).reverse().map(turn=>({role:turn.source==='learner'?'user' as const:'assistant' as const,text:turn.content.slice(0,1500)}));
 // Reuse the existing verified attachment loader. Never fetch client-supplied URLs.
 const imageContext=question.image_id ? await loadQuestionAiContext(db,actor,question) : null;
 const answer=await generateCurriculumAnswer(db,{actor,requestId:randomUUID(),mode:unanswered?'batch':'mentor',questionId,
  question:question.title+'\n'+question.content,history,image:imageContext?.image || undefined});
 return {draft:answer.answer,questionId,expectedHeadId:question.answer_head_id || null,
  reference:{lessonTitle:answer.sources[0]?.title || null,revision:answer.sources[0]?.revision || null,truncated:false,
   imageIncluded:Boolean(imageContext?.image),imageFirstFrame:imageContext?.reference.imageFirstFrame || false,contextMissing:!answer.sources.length,
   sources:answer.sources,searchedLessons:answer.searchedLessons,needsMentor:answer.needsMentor}};
}
