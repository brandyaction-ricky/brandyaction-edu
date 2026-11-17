import {readCampusJson} from '../request-json';
import { isCampusId } from '../snapshot';
type Actor={id:string};
type Dependencies={enabled:boolean;authenticate:()=>Promise<Actor|null>;read:(actor:Actor,scope:string)=>Promise<unknown>;write:(actor:Actor,command:Record<string,unknown>)=>Promise<unknown>};
export async function handleSupport(request:Request,deps:Dependencies){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 if(!deps.enabled)return reply({error:'준비 중인 기능입니다.'},404);
 const url=new URL(request.url),origin=request.headers.get('origin');
 if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&origin!==url.origin))return reply({error:'요청 출처를 확인해 주세요.'},403);
 if(!['GET','POST'].includes(request.method))return reply({error:'허용되지 않은 요청입니다.'},405);
 try{const actor=await deps.authenticate();if(!actor)return reply({error:'로그인과 이용 권한을 확인해 주세요.'},401);
 if(request.method==='GET'){const scope=url.searchParams.get('scope');if(!scope||!isCampusId(scope))return reply({error:'확인할 기수를 선택해 주세요.'},400);return reply(await deps.read(actor,scope));}
 const command=await readCampusJson(request,160000);
 if(!command||typeof command!=='object'||Array.isArray(command))return reply({error:'입력 내용을 확인해 주세요.'},400);return reply(await deps.write(actor,command as Record<string,unknown>));
 }catch(err){const status=err instanceof Error&&'status'in err&&[400,403,404,409,429].includes(Number(err.status))?Number(err.status):503;return reply({error:({400:'입력 내용을 확인해 주세요.',403:'이용 권한을 다시 확인해 주세요.',404:'기록을 찾을 수 없습니다.',409:'기록이나 예약 가능 인원이 바뀌었습니다. 새로고침해 주세요.',429:'잠시 후 다시 요청해 주세요.',503:'기록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'})[status as 400]},status);}
}
