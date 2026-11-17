import {readSpaceJson} from './body';
import { ID, type SpaceState } from './domain';
import type { SpaceCommand } from './server';
type Viewer={id:string};
type Dependencies={enabled:boolean;authenticate:()=>Promise<Viewer|null>;load:(viewer:Viewer,cohort:string)=>Promise<SpaceState>;save:(viewer:Viewer,command:SpaceCommand)=>Promise<SpaceState>};
const reply=(data:unknown,status:number)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function handleSpace(request:Request,deps:Dependencies){
 if(!deps.enabled)return reply({error:'준비 중인 기능입니다.'},404);
 const url=new URL(request.url),origin=request.headers.get('origin');
 if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&origin!==url.origin))return reply({error:'허용되지 않은 요청입니다.'},403);
 if(!['GET','POST'].includes(request.method))return reply({error:'허용되지 않은 요청입니다.'},405);
 try{
  const viewer=await deps.authenticate();if(!viewer)return reply({error:'로그인이 필요합니다.'},401);
  if(request.method==='GET'){const cohortId=url.searchParams.get('cohortId')||'';if(!ID.test(cohortId))return reply({error:'기수를 확인해 주세요.'},400);return reply(await deps.load(viewer,cohortId),200);}
  const cmd=await readSpaceJson(request);
  if(!cmd||typeof cmd!=='object'||Array.isArray(cmd)||!['profile','join','leave','heartbeat','seat','stand','chat','delete-chat'].includes(String(cmd.kind)))return reply({error:'요청을 확인해 주세요.'},400);
  return reply(await deps.save(viewer,cmd as SpaceCommand),200);
 }catch(error){const code=error instanceof Error&&'status'in error&&[400,403,404,409,429].includes(Number(error.status))?Number(error.status):503;
 const messages:Record<number,string>={400:'입력 내용을 확인해 주세요.',403:'이용 가능한 기수를 선택해 주세요.',404:'공간을 찾을 수 없습니다.',409:'좌석이나 연결이 바뀌었습니다. 새로고침해 주세요.',429:'잠깐 쉬었다가 다시 시도해 주세요.',503:'공간 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'};return reply({error:code===409&&error instanceof Error&&error.message==='캠퍼스가 가득 찼어요. 잠시 후 다시 입장해 주세요.'?error.message:messages[code]},code);}
}
