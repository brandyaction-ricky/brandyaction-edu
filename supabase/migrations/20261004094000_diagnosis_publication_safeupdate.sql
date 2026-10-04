begin;
-- Replace only the publication function; keep privileges, security invoker and revision fencing.
create or replace function public.edu_diagnosis_admin_publication(p_actor uuid,p_request uuid,p_action text,p_user uuid,p_enabled boolean,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.edu_diagnosis_control;e public.edu_diagnosis_admin_events;v jsonb;payload jsonb;
begin
 perform public.edu_diagnosis_assert_admin(p_actor);
 if p_request is null or p_enabled is null or p_revision is null or p_revision<0 or p_action is null or p_action not in('publish_all','publish_member') or(p_action='publish_all' and p_user is not null) or(p_action='publish_member' and p_user is null) then raise exception 'DIAGNOSIS_INVALID';end if;
 payload:=jsonb_build_object('enabled',p_enabled,'revision',p_revision,'userId',p_user);
 select * into c from public.edu_diagnosis_control where singleton for update;
 select * into e from public.edu_diagnosis_admin_events where request_id=p_request;
 if found then if e.actor_id<>p_actor or e.action<>p_action or e.payload<>payload then raise exception 'DIAGNOSIS_CONFLICT';end if;return e.result;end if;
 if c.publication_revision<>p_revision then raise exception 'DIAGNOSIS_CONFLICT';end if;
 if not c.enabled then raise exception 'DIAGNOSIS_DISABLED';end if;
 if p_action='publish_member' then
 if not public.edu_diagnosis_student_eligible(p_user) then raise exception 'DIAGNOSIS_FORBIDDEN';end if;
 insert into public.edu_diagnosis_publication_overrides(user_id,enabled,updated_by) values(p_user,p_enabled,p_actor)
 on conflict(user_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
 else update public.edu_diagnosis_control set learners_published=p_enabled where singleton;
 -- All existing overrides intentionally follow the explicit bulk choice.
 -- user_id is a NOT NULL primary key; keep the bulk semantics while satisfying safeupdate.
 update public.edu_diagnosis_publication_overrides set enabled=p_enabled,updated_by=p_actor,updated_at=now()
 where user_id is not null;end if;
 update public.edu_diagnosis_control set publication_revision=publication_revision+1 where singleton returning * into c;
 v:=jsonb_build_object('revision',c.publication_revision,'allPublished',c.learners_published,'userId',p_user,'enabled',p_enabled);
 insert into public.edu_diagnosis_admin_events(request_id,actor_id,action,user_id,payload,result) values(p_request,p_actor,p_action,p_user,payload,v);return v;
end $$;
commit;
