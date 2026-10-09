import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('member/payment directory filters the entire population and preserves identity, access and pagination',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active',role text default 'student',full_name text,email text,phone text,contact_email text,created_at timestamptz default now());
 create table courses(id uuid primary key,title text);
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text,order_number text,customer_name text,customer_email text,customer_phone text,created_at timestamptz default now());
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
 create table site_settings(key text primary key,value jsonb);
 create table crm_tags(id uuid primary key,name text);create table crm_member_tags(member_id uuid,tag_id uuid);
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const f of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql','20261001230818_edu_diagnosis_admin_pilot.sql','20261002072505_edu_admin_diagnosis_retests.sql','20261003070134_diagnosis_admin_management.sql','20261006070359_member_payment_directory_search.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 const admin=id(1),staff=id(2),blockedStaff=id(3),student=id(4),samePhone=id(5),withdrawn=id(6),suspendedAdmin=id(7),course=id(500),otherCourse=id(501);
 await db.query(`insert into profiles(id,role,status,full_name,email,phone,contact_email,created_at) values
 ($1,'admin','active','운영자','admin@example.test',null,null,now()),
 ($2,'staff','active','스태프','staff@example.test',null,null,now()),
 ($3,'staff','active','권한 없음','none@example.test',null,null,now()),
 ($4,'student','active','가입자 샘플','account@example.test','010-1234-5678','delivery@example.test','2020-01-01'),
 ($5,'student','active','동일 연락처','unrelated@example.test','01012345678',null,now()),
 ($6,'student','withdrawn','탈퇴','withdrawn@example.test',null,null,now()),
 ($7,'admin','suspended','정지 관리자','stopped@example.test',null,null,now())`,[admin,staff,blockedStaff,student,samePhone,withdrawn,suspendedAdmin]);
 await db.query("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+staff]);
 await db.query("insert into courses values($1,'특별 수강반'),($2,'다른 수강반')",[course,otherCourse]);
 await db.query("insert into edu_diagnosis_offers(course_id,package_version,release_id,enabled) values($1,'pilot',$2,true)",[course,id(600)]);
 await db.exec('update edu_diagnosis_control set enabled=true,learners_published=true');
 for(let n=100;n<210;n++)await db.query("insert into profiles(id,full_name) values($1,$2)",[id(n),'일반 회원 '+n]);
 await db.query(`insert into orders(id,user_id,status,order_number,customer_name,customer_email,customer_phone) values
 ($1,$2,'paid','BAE-SAMPLE-001','결제자 샘플','buyer@example.test','01012345678'),
 ($3,$2,'paid','BAE-SAMPLE-002','결제자 샘플','buyer@example.test','01012345678'),
 ($4,$2,'pending','BAE-PENDING','미결제자','pending@example.test','01000000000'),
 ($5,$6,'refunded','BAE-REFUND','환불 구매자','refunded@example.test','01099999999')`,[id(700),student,id(701),id(702),id(703),samePhone]);
 await db.query('insert into order_items values($1,$2,$3)',[id(800),id(700),course]);
 await db.query("insert into enrollments(id,user_id,course_id,status) values($1,$2,$3,'active'),($4,$2,$5,'revoked')",[id(900),student,course,id(901),otherCourse]);
 await db.query("insert into crm_tags values($1,'특별 태그')",[id(950)]);await db.query('insert into crm_member_tags values($1,$2)',[student,id(950)]);
 const before=(await db.query('select * from profiles order by id')).rows;
 await db.exec('set role service_role');
 const call=async(name,args)=>Object.values((await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0])[0];
 const list=(q='',extra={})=>call('edu_admin_member_directory',[extra.actor||admin,q,extra.status||'',extra.course||null,extra.member||null,extra.page||1,extra.limit||100]);
 const first=await list(),second=await list('',{page:2});assert.equal(first.total,116);assert.equal(first.rows.length,100);assert.equal(second.rows.length,16);assert.equal(first.rows.some(r=>r.id===student),false);assert.equal(second.rows.at(-1).id,student);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,116);
 for(const q of ['가입자 샘플','ACCOUNT@EXAMPLE.TEST','결제자 샘플','buyer@example.test','BAE-SAMPLE-001','delivery@example.test','특별 태그','특별 수강반']){const r=await list(q);assert.equal(r.total,1,q);assert.equal(r.rows[0].id,student);assert.equal(r.rows[0].paymentContacts.length,2);}
 assert.equal((await list('010 1234 5678')).total,2);
 assert.deepEqual((await list('',{member:samePhone})).rows[0].paymentContacts.map(c=>c.orderNumber),['BAE-REFUND']);
 assert.equal((await list('buyer12345678@example.test')).total,0);
 for(const q of ['%','_','pending@example.test','미결제자','탈퇴'])assert.equal((await list(q)).total,0,q);
 assert.equal((await list('환불 구매자')).total,1);
 assert.equal((await list('',{course})).rows[0].id,student);assert.equal((await list('',{course:otherCourse})).total,0);assert.equal((await list('',{status:'suspended'})).total,1);
 assert.equal((await list('결제자 샘플',{actor:staff})).total,1);
 for(const actor of [blockedStaff,student,suspendedAdmin])await assert.rejects(list('',{actor}),/MEMBER_DIRECTORY_FORBIDDEN/);
 await assert.rejects(list('x'.repeat(101)),/MEMBER_DIRECTORY_INVALID/);
 const diagnosis=await call('edu_diagnosis_admin_list',[admin,null,'buyer@example.test',100]);assert.equal(diagnosis.rows.length,1);assert.equal(diagnosis.rows[0].id,student);assert.equal(diagnosis.rows[0].email,'account@example.test');assert.equal(diagnosis.rows[0].published,true);assert.equal(diagnosis.rows[0].paymentContacts.length,2);assert.equal(diagnosis.eligibleCount,1);
 assert.equal((await call('edu_diagnosis_admin_list',[admin,null,'환불 구매자',100])).rows.length,0);
 assert.equal((await call('edu_diagnosis_admin_list',[admin,student,'buyer@example.test',100])).rows.length,0);
 assert.deepEqual((await db.query('select * from profiles order by id')).rows,before);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);for(const [name,args] of [['edu_member_payment_contacts',[student]],['edu_member_directory_matches',[student,'']],['edu_admin_member_directory',[admin]],['edu_diagnosis_admin_list',[admin]]])await assert.rejects(call(name,args),/permission denied/);}
});
