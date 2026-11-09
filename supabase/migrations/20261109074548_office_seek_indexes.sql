begin;
-- A constant archive predicate lets Postgres seek in order without a second sort.
create index office_all_active_seek on public.edu_campus_office_jobs(owner_id,enrollment_id,created_at desc,id desc) where status<>'archived';
create index office_employee_active_seek on public.edu_campus_office_jobs(owner_id,enrollment_id,employee_id,created_at desc,id desc) where status<>'archived';
create index office_all_archived_seek on public.edu_campus_office_jobs(owner_id,enrollment_id,created_at desc,id desc) where status='archived';
create index office_employee_archived_seek on public.edu_campus_office_jobs(owner_id,enrollment_id,employee_id,created_at desc,id desc) where status='archived';
create or replace function public.edu_campus_office_page(p_enrollment uuid,p_employee text,p_archived boolean,p_before timestamptz,p_id uuid)
 returns table(id uuid, employee_id text,objective text,output_type text,status text,revision integer,created_at timestamptz)
 language plpgsql stable security invoker set search_path='' as $$
begin
 return query execute 'select j.id,j.employee_id,left(j.objective,160),j.output_type,j.status,j.revision,j.created_at
 from public.edu_campus_office_jobs j where j.owner_id=$1 and j.enrollment_id=$2'
 || case when p_archived then ' and j.status=''archived''' else ' and j.status<>''archived''' end
 || case when p_employee is null then '' else ' and j.employee_id=$4' end
 || case when p_before is null then '' else ' and (j.created_at,j.id)<($5,$6)' end
 || ' order by j.created_at desc,j.id desc limit 21' using (select auth.uid()),p_enrollment,p_archived,p_employee,p_before,p_id;
end; $$;
drop index public.office_jobs_page, public.office_employee_jobs_page;
commit;
