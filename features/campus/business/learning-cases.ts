import type {createClient} from '@/lib/supabase/server';
import {fail,validId,type BusinessKind,type Payload} from './domain';
import {caseIndustries,type CaseIndustry} from './cases';
export type LearningCase={id:string;title:string;industry:CaseIndustry;summary:string;limits:string;revision:number;reviewedAt:string;evidence:{kind:BusinessKind;title:string;revision:number;payload:Payload}[]};
export type LearningCases={items:LearningCase[];nextCursor:string|null};
export async function loadLearningCases(db:Awaited<ReturnType<typeof createClient>>,actor:string,enrollmentId:string,industry:string,cursor:string|null){
 if(!validId(actor)||!validId(enrollmentId)||!caseIndustries.includes(industry as CaseIndustry)||(cursor&&!validId(cursor)))fail();
 const r=await db.rpc('edu_campus_business_learning_cases',{p_actor:actor,p_enrollment:enrollmentId,p_industry:industry,p_cursor:cursor});
 if(r.error){const code=r.error.code;fail(code==='42501'?403:code==='23514'?400:503);}
 if(!r.data||!Array.isArray(r.data.items))fail(503);return r.data as LearningCases;
}
type Dependencies={enabled:boolean;authenticate:()=>Promise<{id:string}|null>;read:(actor:string,enrollmentId:string,industry:string,cursor:string|null)=>Promise<LearningCases>};
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function handleLearningCases(request:Request,deps:Dependencies){
 if(!deps.enabled)return response({error:'준비 중인 기능입니다.'},404);const url=new URL(request.url),origin=request.headers.get('origin');
 if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return response({error:'허용되지 않은 요청입니다.'},403);
 if(request.method!=='GET')return response({error:'조회만 할 수 있습니다.'},405);
 try{const actor=await deps.authenticate();if(!actor)return response({error:'로그인이 필요합니다.'},401);const enrollment=url.searchParams.get('enrollmentId')||'',industry=url.searchParams.get('industry')||'',cursor=url.searchParams.get('cursor');if(!validId(enrollment)||!caseIndustries.includes(industry as CaseIndustry)||(cursor&&!validId(cursor)))fail();return response(await deps.read(actor.id,enrollment,industry,cursor));}
 catch(e){const status=e instanceof Error&&'status'in e&&[400,403].includes(Number(e.status))?Number(e.status):503;return response({error:status===403?'현재 이용 가능한 본인 수강권이 필요합니다.':status===400?'업종과 본인 수강권을 확인해 주세요.':'학습 사례를 확인하지 못했습니다. 다시 시도해 주세요.'},status);}
}
