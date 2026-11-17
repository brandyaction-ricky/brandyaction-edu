begin;
-- Owners may delete an employee they registered by mistake. The existing own-row policy already limits the rows,
-- and campus_retire_employee_link ends that employee's report connection on delete. Job records stay.
grant delete on public.edu_campus_office_employees to authenticated;
commit;
