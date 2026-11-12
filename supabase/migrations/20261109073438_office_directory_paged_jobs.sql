begin;
-- The world document is a projection of seven desks, never the employee registry.
create table public.edu_campus_office_employees (
 owner_id uuid not null references public.profiles on delete cascade,
 employee_id text not null check(length(employee_id) between 1 and 128 and employee_id <> 'manager'),
 profile jsonb not null check(jsonb_typeof(profile)='object' and octet_length(profile::text)<=6000 and
    (profile->>'employeeId'=employee_id and length(profile->>'name') between 1 and 200 and
     profile->>'telegramUrl' ~ '^https://t\.me/[a-z][a-z0-9_]{4,31}$') is true),
 primary key(owner_id, employee_id)
);
create unique index office_directory_bot on public.edu_campus_office_employees(owner_id,(profile->>'telegramUrl'));
alter table public.edu_campus_office_employees enable row level security;
revoke all on public.edu_campus_office_employees from public,anon,authenticated;
grant select,insert on public.edu_campus_office_employees to authenticated;
create policy employee_own on public.edu_campus_office_employees to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
insert into public.edu_campus_office_employees
 select owner_id,p->>'employeeId',p from public.edu_campus_personal_offices cross join lateral jsonb_array_elements(document->'profiles') p where p->>'employeeId'<>'manager';
drop trigger campus_student_roster_changed on public.edu_campus_personal_offices;
-- Preserve the identity of unseated employees, including across legacy imports.
create function private.campus_sync_desks() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.edu_campus_office_employees as d(owner_id,employee_id,profile)
 select new.owner_id,p->>'employeeId',p from jsonb_array_elements(new.document->'profiles') p where p->>'employeeId'<>'manager'
 on conflict(owner_id,employee_id) do update set profile=excluded.profile where d.profile is distinct from excluded.profile;
 return null;
end; $$;
revoke all on function private.campus_sync_desks() from public,anon,authenticated;
create trigger campus_directory_desks after insert or update of document on public.edu_campus_personal_offices for each row execute function private.campus_sync_desks();
create function private.campus_retire_employee_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (new.profile->>'telegramUrl') is distinct from (old.profile->>'telegramUrl') then
  with retired as (update private.campus_student_connections set revoked_at=now() where owner_id=old.owner_id and employee_id=old.employee_id and revoked_at is null returning id,owner_id)
  update private.edu_campus_office_connectors k set enabled=false from retired r where k.connector_id=r.id and k.owner_id=r.owner_id;
 end if;
 return null;
end; $$;
revoke all on function private.campus_retire_employee_link() from public,anon,authenticated;
create trigger campus_retire_employee_link after update or delete on public.edu_campus_office_employees for each row execute function private.campus_retire_employee_link();

alter table public.edu_campus_office_jobs add column employee_id text;
update public.edu_campus_office_jobs j set employee_id=c.employee_id from private.campus_student_connections c
 where j.connector_id=c.id and j.owner_id=c.owner_id and j.enrollment_id=c.enrollment_id;
create function private.campus_job_employee() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.connector_id is not null then
  select c.employee_id into new.employee_id from private.campus_student_connections c where c.id=new.connector_id and c.owner_id=new.owner_id and c.enrollment_id=new.enrollment_id;
 end if;
 return new;
end; $$;
revoke all on function private.campus_job_employee() from public,anon,authenticated;
create trigger campus_job_employee before insert or update of connector_id on public.edu_campus_office_jobs for each row execute function private.campus_job_employee();
create index office_jobs_page on public.edu_campus_office_jobs(owner_id,enrollment_id,(status='archived'),created_at desc,id desc);
create index office_employee_jobs_page on public.edu_campus_office_jobs(owner_id,enrollment_id,employee_id,(status='archived'),created_at desc,id desc);
create index office_jobs_burst on public.edu_campus_office_jobs(owner_id,created_at desc);
-- Compile separate plans for "all" and "one employee"; seek from the last returned key.
create function public.edu_campus_office_page(p_enrollment uuid,p_employee text,p_archived boolean,p_before timestamptz,p_id uuid)
 returns table(id uuid, employee_id text,objective text,output_type text,status text,revision integer,created_at timestamptz)
 language plpgsql stable security invoker set search_path='' as $$
