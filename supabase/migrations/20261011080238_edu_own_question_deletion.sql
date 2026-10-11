begin;
-- Site deletion is distinct from archive and account erasure. Keep the source ID
-- and independent business records (including RESTRICT conversion references).
alter table public.edu_questions add column deleted_at timestamptz;
create index edu_questions_deleted on public.edu_questions(deleted_at) where deleted_at is not null;
create policy edu_question_deleted_hidden on public.edu_questions as restrictive for select to anon,authenticated using(deleted_at is null);
create policy edu_question_deleted_no_client_update on public.edu_questions as restrictive for update to anon,authenticated using(deleted_at is null) with check(deleted_at is null);
create policy edu_answer_deleted_question_hidden on public.edu_question_answers as restrictive for select to anon,authenticated
 using(exists(select 1 from public.edu_questions q where q.id=question_id and q.deleted_at is null));

create function public.edu_question_delete_ready() returns boolean language sql stable security invoker set search_path='' as $$ select true $$;
create function public.edu_can_delete_own_question(p_actor uuid,p_question uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q public.edu_questions%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 select * into q from public.edu_questions where id=p_question and user_id=p_actor;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 return jsonb_build_object('canDelete',q.deleted_at is null,'headId',q.answer_head_id,'deletedAt',q.deleted_at);
end; $$;

create function public.edu_delete_own_question(p_actor uuid,p_question uuid,p_expected_head uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; stamp timestamptz;
begin
 perform public.edu_assert_message_actor(p_actor);
 -- Same question -> actor -> dependent-resource order as answer writes.
 select * into q from public.edu_questions where id=p_question and user_id=p_actor for update;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 perform 1 from public.profiles where id=p_actor and status='active' for share;
 perform public.edu_assert_message_actor(p_actor);
 if q.deleted_at is not null then return jsonb_build_object('id',q.id,'deletedAt',q.deleted_at); end if;
 if q.answer_head_id is distinct from p_expected_head then raise exception 'QUESTION_CHANGED'; end if;
 stamp:=clock_timestamp();
 update public.edu_questions set deleted_at=stamp,is_archived=true,updated_at=stamp where id=q.id;
 update public.edu_shared_answers set published=false,updated_at=stamp where source_question_id=q.id;
 update public.edu_question_assist_jobs set question_fingerprint='deleted-question:'||q.id::text where question_id=q.id;
 -- Automatic inbox messages contain question/answer snapshots too.
 update public.edu_member_messages set deleted_at=stamp,deleted_by=p_actor where is_notice and deleted_at is null
 and (notice_source='question:'||q.id::text or notice_source like 'answer:'||q.id::text||':%'
  or notice_source in (select 'answer:'||a.id::text from public.edu_question_answers a where a.question_id=q.id));
 update public.edu_push_deliveries d set status='skipped',finished_at=stamp,lease=null,lease_until=null,last_code='QUESTION_DELETED'
 from public.edu_push_events e where d.event_id=e.id and d.status in ('pending','processing')
 and (e.source=q.id::text or e.source like q.id::text||':%' or e.source in (select a.id::text from public.edu_question_answers a where a.question_id=q.id));
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'delete-own-question','edu_questions',q.id,jsonb_build_object('deletedAt',stamp,'scope','site'));
 return jsonb_build_object('id',q.id,'deletedAt',stamp);
end; $$;

-- Archived questions remain accessible to authorized operators. Deleted ones
-- must be rejected before the existing reader authorizes any participant.
alter function public.edu_read_question_thread(uuid,uuid,bigint) set schema edu_private;
create function public.edu_read_question_thread(p_actor uuid,p_question uuid,p_before bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if exists(select 1 from public.edu_questions where id=p_question and deleted_at is not null) then raise exception 'QUESTION_NOT_FOUND'; end if;
 return edu_private.edu_read_question_thread(p_actor,p_question,p_before);
end; $$;
alter function public.edu_read_question_image(uuid,uuid) set schema edu_private;
create function public.edu_read_question_image(p_actor uuid,p_question uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if exists(select 1 from public.edu_questions where id=p_question and deleted_at is not null) then raise exception 'QUESTION_NOT_FOUND'; end if;
 return edu_private.edu_read_question_image(p_actor,p_question);
end; $$;
alter function public.edu_read_answer_image(uuid,uuid,uuid) set schema edu_private;
create function public.edu_read_answer_image(p_actor uuid,p_question uuid,p_answer uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if exists(select 1 from public.edu_questions where id=p_question and deleted_at is not null) then raise exception 'QUESTION_NOT_FOUND'; end if;
 return edu_private.edu_read_answer_image(p_actor,p_question,p_answer);
end; $$;

create function edu_private.guard_deleted_question() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.deleted_at is not null and (
  (to_jsonb(new)-array['course_id','enrollment_id','lesson_id','updated_at']) is distinct from (to_jsonb(old)-array['course_id','enrollment_id','lesson_id','updated_at'])
  or (new.course_id is not null and new.course_id is distinct from old.course_id)
  or (new.enrollment_id is not null and new.enrollment_id is distinct from old.enrollment_id)
  or (new.lesson_id is not null and new.lesson_id is distinct from old.lesson_id)
 ) then raise exception 'QUESTION_NOT_FOUND'; end if;
 return new;
end; $$;
create trigger edu_question_delete_immutable before update on public.edu_questions for each row execute function edu_private.guard_deleted_question();

-- Filter before pagination; ordinary archived conversations are preserved.
create or replace function public.edu_member_conversation(p_actor uuid,p_member uuid,p_before jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; before_at timestamptz; before_kind text; before_id uuid;
begin
  perform public.edu_assert_block_reviewer(p_actor);
  if p_member is null then raise exception 'CONVERSATION_INVALID'; end if;
  if not exists(select 1 from public.profiles where id=p_member and status<>'withdrawn') then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  if p_before is not null then
    if jsonb_typeof(p_before)<>'object' then raise exception 'CONVERSATION_INVALID'; end if;
    if (select array_agg(k order by k) from jsonb_object_keys(p_before) k) is distinct from array['at','id','kind']::text[]
      or jsonb_typeof(p_before->'at')<>'string' or jsonb_typeof(p_before->'id')<>'string' or jsonb_typeof(p_before->'kind')<>'string'
      or p_before->>'kind' not in ('message','question','answer') then raise exception 'CONVERSATION_INVALID'; end if;
    begin before_at:=(p_before->>'at')::timestamptz; before_id:=(p_before->>'id')::uuid;
    exception when others then raise exception 'CONVERSATION_INVALID'; end;
    if before_at is null or not isfinite(before_at) then raise exception 'CONVERSATION_INVALID'; end if;
    before_kind:=p_before->>'kind';
  end if;
  with items as (
    (select m.id,'message'::text as kind,m.created_at as at,'개인 메시지'::text as title,m.content,coalesce(p.full_name,'회원') as author,
      case when m.sender_id=p_member then 'incoming' else 'outgoing' end as direction,m.read_at,null::uuid as question,false as archived,(m.sender_id=p_actor and public.edu_message_operator(p_actor)) as can_delete
      from public.edu_member_messages m join public.profiles p on p.id=m.sender_id
      where m.deleted_at is null and not m.is_notice and ((m.sender_id=p_member and m.recipient_id=p_actor) or (m.sender_id=p_actor and m.recipient_id=p_member))
        and (p_before is null or (m.created_at,'message'::text,m.id)<(before_at,before_kind,before_id))
      order by m.created_at desc,m.id desc limit 26)
    union all
    (select q.id,'question',q.created_at,q.title,q.content,coalesce(p.full_name,'회원'),'incoming',null::timestamptz,q.id,q.is_archived,false
      from public.edu_questions q join public.profiles p on p.id=q.user_id where q.user_id=p_member and q.deleted_at is null
        and (p_before is null or (q.created_at,'question'::text,q.id)<(before_at,before_kind,before_id))
      order by q.created_at desc,q.id desc limit 26)
    union all
    (select a.id,'answer',a.created_at,q.title,a.content,a.author_name,'outgoing',null::timestamptz,q.id,q.is_archived,false
      from public.edu_question_answers a join public.edu_questions q on q.id=a.question_id where q.user_id=p_member and q.deleted_at is null and a.deleted_at is null
        and (p_before is null or (a.created_at,'answer'::text,a.id)<(before_at,before_kind,before_id))
      order by a.created_at desc,a.id desc limit 26)
  ), page as (select * from items order by at desc,kind desc,id desc limit 26), visible as (select * from page order by at desc,kind desc,id desc limit 25)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'at',at,'title',title,'content',content,
    'author',author,'direction',direction,'readAt',read_at,'question',question,'archived',archived,'canDelete',can_delete) order by at desc,kind desc,id desc) from visible),'[]'),
    'nextCursor',case when (select count(*) from page)>25 then (select jsonb_build_object('at',at,'kind',kind,'id',id) from visible order by at,kind,id limit 1) else null end) into result;
  return result;
end;
$$;

revoke all on function public.edu_question_delete_ready(),public.edu_can_delete_own_question(uuid,uuid),public.edu_delete_own_question(uuid,uuid,uuid),public.edu_read_question_thread(uuid,uuid,bigint),public.edu_read_question_image(uuid,uuid),public.edu_read_answer_image(uuid,uuid,uuid),edu_private.guard_deleted_question(),public.edu_member_conversation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_question_delete_ready(),public.edu_can_delete_own_question(uuid,uuid),public.edu_delete_own_question(uuid,uuid,uuid),public.edu_read_question_thread(uuid,uuid,bigint),public.edu_read_question_image(uuid,uuid),public.edu_read_answer_image(uuid,uuid,uuid),edu_private.guard_deleted_question(),public.edu_member_conversation(uuid,uuid,jsonb) to service_role;

commit;
