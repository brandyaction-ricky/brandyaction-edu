import type { createClient } from '@/lib/supabase/server';
import { campusError } from '../snapshot';
import { ID, profile, avatarAppearance, SPACE_REPLACED, SPACE_ENDED, type SpaceState, type SpaceProfile } from './domain';
type DB = Awaited<ReturnType<typeof createClient>>;
const appearanceRow=(p:SpaceProfile)=>({avatar_model:p.model,hair_color:p.hairColor,skin_color:p.skinColor,pants_color:p.pantsColor,held_item:p.heldItem});
const appearanceFromRow=(p:{avatar_model?:unknown;hair_color?:unknown;skin_color?:unknown;pants_color?:unknown;held_item?:unknown;gender?:unknown})=>avatarAppearance({model:p.avatar_model,hairColor:p.hair_color,skinColor:p.skin_color,pantsColor:p.pants_color,heldItem:p.held_item,gender:p.gender});
type Viewer = { id: string; full_name?: string | null };
export type SpaceCommand = { kind: string; cohortId: string; sessionId: string; profile?: SpaceProfile; seatId?: string; messageId?: string; text?: string; focusUntil?: string | null; focusMode?: number };
const fail = (code=503, text='공간 연결을 확인하지 못했습니다.'): never => campusError(code,text);
function check<T>(value: {data:T;error:unknown}):T {if(value.error){const code=(value.error as {code?:string}).code;if(code==='54000')fail(409,'캠퍼스가 가득 찼어요. 잠시 후 다시 입장해 주세요.');if(code==='P0002')fail(409,'다른 창에서 입장했거나 연결이 끝났습니다.');fail(code==='P0001'?429:code==='23505'?409:code==='42501'?403:503);}return value.data;}
export async function authorizeSpace(db: DB, cohortId: string) {
 if(!ID.test(cohortId))fail(400);
 const ok=check(await db.rpc('edu_campus_space_member',{p_cohort:cohortId}));if(ok!==true)fail(403,'이용 가능한 기수를 선택해 주세요.');
}
type StateRow={[key:string]:unknown};
function toState(d:{profile?:StateRow|null;own?:StateRow|null;peers?:StateRow[];count?:number;messages?:StateRow[];controls?:StateRow|null;seats?:StateRow[];serverNow:string},viewer:Viewer):SpaceState{
 const p=d.profile as Record<string,unknown>|null|undefined,rows=[...(d.own?[d.own]:[]),...(d.peers||[])] as Record<string,any>[],controls=d.controls as Record<string,any>|null|undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
 return {profile:profile(p?{...p,...appearanceFromRow(p),lowMotion:p.low_motion,photoOptIn:p.photo_opt_in,deskTheme:p.desk_theme}:null,viewer.full_name||'문샷 동료'),
  peers:rows.map(p=>({...appearanceFromRow(p),userId:p.user_id,sessionId:p.session_id,nickname:p.nickname,gender:p.gender,coat:p.coat,status:p.status,photoOptIn:p.photo_opt_in,accessory:p.accessory,focusUntil:p.focus_until,focusMode:p.focus_mode,expiresAt:p.expires_at,x:12,y:8.8,sitting:false})),
  messages:((d.messages||[]) as Record<string,any>[]).map(m=>({id:m.id,userId:m.user_id,nickname:m.nickname,text:m.body,createdAt:m.created_at})), // eslint-disable-line @typescript-eslint/no-explicit-any
  seats:((d.seats||[]) as Record<string,any>[]).map(s=>({id:s.seat_id,userId:s.user_id,sessionId:s.session_id,expiresAt:s.expires_at})), // eslint-disable-line @typescript-eslint/no-explicit-any
  peerCount:Math.max(rows.length,Number(d.count)||0),serverNow:new Date(d.serverNow).toISOString(),
  controls:controls?{announcement:controls.announcement,paused:controls.paused,closedZones:controls.closed_zones||[],revision:controls.revision,updatedAt:controls.updated_at}:{announcement:'',paused:false,revision:0,updatedAt:null}};
}
/** The whole room state in one database call (membership is checked inside, under the learner's own policies). */
export async function loadSpace(db:DB, viewer:Viewer, cohortId:string):Promise<SpaceState>{
 if(!ID.test(cohortId))fail(400);
 return toState(check(await db.rpc('edu_campus_space_state',{p_cohort:cohortId})),viewer);
}
export async function saveSpace(db:DB,viewer:Viewer,cmd:SpaceCommand):Promise<SpaceState>{
 if(!ID.test(cmd.sessionId||'')||!ID.test(cmd.cohortId||''))fail(400);
 // Leave remains possible immediately after access is revoked; RLS allows own cleanup only.
 if(cmd.kind==='leave'){
  check(await db.from('edu_campus_space_seats').delete().eq('cohort_id',cmd.cohortId).eq('user_id',viewer.id).eq('session_id',cmd.sessionId));
  check(await db.from('edu_campus_space_presence').delete().eq('cohort_id',cmd.cohortId).eq('user_id',viewer.id).eq('session_id',cmd.sessionId));
  return {profile:profile(cmd.profile,viewer.full_name||'문샷 동료'),peers:[],messages:[],seats:[],serverNow:new Date().toISOString()};
 }
 if(cmd.kind==='heartbeat'){
  // Membership, pause check, presence write, seat refresh and the new state: one database call.
  if(!ID.test(cmd.cohortId)||!ID.test(cmd.sessionId||''))fail(400);
  const p=profile(cmd.profile,viewer.full_name||'문샷 동료');const focusUntil=typeof cmd.focusUntil==='string'&&Number.isFinite(Date.parse(cmd.focusUntil))?cmd.focusUntil:null;
  const row={...appearanceRow(p),nickname:p.nickname,gender:p.gender,coat:p.coat,status:p.status,photo_opt_in:p.photoOptIn,accessory:p.accessory,focus_until:focusUntil,focus_mode:[0,3,5,25,50].includes(Number(cmd.focusMode))?Number(cmd.focusMode):0};
  const beat=await db.rpc('edu_campus_space_beat',{p_cohort:cmd.cohortId,p_session:cmd.sessionId,p_row:row});
  if((beat.error as {code?:string}|null)?.code==='P0002'){
   // Another window took this seat, or this session simply expired: the client re-enters only in the second case.
   const own=await db.from('edu_campus_space_presence').select('session_id,expires_at').eq('cohort_id',cmd.cohortId).eq('user_id',viewer.id).maybeSingle();
   fail(409,own.data&&own.data.session_id!==cmd.sessionId&&Date.parse(String(own.data.expires_at))>Date.now()?SPACE_REPLACED:SPACE_ENDED);
  }
  return toState(check(beat),viewer);
 }
 // Membership and room controls are independent reads: one round trip instead of two.
 const needsControls=!['profile','stand','delete-chat'].includes(cmd.kind);
 const [,controlsRead]=await Promise.all([authorizeSpace(db,cmd.cohortId),needsControls?db.from('edu_campus_space_controls').select('paused,closed_zones').eq('cohort_id',cmd.cohortId).maybeSingle():null]);
 if(needsControls){const controls=check(controlsRead!);if((cmd.kind==='seat'&&controls?.closed_zones?.includes('desk'))||(cmd.kind==='chat'&&controls?.closed_zones?.includes('chat')))fail(409,'이 공간은 잠시 쉬고 있어요. 다른 공간을 이용해 주세요.');if(controls?.paused)fail(409);}
 if(cmd.kind==='profile'){
  const p=profile(cmd.profile,viewer.full_name||'문샷 동료');
  check(await db.from('edu_campus_space_profiles').upsert({...appearanceRow(p),user_id:viewer.id,nickname:p.nickname,gender:p.gender,coat:p.coat,status:p.status,low_motion:p.lowMotion,photo_opt_in:p.photoOptIn,note:p.note,desk:p.desk,accessory:p.accessory,desk_theme:p.deskTheme},{onConflict:'user_id'}));
 }else if(cmd.kind==='join'){
  const p=profile(cmd.profile,viewer.full_name||'문샷 동료');
  const focusUntil=typeof cmd.focusUntil==='string'&&Number.isFinite(Date.parse(cmd.focusUntil))?cmd.focusUntil:null;
  const row={...appearanceRow(p),cohort_id:cmd.cohortId,user_id:viewer.id,session_id:cmd.sessionId,nickname:p.nickname,gender:p.gender,coat:p.coat,status:p.status,photo_opt_in:p.photoOptIn,accessory:p.accessory,focus_until:focusUntil,focus_mode:[0,3,5,25,50].includes(Number(cmd.focusMode))?Number(cmd.focusMode):0};
  check(await db.from('edu_campus_space_presence').upsert(row,{onConflict:'cohort_id,user_id'}));check(await db.from('edu_campus_space_seats').delete().eq('cohort_id',cmd.cohortId).eq('user_id',viewer.id).neq('session_id',cmd.sessionId));
  check(await db.from('edu_campus_space_seats').update({session_id:cmd.sessionId}).eq('cohort_id',cmd.cohortId).eq('user_id',viewer.id).eq('session_id',cmd.sessionId));
 }else if(cmd.kind==='seat'){
  if(!['desk-1','desk-2','desk-3'].includes(cmd.seatId||''))fail(400);
  check(await db.rpc('edu_campus_space_claim_seat',{p_cohort:cmd.cohortId,p_session:cmd.sessionId,p_seat:cmd.seatId}));
 }else if(cmd.kind==='stand'){
  check(await db.from('edu_campus_space_seats').delete().eq('cohort_id',cmd.cohortId).eq('user_id',viewer.id).eq('session_id',cmd.sessionId));
 }else if(cmd.kind==='chat'){
  if(!ID.test(cmd.messageId||'')||typeof cmd.text!=='string'||!cmd.text.trim()||cmd.text.length>300)fail(400);
  const existing=check(await db.from('edu_campus_space_chat').select('id').eq('id',cmd.messageId).eq('user_id',viewer.id).maybeSingle());
  if(!existing)check(await db.from('edu_campus_space_chat').insert({id:cmd.messageId,cohort_id:cmd.cohortId,user_id:viewer.id,session_id:cmd.sessionId,body:cmd.text!.trim()}));
 }else if(cmd.kind==='delete-chat'){
  if(!ID.test(cmd.messageId||''))fail(400);check(await db.from('edu_campus_space_chat').delete().eq('id',cmd.messageId).eq('user_id',viewer.id).eq('cohort_id',cmd.cohortId));
 }else fail(400);
 return loadSpace(db,viewer,cmd.cohortId);
}
