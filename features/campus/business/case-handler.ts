import {readBusinessJson} from './request-json';
type Dependencies={enabled:boolean;authenticate:()=>Promise<{id:string}|null>;read:(actor:string,scope:string,cursor:string|null)=>Promise<unknown>;write:(actor:string,body:unknown)=>Promise<unknown>};
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function handleCases(request:Request,deps:Dependencies,admin=false){
 if(!deps.enabled)return response({error:'준비 중인 기능입니다.'},404);const url=new URL(request.url),origin=request.headers.get('origin');
 if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&origin!==url.origin))return response({error:'허용되지 않은 요청입니다.'},403);
 try{const actor=await deps.authenticate();if(!actor)return response({error:admin?'관리자 권한이 필요합니다.':'로그인이 필요합니다.'},admin?403:401);
  if(request.method==='GET')return response(await deps.read(actor.id,url.searchParams.get(admin?'cohortId':'enrollmentId')||'',url.searchParams.get('cursor')));
  if(request.method!=='POST')return response({error:'허용되지 않은 요청입니다.'},405);
  const body=await readBusinessJson(request,16000);
  return response({case:await deps.write(actor.id,body)});
 }catch(error){const status=error instanceof Error&&'status'in error&&[400,403,404,409].includes(Number(error.status))?Number(error.status):503;const messages:Record<number,string>={400:'선택한 자료·목적·동의 내용을 확인해 주세요.',403:'현재 요청을 수행할 권한이 없습니다.',404:'사례 기록을 찾을 수 없습니다.',409:'기록이 바뀌었습니다. 새로고침 후 선택 내용을 확인해 주세요.',503:'사례 기록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'};return response({error:messages[status]},status);}
}