begin
 return query execute 'select j.id,j.employee_id,left(j.objective,160),j.output_type,j.status,j.revision,j.created_at
 from public.edu_campus_office_jobs j where j.owner_id=$1 and j.enrollment_id=$2 and (j.status=''archived'')=$3'
 || case when p_employee is null then '' else ' and j.employee_id=$4' end
 || case when p_before is null then '' else ' and (j.created_at,j.id)<($5,$6)' end
 || ' order by j.created_at desc,j.id desc limit 21' using (select auth.uid()),p_enrollment,p_archived,p_employee,p_before,p_id;
end; $$;
revoke all on function public.edu_campus_office_page(uuid,text,boolean,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.edu_campus_office_page(uuid,text,boolean,timestamptz,uuid) to authenticated;

-- Replace only these clauses: keep each environment's existing access gates and replay logic.
do $migration$
declare target record; definition text;
begin
 for target in select * from (values
('private.campus_student_connection(uuid,text,text,text,text)',$from$select p->>'telegramUrl' into link from public.edu_campus_personal_offices o
    cross join lateral jsonb_array_elements(o.document->'profiles') p
    where o.owner_id=actor and p->>'employeeId'=p_employee and p_employee<>'manager';$from$,$to$select profile->>'telegramUrl' into link from public.edu_campus_office_employees where owner_id=actor and employee_id=p_employee;$to$),
('private.campus_student_report(text,bigint,text,uuid,text,jsonb)',$from$not exists (select from public.edu_campus_personal_offices o cross join lateral jsonb_array_elements(o.document->'profiles') p
       where o.owner_id=c.owner_id and p->>'employeeId'=c.employee_id and p->>'telegramUrl'=c.telegram_url)$from$,$to$not exists(select from public.edu_campus_office_employees d where d.owner_id=c.owner_id and d.employee_id=c.employee_id and d.profile->>'telegramUrl'=c.telegram_url)$to$),
('private.campus_office_register(text,text,uuid[],uuid,text,jsonb)',$from$if (select count(*) from public.edu_campus_office_jobs where owner_id=owner and enrollment_id=enrollment and status<>'archived')>=50
   or (select count(*) from public.edu_campus_office_jobs where owner_id=owner and enrollment_id=enrollment)>=200
   or (select count(*) from public.edu_campus_office_jobs where owner_id=owner and created_at>now()-interval '1 minute')>=10 then$from$,$to$if exists(select from public.edu_campus_office_jobs where owner_id=owner and created_at>now()-interval '1 minute' offset 9 limit 1) then$to$),
('private.campus_office_mutate_before_dispatch(jsonb)',$from$if (select count(*) from public.edu_campus_office_jobs where owner_id=actor and enrollment_id=enrollment and status<>'archived')>=50 or (select count(*) from public.edu_campus_office_jobs where owner_id=actor and created_at>now()-interval '1 minute')>=10 then$from$,$to$if exists(select from public.edu_campus_office_jobs where owner_id=actor and created_at>now()-interval '1 minute' offset 9 limit 1) then$to$)) as patches(signature,old_clause,new_clause) loop
  definition:=pg_get_functiondef(target.signature::regprocedure);
  if strpos(definition,target.old_clause)=0 then raise exception 'Review changed routine: %',target.signature; end if;
  execute replace(definition,target.old_clause,target.new_clause);
 end loop;
end; $migration$;
create function public.edu_campus_office_access(p_enrollment uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select private.campus_office_scope(p_enrollment,(select auth.uid()));
$$;
revoke all on function public.edu_campus_office_access(uuid) from public,anon,authenticated;
grant execute on function public.edu_campus_office_access(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
