begin;
create index edu_message_conversation_time on public.edu_member_messages(sender_id,recipient_id,created_at desc,id desc) where not is_notice;
create index edu_question_member_time on public.edu_questions(user_id,created_at desc,id desc);
create index edu_question_answer_time on public.edu_question_answers(question_id,created_at desc,id desc);

-- Read projection only. Direct messages keep the existing participant boundary;
-- member-management access does not expose another operator's private mailbox.
create function public.edu_member_conversation(p_actor uuid,p_member uuid,p_before jsonb default null)
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
      case when m.sender_id=p_member then 'incoming' else 'outgoing' end as direction,m.read_at,null::uuid as question,false as archived
      from public.edu_member_messages m join public.profiles p on p.id=m.sender_id
      where not m.is_notice and ((m.sender_id=p_member and m.recipient_id=p_actor) or (m.sender_id=p_actor and m.recipient_id=p_member))
        and (p_before is null or (m.created_at,'message'::text,m.id)<(before_at,before_kind,before_id))
      order by m.created_at desc,m.id desc limit 26)
    union all
    (select q.id,'question',q.created_at,q.title,q.content,coalesce(p.full_name,'회원'),'incoming',null::timestamptz,q.id,q.is_archived
      from public.edu_questions q join public.profiles p on p.id=q.user_id where q.user_id=p_member
        and (p_before is null or (q.created_at,'question'::text,q.id)<(before_at,before_kind,before_id))
      order by q.created_at desc,q.id desc limit 26)
    union all
    (select a.id,'answer',a.created_at,q.title,a.content,a.author_name,'outgoing',null::timestamptz,q.id,q.is_archived
      from public.edu_question_answers a join public.edu_questions q on q.id=a.question_id where q.user_id=p_member
        and (p_before is null or (a.created_at,'answer'::text,a.id)<(before_at,before_kind,before_id))
      order by a.created_at desc,a.id desc limit 26)
  ), page as (select * from items order by at desc,kind desc,id desc limit 26), visible as (select * from page order by at desc,kind desc,id desc limit 25)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'at',at,'title',title,'content',content,
    'author',author,'direction',direction,'readAt',read_at,'question',question,'archived',archived) order by at desc,kind desc,id desc) from visible),'[]'),
    'nextCursor',case when (select count(*) from page)>25 then (select jsonb_build_object('at',at,'kind',kind,'id',id) from visible order by at,kind,id limit 1) else null end) into result;
  return result;
end;
$$;
revoke all on function public.edu_member_conversation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_member_conversation(uuid,uuid,jsonb) to service_role;
commit;
