import type { createClient } from '@/lib/supabase/server';
import { campusError, isCampusId } from '../snapshot';
import { readLimitedUtf8Body } from './request-body';
import { validateFlowCommand, type FlowCommand, type FlowState } from './workflows';
type Db=Awaited<ReturnType<typeof createClient>>;
export async function loadFlowState(db:Db,postId:string):Promise<FlowState>{
 const post=await db.from('edu_campus_posts').select('id,cohort_id').eq('id',postId).maybeSingle();if(post.error||!post.data)campusError(403,'작업물을 확인해 주세요.');
 const [x,s,h,op]=await Promise.all([db.from('edu_campus_exchanges').select('*',{count:'exact'}).eq('post_id',postId).limit(100),db.from('edu_campus_demo_slots').select('*',{count:'exact'}).eq('cohort_id',post.data.cohort_id).order('starts_at').limit(500),db.from('edu_campus_community_flow_history').select('*',{count:'exact'}).eq('post_id',postId).order('created_at',{ascending:false}).limit(1000),db.rpc('edu_campus_community_operator')]);
 for(const r of [x,s,h])if(r.error||!Array.isArray(r.data)||r.count!==r.data.length)campusError(503,'이력 범위를 확인하지 못했습니다.');
 const slots=s.data as unknown as FlowState['slots'];const ids=slots.filter(row=>row.post_id===postId).map(row=>row.id);
 const q=ids.length?await db.from('edu_campus_demo_questions').select('*',{count:'exact'}).in('slot_id',ids).order('created_at').limit(1000):{data:[],error:null,count:0};
 if(q.error||!Array.isArray(q.data)||q.count!==q.data.length||op.error)campusError(503,'질문을 확인하지 못했습니다.');
 return{exchanges:x.data as unknown as FlowState['exchanges'],slots,questions:q.data as unknown as FlowState['questions'],history:h.data as unknown as FlowState['history'],operator:op.data===true};
}
export async function saveFlow(db:Db,c:FlowCommand){const r=await db.rpc('edu_campus_community_flow_mutate',{p_command:c});if(r.error)campusError(r.error.code==='42501'?403:['40001','23505'].includes(r.error.code)?409:['23514','22P02'].includes(r.error.code)?400:503,'교환 또는 발표 상태를 확인해 주세요.');return r.data;}
export async function handleFlow(req:Request,d:{enabled:boolean;authenticate:()=>Promise<unknown>;load:(id:string)=>Promise<unknown>;save:(c:FlowCommand)=>Promise<unknown>}){
 const reply=(v:unknown,s:number)=>Response.json(v,{status:s,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 if(!d.enabled)return reply({error:'준비 중입니다.'},404);
 try{if(!['GET','POST'].includes(req.method))return reply({error:'Method'},405);if(req.method==='POST'&&(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site'))return reply({error:'Origin'},403);if(!await d.authenticate())return reply({error:'로그인이 필요합니다.'},401);
 if(req.method==='GET'){const id=new URL(req.url).searchParams.get('postId');if(!isCampusId(id??''))campusError(400,'작업물을 선택해 주세요.');return reply(await d.load(id!),200);}
 if(!req.headers.get('content-type')?.startsWith('application/json'))campusError(400,'요청 형식을 확인해 주세요.');let input;try{input=JSON.parse(await readLimitedUtf8Body(req,12000));}catch{campusError(400,'입력 내용을 확인해 주세요.');}return reply(await d.save(validateFlowCommand(input)),200);
 }catch(e){const status=e instanceof Error&&'status'in e&&[400,403,409].includes(Number(e.status))?Number(e.status):503;return reply({error:status===409?'다른 창에서 상태가 바뀌었거나 시간이 겹칩니다. 새로고침해 주세요.':status===403?'같은 기수의 허용된 작업만 이용할 수 있습니다.':'요청을 처리하지 못했습니다. 입력과 연결을 확인해 주세요.'},status);}
}
