import {validId} from './domain';
type Dependencies={enabled:boolean;authenticate:()=>Promise<{id:string}|null>;read:(actor:string,enrollmentId:string)=>Promise<unknown>};
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function handleBusinessTimeline(request:Request,deps:Dependencies){
 if(!deps.enabled)return response({error:'준비 중인 기능입니다.'},404);const url=new URL(request.url),origin=request.headers.get('origin');if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return response({error:'허용되지 않은 요청입니다.'},403);if(request.method!=='GET')return response({error:'조회만 할 수 있습니다.'},405);
 try{const actor=await deps.authenticate();if(!actor)return response({error:'로그인이 필요합니다.'},401);const enrollmentId=url.searchParams.get('enrollmentId');if(!validId(enrollmentId))return response({error:'본인 수강권을 선택해 주세요.'},400);return response(await deps.read(actor.id,enrollmentId));}catch(e){const status=e instanceof Error&&'status'in e&&[400,403].includes(Number(e.status))?Number(e.status):503;return response({error:status===403?'현재 이용 가능한 본인 수강권이 필요합니다.':'변화 기록을 불러오지 못했습니다. 다시 확인해 주세요.'},status);}
}
