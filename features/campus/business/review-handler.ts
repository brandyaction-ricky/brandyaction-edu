import {readBusinessJson} from './request-json';
type Viewer={id:string};
type Deps={enabled:boolean;authenticate:()=>Promise<Viewer|null>;load:(v:Viewer,e:string)=>Promise<unknown>;create:(v:Viewer,d:unknown)=>Promise<unknown>;revoke:(v:Viewer,d:unknown)=>Promise<unknown>;publicRequest?:(d:unknown)=>Promise<unknown>};
const reply=(v:unknown,status:number)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie','Referrer-Policy':'no-referrer'}});
export async function handleReviews(request:Request,deps:Deps,isPublic=false){
 if(!deps.enabled)return reply({error:'준비 중인 기능입니다.'},404);const url=new URL(request.url),origin=request.headers.get('origin');
 if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&origin!==url.origin))return reply({error:'허용되지 않은 요청입니다.'},403);
 try{
  const viewer=isPublic?null:await deps.authenticate();if(!isPublic&&!viewer)return reply({error:'로그인이 필요합니다.'},401);
  if(request.method==='GET'&&!isPublic)return reply(await deps.load(viewer!,url.searchParams.get('enrollmentId')||''),200);
  if(request.method!=='POST')return reply({error:'허용되지 않은 요청입니다.'},405);
  const d=await readBusinessJson(request,8000);
  if(!d||typeof d!=='object'||Array.isArray(d))return reply({error:'입력 내용을 확인해 주세요.'},400);
  if(isPublic)return reply(await deps.publicRequest!(d),200);
  const action=(d as Record<string,unknown>).action;if(action==='create')return reply(await deps.create(viewer!,d),200);if(action==='revoke')return reply(await deps.revoke(viewer!,d),200);return reply({error:'요청을 확인해 주세요.'},400);
 }catch(e){const status=e instanceof Error&&'status'in e&&[400,403,404,409,429].includes(Number(e.status))?Number(e.status):503;return reply({error:({400:'입력·공개 동의 내용을 확인해 주세요.',403:'현재 이용 가능한 수강권이 필요합니다.',404:'만료되었거나 회수된 테스트입니다.',409:'이미 처리됐거나 바뀐 요청입니다. 목록에서 상태를 확인해 주세요.',429:'응답이 잠시 많거나 정원 50건이 찼습니다. 잠시 후 다시 확인해 주세요.',503:'테스트를 확인하지 못했습니다. 다시 시도해 주세요.'} as Record<number,string>)[status]},status);}
}
