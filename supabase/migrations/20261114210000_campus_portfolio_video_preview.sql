-- Work feedback takes a short video preview next to pictures. The browser shrinks the original first, so the
-- 10 MB limit stays. A video is kept for 30 days from upload; `removed_at` marks a file whose stored object was swept.
begin;
alter table public.edu_campus_portfolio_files drop constraint edu_campus_portfolio_files_content_type_check;
alter table public.edu_campus_portfolio_files add constraint edu_campus_portfolio_files_content_type_check check(content_type in ('image/png','image/jpeg','image/webp','application/pdf','video/mp4','video/webm'));
alter table public.edu_campus_portfolio_files add column removed_at timestamptz;
do $migration$
declare definition text; old_clause text:=$from$mime not in ('image/png','image/jpeg','image/webp','application/pdf')$from$;
begin
 definition:=pg_get_functiondef('private.campus_portfolio_file_prepare(jsonb)'::regprocedure);
 if strpos(definition,old_clause)=0 then raise exception 'Review changed routine: private.campus_portfolio_file_prepare(jsonb)'; end if;
 execute replace(definition,old_clause,$to$mime not in ('image/png','image/jpeg','image/webp','application/pdf','video/mp4','video/webm')$to$);
end; $migration$;
do $bucket$begin
 if to_regclass('storage.buckets') is not null then
  update storage.buckets set allowed_mime_types=array['image/png','image/jpeg','image/webp','application/pdf','video/mp4','video/webm'] where id='campus-portfolio-private';
 end if;
end$bucket$;
notify pgrst,'reload schema';
commit;
