import type { CampusSnapshot } from './contracts';
import { createFocusSession, transitionFocusSession, validateFocusSession, type FocusSession } from './focus-domain';
export type FocusResponse = {session: FocusSession|null;serverNow:string;currentLessonVersion:string|null};
export type FocusWrite = {kind:'start';requestId:string;enrollmentId:string;lessonId:string;lessonVersion:string;actionText:string} |
  {kind:'pause'|'resume'|'finish';sessionId:string;expectedRevision:number;resultNote?:string;nextStep?:string};
export interface FocusTransport {read(signal?:AbortSignal):Promise<FocusResponse>;write(command:FocusWrite,signal?:AbortSignal):Promise<FocusResponse>}
const fail=(message:string,status=0)=>Object.assign(new Error(message),{status});
export function createFocusTransport(snapshot:CampusSnapshot,demo:boolean):FocusTransport {
  const scope=snapshot.selectedEnrollmentId;
  function check(value:FocusResponse):FocusResponse {
    if(!value||!Number.isFinite(Date.parse(value.serverNow))||(value.currentLessonVersion!==null&&(typeof value.currentLessonVersion!=='string'||!value.currentLessonVersion.trim())))throw fail('실행 기록 형식을 확인하지 못했습니다.');
    const session=value.session===null?null:validateFocusSession(value.session);
    if(session&&(session.user_id!==snapshot.viewer.id||session.enrollment_id!==scope))throw fail('실행 기록의 소유자를 확인해 주세요.',403);
    return {session,serverNow:value.serverNow,currentLessonVersion:value.currentLessonVersion};
  }
  async function remote(command?:FocusWrite,signal?:AbortSignal){
    const response=await fetch('/api/campus/focus'+(!command?'?enrollmentId='+encodeURIComponent(scope||''):''),{
      method:command?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal,
      ...(command?{headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}:{})});
    if(!response.ok)throw fail(response.status===404?'짧은 실행 기능을 준비하고 있어요.':response.status===401||response.status===403?'로그인과 수강권을 다시 확인해 주세요.':response.status===409?'다른 창의 변경이나 수업 변경을 확인해 주세요. 기록을 새로 불러온 뒤 이어가세요.':'저장 여부를 확인하지 못했습니다. 기록을 새로 불러와 확인해 주세요.',response.status);
    return check(await response.json());
  }
  if(!demo)return {read:signal=>remote(undefined,signal),write:remote};
  // Synthetic preview only. Production never stores member notes in localStorage.
  const key=`moonshot-focus-demo-v1:${snapshot.viewer.id}:${scope}`;
  const readStored=()=>{const raw=localStorage.getItem(key);return raw?check(JSON.parse(raw) as FocusResponse).session:null;};
  const wrap=(session:FocusSession|null)=>({session,serverNow:new Date().toISOString(),currentLessonVersion:snapshot.lessons.find(l=>l.id===session?.lesson_id)?.version||null});
  return {
    async read(signal){signal?.throwIfAborted();return wrap(readStored());},
    async write(command,signal){
      signal?.throwIfAborted();
      let current=readStored();
      if(command.kind==='start'){
        if(current?.id===command.requestId){
          if(current.enrollment_id!==command.enrollmentId||current.lesson_id!==command.lessonId||current.lesson_version!==command.lessonVersion||current.action_text!==command.actionText.trim())throw fail('같은 요청의 내용이 바뀌었어요. 기록을 다시 확인해 주세요.',409);
          return wrap(current);
        }
        if(current&&current.status!=='finished')throw fail('먼저 진행 중인 실행을 마무리해 주세요.',409);
        if(command.enrollmentId!==scope)throw fail('기수를 확인해 주세요.',403);
        const lesson=snapshot.lessons.find(l=>l.id===command.lessonId);
        if(!lesson||lesson.version!==command.lessonVersion)throw fail('수업을 다시 확인해 주세요.',409);
        current=createFocusSession({id:command.requestId,user_id:snapshot.viewer.id,enrollment_id:scope!,lesson_id:lesson.id,lesson_version:lesson.version,action_text:command.actionText},Date.now());
      }else{
        if(!current||current.id!==command.sessionId)throw fail('실행 기록을 확인해 주세요.',409);
        current=transitionFocusSession(current,command,Date.now());
      }
      const result=wrap(current);localStorage.setItem(key,JSON.stringify(result));return result;
    },
  };
}
