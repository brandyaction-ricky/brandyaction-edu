import { createAdminClient } from '@/lib/supabase/admin';
import { assertParticipationOpen } from '@/lib/alumni-access-server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';
import { gradeBlockQuiz, publicLessonBlocks, validateBlockAnswers, validateLessonBlocks } from '@/lib/lesson-blocks';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const messages: Record<string, [string, number]> = {
 BLOCK_FORBIDDEN: ['이 학습에 접근할 권한이 없습니다.',403], BLOCK_NOT_FOUND: ['학습 기록을 찾지 못했습니다.',404],
 BLOCK_LESSON_LOCKED: ['28일차 데일리 미션을 승인받은 뒤 이용할 수 있습니다.',403],
 BLOCK_DRAFT_CHANGED: ['다른 화면에서 저장한 답변이 있습니다. 현재 입력을 보관한 뒤 다시 확인해 주세요.',409],
 BLOCK_CONTENT_CHANGED: ['학습 내용이 변경되었습니다. 현재 입력을 보관한 뒤 다시 열어 주세요.',409],
 BLOCK_REQUEST_REUSED: ['다른 내용으로 사용한 저장 요청입니다. 다시 확인해 주세요.',409],
 BLOCK_FILE_INVALID: ['업로드한 첨부파일을 확인해 주세요.',400],
 BLOCK_REQUIREMENTS_MISSING: ['필수 질문과 체크리스트를 완료해 주세요.',422], BLOCK_QUIZ_NOT_PASSED: ['시험 통과 기준을 확인해 주세요.',422],
 ONGOING_PERIOD_CHANGED: ['새 챌린지 기간이 시작되었습니다. 현재 입력을 내려받은 뒤 이번 기간을 다시 열어 주세요.',409],
 ONGOING_ALREADY_COMPLETED: ['이번 기간에는 이미 완료했습니다. 저장된 기록을 다시 확인해 주세요.',409],
 ONGOING_CADENCE_FIXED: ['설정한 반복 주기는 바꿀 수 없습니다. 다른 주기는 새 학습으로 준비해 주세요.',409],
 ONGOING_EXISTING_RECORDS: ['학생 기록이 있는 일반 학습은 지속 챌린지로 변경할 수 없습니다.',409],
 ONGOING_INVALID: ['자체 완료 방식의 학습을 먼저 저장해 주세요. 데일리·별도 학습 번호와 함께 설정할 수 없습니다.',400],
};
function fail(message: string, status=400): never { throw Object.assign(new Error(message),{status}); }
function requiredId(value: unknown) { if(!uuid(value))fail('학습과 요청을 확인해 주세요.');return value as string; }
function period(value: unknown, optional=false) { if(value==null&&optional)return null;if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value)||value.length>50||!Number.isFinite(Date.parse(value)))fail('학습 기간을 확인해 주세요.');return new Date(value as string).toISOString(); }
function failure(error: unknown) { const e=error as {message?:string;status?:number};const known=messages[e.message||''];return known?reply({error:known[0],code:e.message},known[1]):e.status&&e.status<500?reply({error:e.message},e.status):reply({error:'학습 기록을 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요.'},503); }
async function bodyOf(request:Request){const reader=request.body?.getReader();if(!reader)fail('입력 형식을 확인해 주세요.');let size=0;const parts:string[]=[],decoder=new TextDecoder();try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>600000){await reader.cancel();fail('답변이 너무 깁니다.',413);}parts.push(decoder.decode(value,{stream:true}));}parts.push(decoder.decode());}finally{reader.releaseLock();}try{return JSON.parse(parts.join(''));}catch{fail('입력 형식을 확인해 주세요.');}}
export async function GET(request:Request){try{
 const actor=await getAuthenticatedUser();if(!actor)return reply({error:'로그인이 필요합니다.'},401);
 const q=new URL(request.url).searchParams,db=createAdminClient(),lesson=requiredId(q.get('lesson'));
 if(q.get('action')==='settings'){const r=await db.rpc('edu_ongoing_settings',{p_actor:actor.id,p_lesson:lesson});if(r.error)throw r.error;return reply({settings:r.data});}
 const enrollment=requiredId(q.get('enrollment'));
 if(q.get('action')==='history'){const r=await db.rpc('edu_ongoing_history',{p_actor:actor.id,p_lesson:lesson,p_enrollment:enrollment,p_before:period(q.get('before'),true)});if(r.error)throw r.error;return reply(r.data);}
 const r=await db.rpc('edu_read_ongoing',{p_actor:actor.id,p_lesson:lesson,p_enrollment:enrollment,p_period:period(q.get('period'),true)});if(r.error)throw r.error;
 return reply({...r.data,document:publicLessonBlocks(validateLessonBlocks(r.data.document))});
 }catch(error){return failure(error);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('허용되지 않은 요청입니다.',403);
 const actor=await getAuthenticatedUser();if(!actor)return reply({error:'로그인이 필요합니다.'},401);
 const b=await bodyOf(request);if(!b||typeof b!=='object'||Array.isArray(b))fail('입력 형식을 확인해 주세요.');const lesson=requiredId(b.lessonId),db=createAdminClient();
 if(b.action==='configure'){if(!['daily','weekly','monthly'].includes(b.cadence))fail('반복 주기를 확인해 주세요.');const r=await db.rpc('edu_configure_ongoing',{p_actor:actor.id,p_lesson:lesson,p_cadence:b.cadence,p_request:requiredId(b.requestId)});if(r.error)throw r.error;return reply(r.data);}
 if(!['draft','grade','complete'].includes(b.action))fail('요청을 확인해 주세요.');
 const args={p_actor:actor.id,p_lesson:lesson,p_enrollment:requiredId(b.enrollmentId),p_period:period(b.periodStart)},revision=requiredId(b.revision);
 await assertParticipationOpen(actor.id,args.p_enrollment);
 if(b.action==='complete'){const r=await db.rpc('edu_complete_ongoing',{...args,p_revision:revision,p_write:requiredId(b.writeId),p_request:requiredId(b.requestId)});if(r.error)throw r.error;return reply(r.data);}
 const loaded=await db.rpc('edu_read_ongoing',args);if(loaded.error)throw loaded.error;if(loaded.data.revision!==revision)throw new Error('BLOCK_CONTENT_CHANGED');
 const document=validateLessonBlocks(loaded.data.document),values=validateBlockAnswers(b.values,document);
 if(b.action==='grade'){const block=document.blocks.find(block=>block.id===b.blockId&&block.quiz);if(!block)fail('시험을 찾지 못했습니다.',404);const answer=values.blocks[block.id];return reply({result:gradeBlockQuiz(block,typeof answer==='object'?answer:{})});}
 const r=await db.rpc('edu_save_ongoing',{...args,p_revision:revision,p_expected:b.expectedWriteId==null?null:requiredId(b.expectedWriteId),p_request:requiredId(b.requestId),p_values:values});if(r.error)throw r.error;return reply(r.data);
 }catch(error){return failure(error);}}
