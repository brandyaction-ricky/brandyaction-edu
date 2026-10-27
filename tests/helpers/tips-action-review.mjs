import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { setup } from './learning-care.mjs';
export function compile(file, modules) {
  const out={}; new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>{
      if(!(name in modules))throw Error('Unmocked module '+name);return modules[name];
    }); return out;
}
export async function tipsReviewFixture(t) {
  const f=await setup(t), learning=await f.add('learning',1), calls=[];
  f.lesson=learning.lesson; f.learningRevision=learning.revision;
  const read=name=>fs.readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
  await f.db.exec(`reset role; alter table profiles add column marketing_consent boolean default false;
    alter table profiles add column marketing_consent_at timestamptz; alter table profiles add column marketing_opt_out_at timestamptz;
    alter table enrollments add column order_item_id uuid; alter table enrollments add column source text default 'purchase';`);
  const ddl=read('202608040001_initial_education_platform.sql');
  for(const table of ['orders','order_items','payments','refunds'])await f.db.exec(ddl.match(new RegExp('create table if not exists public\\.'+table+' \\([\\s\\S]*?\\n\\);'))[0]);
  await f.db.exec('grant select,insert,update on orders,order_items,payments,refunds to service_role');
  await f.db.exec(read('20261007011925_edu_optional_consent_e6.sql'));
  await f.db.exec(read('20261008074257_edu_personalization_consent.sql'));
  await f.db.exec(`insert into edu_personalization_terms values('QA','Synthetic analysis','Synthetic overseas',now()-interval '1 day',now()-interval '1 day',true); set role service_role;`);
  for(const member of [f.student,f.other]){
    await f.db.query('select edu_personalization_consent($1,$2,$3,$4,null)',[member,id(),{analysis:true,overseas:true},'QA']);
    await f.db.query(`select edu_account_consent($1,$2,'{"marketingUse":true,"sms":false,"kakao":true,"email":true}'::jsonb,'profile','2026-10-20',null)`,[member,id()]);
    await f.db.query(`insert into edu_member_visits values($1,((now()-interval '4 days') at time zone 'Asia/Seoul')::date,now()-interval '4 days',now()-interval '4 days')`,[member]);
  }
  await f.db.query("update cohorts set status='in_progress',operation_start_at=now()-interval '20 days',operation_end_at=now()+interval '20 days' where id=$1",[f.cohort]);
  const order=id(),item=id(),payment=id();
  await f.db.query(`insert into orders(id,order_number,user_id,status,subtotal,total_amount,customer_name,customer_email,terms_version,privacy_version,refund_policy_version,paid_at)
    values($1,$2,$3,'paid',1100000,1100000,'SYNTHETIC','private@example.test','QA','QA','QA',now()-interval '30 days')`,[order,'QA-'+order,f.student]);
  await f.db.query("insert into order_items(id,order_id,course_id,cohort_id,item_name,unit_price) values($1,$2,$3,$4,'QA',1100000)",[item,order,f.course,f.cohort]);
  await f.db.query("insert into payments(id,order_id,provider,status,approved_amount,approved_at) values($1,$2,'QA','done',1100000,now()-interval '30 days')",[payment,order]);
  await f.db.query('update enrollments set order_item_id=$1 where id=$2',[item,f.enrollment]);
  const command={intent:'learning_support',memberId:f.student,courseId:f.course,cohortId:f.cohort,enrollmentId:f.enrollment,lessonId:f.lesson,channel:'email'};
  let fault=null;
  // Real supabase-js builds HTTP query strings; an in-process transport maps
  // these reads/RPCs to actual source tables/functions in isolated PGlite.
  // This is not a live PostgREST interoperability test or a real network call.
  const jsonRows=(rows,total=rows.length)=>Response.json(rows,{headers:{'Content-Range':`0-${Math.max(0,rows.length-1)}/${total}`}});
  const fetch=async(input,init)=>{
    const url=new URL(input),table=url.pathname.split('/').at(-1);calls.push({table,method:init?.method || 'GET',params:Object.fromEntries(url.searchParams)});
    if(url.origin!=='https://fixture.invalid')throw Error('Unexpected remote origin');
    if(fault?.table===table)return Response.json(fault.data ?? {message:'PRIVATE UPSTREAM FAILURE',code:'XX000'},{status:fault.status || 500,headers:fault.count===undefined?{}:{'Content-Range':`0-0/${fault.count}`}});
    try{
      if(url.pathname.includes('/rpc/')){
        const body=JSON.parse(init.body),args=Object.values(body);
        if(!['edu_admin_learning_care','edu_personalization_consent','edu_tips_action_review_context'].includes(table))throw Error('Unexpected RPC');
        const named=Object.keys(body).map((k,i)=>`${k}=>$${i+1}`).join(',');
        return Response.json((await f.db.query(`select ${table}(${named}) as r`,args)).rows[0].r);
      }
      const allowed={profiles:['id','status','role','marketing_use_consent_at','ad_email_consent_at','ad_kakao_consent_at'],
        cohorts:['id','course_id','status','operation_start_at','operation_end_at'],courses:['id','archived_at'],
        enrollments:['id','status','revoked_at','access_starts_at','access_ends_at','order_item_id','source','user_id','course_id','cohort_id'],
        payments:['id','order_id','status','approved_at','approved_amount','cancelled_amount'],refunds:['payment_id','amount','status']};
      if(table==='orders'){
        if(url.searchParams.get('select')!=='id,status,paid_at,order_items!inner(id,course_id,cohort_id)')throw Error('Unexpected ledger projection');
        const keys=['user_id','order_items.course_id','order_items.cohort_id'];
        const args=keys.map(k=>{const x=url.searchParams.get(k);if(!x?.startsWith('eq.'))throw Error('Missing source scope');return x.slice(3);});
        args.push(Number(url.searchParams.get('limit')));
        return jsonRows((await f.db.query(`select o.id,o.status,o.paid_at,jsonb_agg(jsonb_build_object('id',i.id,'course_id',i.course_id,'cohort_id',i.cohort_id)) as order_items
          from orders o join order_items i on i.order_id=o.id where o.user_id=$1 and i.course_id=$2 and i.cohort_id=$3 group by o.id limit $4`,args)).rows);
      }
      if(!allowed[table])throw Error('Unexpected table');
      const cols=url.searchParams.get('select').split(',');if(cols.some(k=>!allowed[table].includes(k)))throw Error('Unexpected field');
      const args=[],where=[];
      for(const [k,v] of url.searchParams){
        if(['select','limit'].includes(k))continue;if(!allowed[table].includes(k))throw Error('Unscoped column');
        if(v.startsWith('eq.')){args.push(v.slice(3));where.push(`${k}=$${args.length}`);}
        else if(v.startsWith('in.(')&&v.endsWith(')')){args.push(v.slice(4,-1).split(','));where.push(`${k}=any($${args.length}::uuid[])`);}
        else throw Error('Unsupported predicate');
      }
      const limit=url.searchParams.get('limit');if(limit){args.push(Number(limit));}
      const sql=`select ${cols.join(',')} from ${table} where ${where.join(' and ')}${limit?' limit $'+args.length:''}`;
      return jsonRows((await f.db.query(sql,args)).rows);
    }catch(error){return Response.json({code:'XX000',message:error.message},{status:400});}
  };
  const client=createClient('https://fixture.invalid','SYNTHETIC-ONLY',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false}});
  const rules=compile('lib/learning-care.ts',{});
  const evaluator=compile('lib/edu-tips-action-review.ts',{'./learning-care':rules,'./edu-workflows':{uuid:x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x)}});
  const review=compile('lib/edu-tips-action-review-server.ts',{'./edu-tips-action-review':evaluator,'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>client},'@/lib/learning-care':rules,'@/lib/edu-workflows':{uuid:x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x)}});
  return {...f,command,client,review,evaluator,calls,order,item,payment,setFault:x=>{fault=x;}};
}
