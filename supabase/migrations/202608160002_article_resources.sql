begin;

alter table public.articles add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('article-resources','article-resources',true,20971520,array[
  'application/pdf','application/zip','application/x-zip-compressed','text/plain','text/csv',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
]) on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists admins_upload_article_resources on storage.objects;
create policy admins_upload_article_resources on storage.objects for insert to authenticated
with check(bucket_id='article-resources' and (select public.is_admin()));
drop policy if exists admins_update_article_resources on storage.objects;
create policy admins_update_article_resources on storage.objects for update to authenticated
using(bucket_id='article-resources' and (select public.is_admin())) with check(bucket_id='article-resources' and (select public.is_admin()));
drop policy if exists admins_delete_article_resources on storage.objects;
create policy admins_delete_article_resources on storage.objects for delete to authenticated
using(bucket_id='article-resources' and (select public.is_admin()));

commit;
