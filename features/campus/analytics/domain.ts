export const roomLabels={live:'오픈 캠퍼스',welcome:'웰컴 존',study:'문샷 공부방',office:'내 AI 사무실',library:'자료실'} as const;
export type AnalyticsRoom=keyof typeof roomLabels;
export const actionLabels={room_enter:'공간 입장',room_gate:'잠긴 공간 안내',tool_open:'기능 열기',map_open:'공간 선택 지도',camera_switch:'시점 전환',lesson_open:'수업 열기',avatar_save:'캐릭터 저장',reaction:'인사·반응',quiz_answer:'퀴즈 답변',video_open:'다시보기 열기',resource_open:'자료 열기',resource_download:'다운로드 요청',detail:'상세페이지 이동',consult:'상담 이동',checkout:'신청 화면 이동',bot_save:'내 AI 직원 저장'} as const;
export type CampusAction=keyof typeof actionLabels;
export type Activity={room:AnalyticsRoom;action:CampusAction;target?:string};
export type CampusBatch={id:string;session:string;scope:string;events:Activity[];dwell:Partial<Record<AnalyticsRoom,number>>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function parseBatch(input:unknown):CampusBatch{
 const fail=():never=>{throw Object.assign(Error('활동 기록 형식을 확인해 주세요.'),{status:400});};
 if(!input||typeof input!=='object'||Array.isArray(input))return fail();const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['id','session','scope','events','dwell'].includes(k))||!uuid(v.id)||!uuid(v.session)||typeof v.scope!=='string'||!(/^(?:member|[a-z0-9][a-z0-9-]{2,59})$/).test(v.scope)||!Array.isArray(v.events)||v.events.length>32||!v.dwell||typeof v.dwell!=='object'||Array.isArray(v.dwell))return fail();
 const events=v.events.map(e=>{if(!e||typeof e!=='object'||Object.keys(e).some(k=>!['room','action','target'].includes(k))||!Object.hasOwn(roomLabels,e.room)||!Object.hasOwn(actionLabels,e.action)||e.target!==undefined&&(typeof e.target!=='string'||!/^[a-zA-Z0-9:_-]{1,80}$/.test(e.target)))return fail();return {room:e.room,action:e.action,...(e.target?{target:e.target}:{})} as Activity;});
 let total=0;const dwell:CampusBatch['dwell']={};for(const [room,seconds] of Object.entries(v.dwell)){if(!Object.hasOwn(roomLabels,room)||!Number.isInteger(seconds)||Number(seconds)<0||Number(seconds)>35)return fail();total+=Number(seconds);dwell[room as AnalyticsRoom]=Number(seconds);}if(total>35||!events.length&&!total)return fail();
 return {id:v.id,session:v.session,scope:v.scope,events,dwell};
}
