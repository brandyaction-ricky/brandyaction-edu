begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
-- Additive metadata; historical payloads and publication records remain immutable.
create table public.edu_lesson_author_save_notes (
 revision uuid primary key references public.edu_lesson_author_versions(id),
 source text not null check(source in ('manual','autosave','backup')),
 note text not null default '' check(length(note)<=160)
);
alter table public.edu_lesson_author_save_notes enable row level security;
revoke all on public.edu_lesson_author_save_notes from public,anon,authenticated;
grant select,insert on public.edu_lesson_author_save_notes to service_role;

create function public.edu_save_lesson_author_recorded(p_actor uuid,p_lesson uuid,p_expected uuid,p_request uuid,p_stamp text,p_payload jsonb,p_create boolean,p_rebase boolean,p_source text,p_note text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt jsonb; existing public.edu_lesson_author_save_notes%rowtype;
begin
 if p_source is null or p_source not in ('manual','autosave','backup') or p_note is null or length(p_note)>160 or (p_source<>'manual' and p_note<>'') then raise exception 'AUTHOR_INVALID';end if;
 if p_source='backup' then
  receipt:=public.edu_backup_lesson_author(p_actor,p_lesson,p_request,p_stamp,p_payload);
 else
  receipt:=public.edu_save_lesson_author(p_actor,p_lesson,p_expected,p_request,p_stamp,p_payload,p_create,p_rebase);
 end if;
 insert into public.edu_lesson_author_save_notes(revision,source,note) values(p_request,p_source,p_note) on conflict(revision) do nothing;
 select * into existing from public.edu_lesson_author_save_notes where revision=p_request;
 if (existing.source,existing.note) is distinct from (p_source,p_note) then raise exception 'AUTHOR_CHANGED';end if;
 return receipt;
end;
$$;

create function public.edu_lesson_author_history(p_actor uuid,p_lesson uuid,p_before_at timestamptz default null,p_before_id uuid default null,p_mode text default 'important',p_from date default null,p_to date default null,p_editor text default '')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
 if p_mode is null or p_mode not in ('important','all') or p_editor is null or length(p_editor)>100 or (p_before_at is null)<>(p_before_id is null) or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'AUTHOR_INVALID';end if;
 with candidates as (
  select a.id,a.created_at,a.created_by,a.payload->'form'->'basic'->>'title' title,a.kind='baseline' baseline,
   coalesce(n.source,'legacy') source,coalesce(n.note,'') note,coalesce(nullif(p.full_name,''),'이름 없는 관리자') editor,
   exists(select 1 from public.edu_lesson_author_publications pub where pub.revision=a.id) published
  from public.edu_lesson_author_versions a
  left join public.edu_lesson_author_save_notes n on n.revision=a.id
  left join public.profiles p on p.id=a.created_by
  where a.lesson_id=p_lesson
   and (p_before_at is null or (a.created_at,a.id)<(p_before_at,p_before_id))
   and (p_from is null or a.created_at>=p_from::timestamp at time zone 'Asia/Seoul')
   and (p_to is null or a.created_at<(p_to+1)::timestamp at time zone 'Asia/Seoul')
   and (p_editor='' or position(lower(p_editor) in lower(coalesce(p.full_name,'')))>0)
 ), page as (
  select * from candidates where p_mode='all' or baseline or published or source in ('manual','backup')
  order by created_at desc,id desc limit 31
 ), shown as (select * from page order by created_at desc,id desc limit 30)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('revision',id,'createdAt',created_at,'createdBy',created_by,'editor',editor,'source',source,'note',note,'title',title,'baseline',baseline,'published',published) order by created_at desc,id desc) from shown),'[]'::jsonb),
  'next',case when (select count(*) from page)>30 then (select jsonb_build_object('at',created_at,'id',id) from shown order by created_at,id limit 1) else null end) into result;
 return result;
end;
$$;
revoke all on function public.edu_save_lesson_author_recorded(uuid,uuid,uuid,uuid,text,jsonb,boolean,boolean,text,text),public.edu_lesson_author_history(uuid,uuid,timestamptz,uuid,text,date,date,text) from public,anon,authenticated;
grant execute on function public.edu_save_lesson_author_recorded(uuid,uuid,uuid,uuid,text,jsonb,boolean,boolean,text,text),public.edu_lesson_author_history(uuid,uuid,timestamptz,uuid,text,date,date,text) to service_role;
commit;
