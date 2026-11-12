begin;
-- Ten desks and no built-in character: a personal office holds 0-10 seated employees.
-- Older documents (fixed placeholder + up to seven employees) still fit.
alter table public.edu_campus_personal_offices
  drop constraint edu_campus_personal_offices_document_check,
  add constraint edu_campus_personal_offices_document_check check (
    octet_length(document::text) <= 18000
    and document->>'schemaVersion' = '1'
    and jsonb_typeof(document->'profiles') = 'array'
    and jsonb_array_length(document->'profiles') <= 10
  );
commit;
