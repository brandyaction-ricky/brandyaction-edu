import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20260928194336_edu_member_messages.sql',import.meta.url),'utf8');
async function setup(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,role text,status text,full_name text,email text);
 create table site_settings(key text primary key,value jsonb);
 create table enrollments(id uuid primary key,user_id uuid);
 create table edu_ongoing_completions(id uuid primary key,enrollment_id uuid,lesson_id uuid);
 grant select on all tables in schema public to service_role;`);
 await db.exec(migration);
 const admin=id(),student=id(),other=id(),staff=id(),lesson=id(),enrollment=id();
 for(const [who,role,name] of [[admin,'admin','멘토'],[student,'member','학생'],[other,'member','다른 학생'],[staff,'staff','직원']])await db.query("insert into profiles values($1,$2,'active',$3,$4)",[who,role,name,name+'@example.test']);
 await db.query('insert into enrollments values($1,$2)',[enrollment,student]);
 await db.query('insert into edu_ongoing_completions values($1,$2,$3),($4,$2,$3)',[id(),enrollment,lesson,id()]);
 await db.exec('set role service_role');
 const send=async(actor=admin,targets=[student],content='학습 안내',request=id(),reply=null,ongoing=null)=>(await db.query('select edu_send_member_message($1,$2,$3,$4,$5,$6) as result',[actor,request,content,targets,reply,ongoing])).rows[0].result;
 const list=async(actor,box='inbox',before=null)=>(await db.query('select edu_list_member_messages($1,$2,$3) as result',[actor,box,before])).rows[0].result;
 const read=async(actor,message)=>(await db.query('select edu_mark_member_message_read($1,$2) as result',[actor,message])).rows[0].result;
 const recipients=async(actor=admin,search='',after=null,ongoing=null)=>(await db.query('select edu_message_recipients($1,$2,$3,$4) as result',[actor,search,after,ongoing])).rows[0].result;
 const owner=async(sql,args=[])=>{await db.exec('reset role');try{return args.length ? await db.query(sql,args) : await db.exec(sql);}finally{await db.exec('set role service_role');}};
 return{db,admin,student,other,staff,lesson,enrollment,send,list,read,recipients,owner};
}
test('one atomic batch delivers once per recipient and replays the original receipt after loss of response',async t=>{
 const h=await setup(t),request=id();
 const result=await h.send(h.admin,[h.student,h.other,h.student],'본문\n두 번째 줄',request);
 assert.equal(result.count,2);assert.deepEqual(await h.send(h.admin,[h.other,h.student],'본문\n두 번째 줄',request),result);
 assert.equal((await h.list(h.student)).rows[0].content,'본문\n두 번째 줄');assert.equal((await h.list(h.other)).rows.length,1);
 assert.equal((await h.list(h.admin,'sent')).rows.length,2);
 await assert.rejects(()=>h.send(h.admin,[h.student],'다른 내용',request),/MESSAGE_REQUEST_REUSED/);
});
test('members can only contact the active mentor or reply to their own incoming operator message',async t=>{
 const h=await setup(t);await h.send(h.student,[],'문의');assert.equal((await h.list(h.admin)).rows[0].senderId,h.student);
 await assert.rejects(()=>h.send(h.student,[h.other]),/MESSAGE_FORBIDDEN/);
 const incoming=await h.send();const reply=await h.send(h.student,[],'감사합니다',id(),incoming.messageIds[0]);assert.equal(reply.count,1);
 await assert.rejects(()=>h.send(h.other,[],'도용 답장',id(),incoming.messageIds[0]),/MESSAGE_NOT_FOUND/);
 await assert.rejects(()=>h.recipients(h.student),/MESSAGE_FORBIDDEN/);
});
test('only the recipient can mark an individual message read, with a stable read timestamp',async t=>{
 const h=await setup(t),sent=await h.send(),message=sent.messageIds[0];
 assert.equal((await h.list(h.student)).unreadCount,1);assert.equal((await h.list(h.other)).rows.length,0);
 await assert.rejects(()=>h.read(h.other,message),/MESSAGE_NOT_FOUND/);await assert.rejects(()=>h.read(h.admin,message),/MESSAGE_NOT_FOUND/);
 const a=await h.read(h.student,message),b=await h.read(h.student,message);assert.deepEqual(a,b);
 assert.equal((await h.list(h.student)).unreadCount,0);assert.equal((await h.list(h.admin,'sent')).rows[0].readAt,a.readAt);
});
test('staff member permissions and current active status are checked in the database',async t=>{
 const h=await setup(t);await assert.rejects(()=>h.send(h.staff,[h.student]),/MESSAGE_FORBIDDEN/);
 await h.owner('insert into site_settings values($1,$2)',['edu_staff_permissions_'+h.staff,{members:true}]);
 await h.send(h.staff,[h.student]);assert.equal((await h.list(h.staff,'sent')).rows.length,1);
 await h.owner("update site_settings set value='{}'::jsonb");await assert.rejects(()=>h.send(h.staff,[h.student]),/MESSAGE_FORBIDDEN/);
 await h.owner("update profiles set status='inactive' where id=$1",[h.student]);
 await assert.rejects(()=>h.list(h.student),/MESSAGE_FORBIDDEN/);await assert.rejects(()=>h.send(h.admin,[h.student]),/MESSAGE_RECIPIENT_UNAVAILABLE/);
});
test('mixed invalid recipients or a later database failure leave no partial messages or receipt',async t=>{
 const h=await setup(t);await assert.rejects(()=>h.send(h.admin,[h.student,id()]),/MESSAGE_RECIPIENT_UNAVAILABLE/);
 await h.owner(`create function reject_one_message() returns trigger language plpgsql as $$begin if new.content='force failure' and exists(select 1 from public.edu_member_messages where request_id=new.request_id) then raise exception 'late failure';end if;return new;end;$$;
 create trigger fail_late before insert on edu_member_messages for each row execute function reject_one_message();`);
 await assert.rejects(()=>h.send(h.admin,[h.student,h.other],'force failure'),/late failure/);
 assert.equal((await h.db.query('select count(*)::integer as n from edu_message_batches')).rows[0].n,0);assert.equal((await h.list(h.student)).rows.length,0);
});
test('ongoing recipient selection is based on any historical completion and deduplicates the same member',async t=>{
 const h=await setup(t),r=await h.recipients(h.admin,'',null,h.lesson);assert.deepEqual(r.rows.map(row=>row.id),[h.student]);
 await h.send(h.admin,[h.student],'챌린지 안내',id(),null,h.lesson);
 await assert.rejects(()=>h.send(h.admin,[h.other],'대상 아님',id(),null,h.lesson),/MESSAGE_RECIPIENT_CHANGED/);
 assert.equal((await h.recipients(h.admin,'학생@example.test',null,h.lesson)).rows.length,1);
 assert.equal((await h.recipients(h.admin,'%',null,h.lesson)).rows.length,0);
});
test('cursor pages remain disjoint while new messages arrive and read is never implicit in GET',async t=>{
 const h=await setup(t);await h.owner(`insert into edu_message_batches(actor_id,request_id,payload) values($1,$2,'{}')`,[h.admin,'11111111-1111-4111-8111-111111111111']);
 await h.owner(`insert into edu_member_messages(sender_id,recipient_id,request_id,content) select $1,p.id,'11111111-1111-4111-8111-111111111111','각자에게' from profiles p where p.id<>$1`,[h.admin]);
 // Individual request IDs permit many independent messages to the same inbox.
 for(let n=0;n<27;n++){
  const request=id();await h.owner("insert into edu_message_batches(actor_id,request_id,payload) values($1,$2,'{}')",[h.admin,request]);
  await h.owner('insert into edu_member_messages(sender_id,recipient_id,request_id,content) values($1,$2,$3,$4)',[h.admin,h.student,request,'메시지 '+n]);
 }
 const first=await h.list(h.student);assert.equal(first.rows.length,25);assert.equal(first.unreadCount,28);assert.ok(first.nextCursor);
 const newRequest=id();await h.owner("insert into edu_message_batches(actor_id,request_id,payload) values($1,$2,'{}')",[h.admin,newRequest]);
 await h.owner("insert into edu_member_messages(sender_id,recipient_id,request_id,content) values($1,$2,$3,'새 메시지')",[h.admin,h.student,newRequest]);
 const second=await h.list(h.student,'inbox',first.nextCursor);assert.equal(second.rows.length,3);assert.equal(second.nextCursor,null);
 assert.ok(second.rows.every(row=>!first.rows.some(item=>item.id===row.id)));assert.equal((await h.list(h.student)).unreadCount,29);
});
test('private tables and actor-accepting RPCs reject direct browser database roles',async t=>{
 const h=await setup(t);
 for(const role of ['anon','authenticated']){
  await h.db.exec('reset role;set role '+role);
  for(const query of ['select * from edu_member_messages','select * from edu_message_batches',`select edu_list_member_messages('${h.admin}','inbox',null)`,`select edu_message_operator('${h.admin}')`,`select edu_send_member_message('${h.admin}','${id()}','x','{}',null,null)`])await assert.rejects(()=>h.db.exec(query),/permission denied/);
 }
});
test('rate limit is atomic per actor and replay still works after reaching it',async t=>{
 const h=await setup(t),request=id(),sent=await h.send(h.student,[],'문의',request);
 for(let n=0;n<19;n++)await h.send(h.student,[],'문의 '+n);
 await assert.rejects(()=>h.send(h.student,[],'한도 초과'),/MESSAGE_RATE_LIMIT/);
 assert.deepEqual(await h.send(h.student,[],'문의',request),sent);
});
