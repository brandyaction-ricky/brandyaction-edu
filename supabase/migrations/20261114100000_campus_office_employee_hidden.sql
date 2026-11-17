-- An owner may mark an employee hidden on their own directory row, so a hidden employee is told apart from one
-- never seated and returns to the seat it left. The own-row policy limits the rows and the row check keeps the
-- id, name and bot address valid; seating the employee again rewrites the row from the office document.
begin;
grant update(profile) on public.edu_campus_office_employees to authenticated;
commit;
