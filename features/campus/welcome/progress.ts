import {tourAvatar,type TourAvatar} from '../tour/appearance';
import type {WelcomeProgress} from './assessment-panel';
export const WELCOME_USER_PREFIX='edu_campus_welcome_user_v1_';
export type WelcomeUserState={revision:string;noticeSeen:boolean;assessmentKey:string;progress:WelcomeProgress;avatar?:TourAvatar};
export function cleanProgress(value:unknown):WelcomeProgress{
 const p=value as WelcomeProgress;
 if(!p||typeof p.video!=='boolean'||!Array.isArray(p.quiz)||!Array.isArray(p.level)||p.quiz.length>20||p.level.length>12||!p.quiz.every(v=>v===null||typeof v==='boolean')||!p.level.every(v=>Number.isInteger(v)&&v>=-1&&v<=2))throw Object.assign(Error('준비 기록을 확인해 주세요.'),{status:400});
 return {video:p.video,quiz:[...p.quiz],level:[...p.level]};
}
export function mergeWelcomeState(current:WelcomeUserState|null,command:Record<string,unknown>,revision:string):WelcomeUserState{
 const next:WelcomeUserState=current?{...current,revision}:{revision,noticeSeen:false,assessmentKey:'',progress:{video:false,quiz:[],level:[]}};
 if(command.kind==='notice')next.noticeSeen=true;
 else if(command.kind==='avatar')next.avatar=tourAvatar(command.avatar);
 else if(command.kind==='progress'){
  if(typeof command.assessmentKey!=='string'||command.assessmentKey.length>80)throw Object.assign(Error('문항 정보를 확인해 주세요.'),{status:400});
  next.assessmentKey=command.assessmentKey;next.progress=cleanProgress(command.progress);
 }else throw Object.assign(Error('저장 요청을 확인해 주세요.'),{status:400});
 return next;
}
export function assessmentKey(value:unknown){const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return 'welcome-v2-'+(h>>>0).toString(36);}
