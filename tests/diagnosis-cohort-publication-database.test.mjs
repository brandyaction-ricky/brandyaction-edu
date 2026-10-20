import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('cohort publication persists for later members, isolates cohorts, keeps personal overrides and started attempts, fences writes and permissions',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active',role text default 'student',full_name text,email text,phone text,contact_email text,created_at timestamptz default now());
 create table courses(id uuid primary key,title text);
 create table cohorts(id uuid primary key,course_id uuid references courses(id),name text,cohort_code text,created_at timestamptz default now());
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text,order_number text,customer_name text,customer_email text,customer_phone text,created_at timestamptz default now());
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id),cohort_id uuid references cohorts(id));
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),cohort_id uuid references cohorts(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
 create table site_settings(key text primary key,value jsonb);create table crm_tags(id uuid primary key,name text);create table crm_member_tags(member_id uuid,tag_id uuid);
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const f of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql','20261001230818_edu_diagnosis_admin_pilot.sql','20261002072505_edu_admin_diagnosis_retests.sql','20261003070134_diagnosis_admin_management.sql','20261006070359_member_payment_directory_search.sql','20261006095152_diagnosis_admin_member_lookup.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 const admin=id(99),a=id(1),b=id(2),both=id(3),personal=id(4),late=id(5),expired=id(6),refunded=id(7),future=id(8),outsider=id(9),course=id(100),other=id(101),four=id(104),five=id(105),empty=id(106),foreign=id(107);
 for(const [who,name]of [[admin,'관리자'],[a,'4기 회원'],[b,'5기 회원'],[both,'두 기수 회원'],[personal,'개인 비공개'],[late,'이후 등록'],[expired,'만료 수강'],[refunded,'환불 회원'],[future,'수강 전'],[outsider,'무관한 회원']])await db.query('insert into profiles(id,full_name,role) values($1,$2,$3)',[who,name,who===admin?'admin':'student']);
 await db.query("insert into courses values($1,'진단 상품'),($2,'무관한 상품')",[course,other]);
 for(const[h,c,name]of[[four,course,'4기'],[five,course,'5기'],[empty,course,'6기'],[foreign,other,'다른 반']])await db.query('insert into cohorts(id,course_id,name,cohort_code) values($1,$2,$3,$3)',[h,c,name]);
 await db.query("insert into edu_diagnosis_offers(course_id,package_version,release_id,enabled) values($1,'pilot',$2,true)",[course,id(200)]);
 await db.exec('update edu_diagnosis_control set enabled=true,learners_published=false');
 const enroll=async(user,cohort,patch='')=>db.query(`insert into enrollments(id,user_id,course_id,cohort_id,status${patch?',access_ends_at':''}) values($1,$2,$3,$4,'active'${patch?",'2000-01-01'":''})`,[id(1000+user.slice(-3)*1+cohort.slice(-3)*10),user,course,cohort]);
 for(const[u,h]of[[a,four],[b,five],[both,four],[both,five],[personal,four],[expired,four]])await enroll(u,h,u===expired?'expired':'');
 await enroll(future,four);await db.query("update enrollments set access_starts_at='2099-01-01' where user_id=$1",[future]);
 await db.query("insert into orders(id,user_id,status) values($1,$2,'refunded')",[id(300),refunded]);await db.query('insert into order_items values($1,$2,$3,$4)',[id(301),id(300),course,four]);
 // Snapshot old publication behavior before creating the empty cohort rule table.
 const call=async(fn,args)=>Object.values((await db.query(`select ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0])[0];
 await db.exec('set role service_role');const initial=await call('edu_diagnosis_admin_list',[admin,null,'',100]);
 await db.exec('reset role');await db.exec(readFileSync(new URL('../supabase/migrations/20261020080824_edu_n6_cohort_publication.sql',import.meta.url),'utf8'));await db.exec('set role service_role');
 let list=await call('edu_diagnosis_admin_list',[admin,null,'',100]);assert.equal(list.eligibleCount,initial.eligibleCount);assert.deepEqual(list.rows.map(r=>[r.id,r.published]),initial.rows.map(r=>[r.id,r.published]));assert.equal(list.revision,0);assert.equal(list.cohorts.length,3);
 const scoped=(h,q='',before=null,limit=100)=>call('edu_diagnosis_admin_scoped_list',[admin,h,null,before,q,limit]);
 assert.deepEqual((await scoped(four)).rows.map(r=>r.id),[a,both,personal]);assert.equal((await scoped(four)).startedCount,0);assert.equal((await scoped(empty)).eligibleCount,0);
 await assert.rejects(scoped(foreign),/DIAGNOSIS_INVALID/);
 await call('edu_diagnosis_admin_publication',[admin,id(400),'publish_member',personal,false,0]);
 const args=[admin,id(401),four,true,1];const receipt=await call('edu_diagnosis_admin_cohort_publication',args);assert.deepEqual(await call('edu_diagnosis_admin_cohort_publication',args),receipt);
 assert.equal(await call('edu_diagnosis_actor_allowed',[a]),true);assert.equal(await call('edu_diagnosis_actor_allowed',[b]),false);assert.equal(await call('edu_diagnosis_actor_allowed',[personal]),false);assert.equal(await call('edu_diagnosis_actor_allowed',[both]),true);
 let view=await scoped(four);assert.equal(view.cohort.individualCount,1);assert.equal(view.cohort.inherited,false);assert.equal(view.cohort.enabled,true);assert.equal(view.allPublished,false);
 assert.equal((await call('edu_diagnosis_admin_member',[admin,a])).rows[0].published,true);
 await assert.rejects(call('edu_diagnosis_admin_cohort_publication',[admin,id(402),five,true,1]),/DIAGNOSIS_CONFLICT/);
 await assert.rejects(call('edu_diagnosis_admin_cohort_publication',[admin,args[1],five,true,1]),/DIAGNOSIS_CONFLICT/);
 await assert.rejects(call('edu_diagnosis_admin_cohort_publication',[a,id(403),five,true,2]),/DIAGNOSIS_FORBIDDEN/);
 await assert.rejects(call('edu_diagnosis_admin_cohort_publication',[admin,id(404),foreign,true,2]),/DIAGNOSIS_INVALID/);
 assert.equal((await scoped(four)).revision,2);
 await enroll(late,four);assert.equal(await call('edu_diagnosis_actor_allowed',[late]),true);
 assert.equal(await call('edu_diagnosis_actor_allowed',[expired]),false);assert.equal(await call('edu_diagnosis_actor_allowed',[refunded]),false);assert.equal(await call('edu_diagnosis_actor_allowed',[future]),false);assert.equal(await call('edu_diagnosis_actor_allowed',[outsider]),false);
 const attempt=await call('edu_diagnosis_begin',[a,course]);
 await call('edu_diagnosis_admin_cohort_publication',[admin,id(405),five,true,2]);
 await call('edu_diagnosis_admin_cohort_publication',[admin,id(406),four,false,3]);
 assert.equal(await call('edu_diagnosis_actor_allowed',[late]),false);assert.equal(await call('edu_diagnosis_actor_allowed',[both]),true);assert.equal(await call('edu_diagnosis_actor_allowed',[b]),true);assert.equal((await call('edu_diagnosis_read',[a])).id,attempt.id);
 const filtered=await scoped(four,'4기 회원');assert.equal(filtered.rows.length,1);assert.equal(filtered.eligibleCount,4);assert.equal(filtered.startedCount,1);
 const first=await scoped(four,'',null,2),second=await scoped(four,'',first.nextCursor,2);assert.equal(first.rows.length,2);assert.equal(second.rows.length,2);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,4);assert.equal(second.nextCursor,null);
 // Paid-order membership survives an expired curriculum window, but refunds remove eligibility.
 await db.query("insert into profiles(id,full_name) values($1,'결제 수강생')",[id(10)]);
 await db.query("insert into orders(id,user_id,status) values($1,$2,'paid')",[id(310),id(10)]);await db.query('insert into order_items values($1,$2,$3,$4)',[id(311),id(310),course,five]);
 assert.equal(await call('edu_diagnosis_actor_allowed',[id(10)]),true);assert.ok((await scoped(five)).rows.some(r=>r.id===id(10)));
 await db.query("update orders set status='refunded' where id=$1",[id(310)]);assert.equal(await call('edu_diagnosis_actor_allowed',[id(10)]),false);assert.ok(!(await scoped(five)).rows.some(r=>r.id===id(10)));
 // Global close resets cohort rules, so legacy global controls still mean everyone.
 await call('edu_diagnosis_admin_publication',[admin,id(407),'publish_all',null,false,4]);assert.equal(await call('edu_diagnosis_actor_allowed',[b]),false);assert.equal((await scoped(five)).cohort.enabled,false);
 await call('edu_diagnosis_admin_publication',[admin,id(408),'publish_all',null,true,5]);assert.equal(await call('edu_diagnosis_actor_allowed',[personal]),true);assert.equal((await scoped(four)).cohort.enabled,true);
 assert.equal((await db.query("select count(*)::int n from edu_diagnosis_admin_events where action='publish_cohort'")).rows[0].n,3);
 for(const role of['anon','authenticated']){
 await db.exec('reset role;set role '+role);
 await assert.rejects(call('edu_diagnosis_admin_cohort_publication',[admin,id(409),five,true,6]),/permission denied/);
 await assert.rejects(call('edu_diagnosis_admin_scoped_list',[admin,four,null,null,'',100]),/permission denied/);
 await assert.rejects(db.query('select * from edu_diagnosis_cohort_publication'),/permission denied/);
 }
});
