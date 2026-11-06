import {issueTicket} from '../../../services/campus-realtime/tickets.mjs';
import {readSpaceJson} from '../space/body';

export type GatewayEnvironment = Record<string,string|undefined>;
const devDatabase = 'https://vjmjhaidlqkmascdjocw.supabase.co';
export function gatewayReviewEnabled(env:GatewayEnvironment) {
 return env.EDU_CAMPUS_REALTIME_DEV_ENABLED==='true' && env.NEXT_PUBLIC_SUPABASE_URL===devDatabase;
}
export function gatewayConfig(env:GatewayEnvironment) {
 if(!gatewayReviewEnabled(env))return null;
 const endpoint=env.CAMPUS_REALTIME_ENDPOINT,secret=env.CAMPUS_REALTIME_SIGNING_SECRET,eventId=env.CAMPUS_REALTIME_EVENT_ID;
 if(!endpoint||!secret||Buffer.byteLength(secret)<32||!eventId||!/^[a-z0-9][a-z0-9-]{2,59}$/.test(eventId))return null;
 try {
  const url=new URL(endpoint);
  const local=env.NODE_ENV==='development'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
  if((url.protocol!=='https:'&&!local)||url.username||url.password||url.search||url.hash||url.pathname!=='/api/campus/realtime')return null;
  return {endpoint,secret,eventId};
 }catch{return null;}
}
type Dependencies={env:GatewayEnvironment;user:()=>Promise<{id:string;role:string;status:string}|null>;event:(slug:string)=>Promise<{status:string;endsAt:string}|null>;now?:()=>number};
/** Every issue/renew checks verified Auth and the uncached event; no requested role is trusted. */
export async function admitGateway(request:Request,{env,user,event,now=Date.now}:Dependencies) {
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 if(!gatewayReviewEnabled(env))return reply({error:'not found'},404);
 const config=gatewayConfig(env);if(!config)return reply({error:'개발 연결 설정을 확인해 주세요.'},503);
 if(request.method!=='POST')return reply({error:'method'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'origin'},403);
 try {
  const body=await readSpaceJson(request,1024);
  if(Object.keys(body).some(key=>key!=='slug')||body.slug!==config.eventId)return reply({error:'행사를 확인해 주세요.'},400);
  const actor=await user();if(!actor)return reply({error:'로그인이 필요합니다.'},401);
  if(actor.status!=='active'||actor.role!=='admin')return reply({error:'개발 검수 계정만 연결할 수 있습니다.'},403);
  const current=await event(config.eventId);
  if(!current||current.status!=='published'||!(Date.parse(current.endsAt)>now()))return reply({error:'행사 연결이 종료됐습니다.'},403);
  // A reviewer receives public-space rights only, even if their EDU account is an administrator.
  return reply({endpoint:config.endpoint,joinToken:issueTicket({eventId:config.eventId,subject:actor.id,role:'guest',ttlSeconds:60},config.secret,now()),renewAfterMs:60000});
 }catch(error){const status=(error as {status?:number}).status;return reply({error:'연결 권한을 확인하지 못했습니다.'},status===400?400:503);}
}
