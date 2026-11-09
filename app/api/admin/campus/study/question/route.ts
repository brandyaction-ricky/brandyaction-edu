import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { readReviewLesson, reviewSelection } from '@/features/campus/study-review';
import { parseAiTurns, retrieveCurriculum, curriculumInstructions } from '@/lib/curriculum-ai';
import { hasSensitiveQuestionText, sensitiveQuestionMessage } from '@/lib/curriculum-ai-sensitive';
import { readAiBody } from '@/lib/curriculum-ai-server';
import { lessonBodyPlainText } from '@/lib/lesson-body';
import { uuid } from '@/lib/edu-workflows';

export const maxDuration = 60;
const reply = (value:object,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function POST(req:Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return reply({error:'요청 출처를 확인해 주세요.'},403);
  const actor = await getOperatorUser('products');
  if (!actor) return reply({error:'수업 미리보기 권한이 필요합니다.'},403);
  if (process.env.EDU_CURRICULUM_AI_ENABLED!=='true' || !process.env.OPENAI_API_KEY) return reply({error:'AI 연결을 사용할 수 없습니다.'},503);
  try {
    const {cohort,lesson,question,history} = await readAiBody(req);
    if (!uuid(cohort)||!uuid(lesson)||typeof question!=='string'||!question.trim()||question.length>1500) return reply({error:'수업과 질문을 확인해 주세요.'},400);
    let turns;
    try { turns=parseAiTurns(history); } catch { return reply({error:'대화를 닫고 새 질문을 시작해 주세요.'},400); }
    if ([question,...turns.map(t=>t.text)].some(hasSensitiveQuestionText)) return reply({error:sensitiveQuestionMessage},400);
    const db=createAdminClient();
    const {selectedCohort,selected}=await reviewSelection(db,cohort,lesson);
    // The picker may fall back for navigation. A submitted question must match exactly.
    if(selectedCohort?.id!==cohort || selected?.id!==lesson || !selected) return reply({error:'미리볼 수 없는 수업입니다.'},404);
    const {document,material}=await readReviewLesson(db,actor.id,lesson);
    const text=document ? [...document.blocks.flatMap(b=>[b.content && lessonBodyPlainText(b.content),b.alt,b.question?.label,...(b.fields||[]).map(f=>f.label)]),...document.checklist.map(c=>c.label)].filter(Boolean).join('\n') : lessonBodyPlainText(material.body||'');
    const {sources}=retrieveCurriculum([{id:lesson,title:selected.title,body_text:text,description:material.description}], [...turns.map(t=>t.text),question].join('\n'),lesson,false,question);
    if(!sources.length) return reply({error:'이 수업에서 참고할 본문을 찾지 못했어요.'},422);
    // Preview has no enrollment, student conversation ID, persistence or mentor handoff.
    const model=process.env.OPENAI_MODEL||'gpt-6.1-terra';
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(35000),
      headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model,store:false,max_output_tokens:1800,...(['gpt-5-mini','gpt-6.1-terra'].includes(model)?{reasoning:{effort:'low'}}:{}),
        instructions:curriculumInstructions+' 관리자 검수 대화입니다. 현재 수업 원문만 근거로 삼고, 근거가 부족하면 그렇게 알려주세요. 구조화된 메타데이터 없이 학습자에게 보여 줄 답변만 간결하게 작성하세요.',
        input:JSON.stringify({currentLessonId:lesson,sources,conversation:turns,question:question.trim()})})});
    if(!response.ok) return reply({error:response.status===429?'질문이 많아요. 잠시 후 다시 시도해 주세요.':'AI 답변을 받지 못했어요. 다시 시도해 주세요.'},response.status===429?429:502);
    const data=await response.json();
    const answer=data.output?.filter((o:{type:string})=>o.type==='message').flatMap((o:{content:{type:string;text?:string}[]})=>o.content).filter((t:{type:string})=>t.type==='output_text').map((t:{text:string})=>t.text).join('').trim();
    if(data.status!=='completed'||!answer) return reply({error:'답변을 끝까지 받지 못했어요. 다시 시도해 주세요.'},502);
    return reply({answer});
  } catch(e) {
    const err=e as {expose?:boolean;status?:number;message?:string};
    return err.expose ? reply({error:err.message},err.status||400) : reply({error:'수업 자료 또는 AI 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'},503);
  }
}
