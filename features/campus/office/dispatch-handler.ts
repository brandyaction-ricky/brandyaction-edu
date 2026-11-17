import { campusError, isCampusId } from '../snapshot';
import { readCampusJson } from '../request-json';
export type DispatchCommand={requestId:string;enrollmentId:string;jobId:string;expectedJobRevision:number;action:'enqueue'|'cancel'|'reconcile'|'retry';dispatchId?:string;expectedRevision?:number};
export type DispatchRecord={id:string;jobId:string;jobRevision:number;status:'queued'|'leased'|'accepted'|'uncertain'|'rejected'|'cancelled';operation:'submit'|'status'|'cancel';revision:number;attempts:number;cancelRequested:boolean;lastCode:string;updatedAt:string};
export function validateDispatchCommand(input:unknown):DispatchCommand{
 if(!input||typeof input!=='object'||Array.isArray(input))campusError(400,'Invalid command');
 const c=input as DispatchCommand;
 if(![c.requestId,c.enrollmentId,c.jobId].every(isCampusId)||!Number.isSafeInteger(c.expectedJobRevision)||c.expectedJobRevision<1||!['enqueue','cancel','reconcile','retry'].includes(c.action))campusError(400,'Invalid command');
 const out:DispatchCommand={requestId:c.requestId,enrollmentId:c.enrollmentId,jobId:c.jobId,expectedJobRevision:c.expectedJobRevision,action:c.action};
 if(c.action!=='enqueue'){if(!isCampusId(c.dispatchId??'')||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision!<1)campusError(400,'Invalid revision');out.dispatchId=c.dispatchId;out.expectedRevision=c.expectedRevision;}return out;
}
export async function handleOfficeDispatch(request:Request,deps:{enabled:boolean;authenticate:()=>Promise<{id:string}|null>;load:(viewer:{id:string},enrollmentId:string)=>Promise<unknown>;save:(viewer:{id:string},command:DispatchCommand)=>Promise<unknown>}){
 const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 if(!deps.enabled)return reply({error:'외부 오피스 연결은 아직 활성화되지 않았습니다.'},404);
 const url=new URL(request.url),origin=request.headers.get('origin');
 if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'||request.method==='POST'&&origin!==url.origin)return reply({error:'허용되지 않은 요청입니다.'},403);
 try{
  const viewer=await deps.authenticate();if(!viewer)return reply({error:'로그인해 주세요.'},401);
  if(request.method==='GET'){const enrollmentId=url.searchParams.get('enrollmentId')??'';if(!isCampusId(enrollmentId))campusError(400,'Invalid enrollment');return reply(await deps.load(viewer,enrollmentId),200);}
  if(request.method!=='POST')return reply({error:'허용되지 않은 요청입니다.'},405);
  if(!request.headers.get('content-type')?.startsWith('application/json'))campusError(400,'Invalid body');
  return reply(await deps.save(viewer,validateDispatchCommand(await readCampusJson(request,4000))),200);
 }catch(e){const code=e instanceof Error&&'status'in e&&[400,403,409].includes(Number(e.status))?Number(e.status):503;return reply({error:code===409?'작업 또는 전달 상태가 바뀌었습니다. 새로고침해 주세요.':code===403?'본인에게 연결된 현재 작업만 사용할 수 있어요.':'전달 상태를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.'},code);}
}
