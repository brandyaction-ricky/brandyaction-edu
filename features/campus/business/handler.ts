import {readBusinessJson} from './request-json';
import { validId } from './domain';
import type { BusinessCommand } from './repository';
type Viewer={id:string};
type Dependencies={enabled:boolean;authenticate:()=>Promise<Viewer|null>;load:(v:Viewer,e:string,cursor:string|null)=>Promise<unknown>;save:(v:Viewer,c:BusinessCommand)=>Promise<unknown>};
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function handleBusiness(request:Request,deps:Dependencies){
  if(!deps.enabled)return reply({error:'준비 중인 기능입니다.'},404);
  const url=new URL(request.url),origin=request.headers.get('origin');
  if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&origin!==url.origin))return reply({error:'허용되지 않은 요청입니다.'},403);
  try{
    const viewer=await deps.authenticate();if(!viewer)return reply({error:'로그인이 필요합니다.'},401);
    if(request.method==='GET'){const e=url.searchParams.get('enrollmentId');if(!validId(e))return reply({error:'수강권을 선택해 주세요.'},400);return reply(await deps.load(viewer,e,url.searchParams.get('cursor')),200);}
    if(request.method!=='POST')return reply({error:'허용되지 않은 요청입니다.'},405);
    const command=await readBusinessJson(request,40000);
    if(!command||typeof command!=='object'||Array.isArray(command))return reply({error:'입력 형식을 확인해 주세요.'},400);
    return reply({record:await deps.save(viewer,command as BusinessCommand)},200);
  }catch(error){const status=error instanceof Error&&'status'in error&&[400,403,404,409].includes(Number(error.status))?Number(error.status):503;const messages:Record<number,string>={400:'필수 입력·날짜·숫자·링크을 확인해 주세요.',403:'현재 이용 가능한 수강권이 필요합니다.',404:'내 기록을 찾을 수 없습니다.',409:'다른 화면에서 기록이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.',503:'기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'};return reply({error:messages[status]},status);}
}
