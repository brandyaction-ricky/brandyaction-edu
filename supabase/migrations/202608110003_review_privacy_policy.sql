begin;

alter table public.reviews
  add column if not exists author_nickname text;

alter table public.reviews
  drop constraint if exists reviews_author_nickname_length;

alter table public.reviews
  add constraint reviews_author_nickname_length
  check (author_nickname is null or char_length(btrim(author_nickname)) between 2 and 20);

commit;
