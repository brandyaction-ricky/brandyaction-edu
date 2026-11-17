-- Short links: only the destination is required; the name and channel may be left empty.
-- Widens two check constraints; no row changes. Safe to run again.
-- Rollback (only while no row has an empty name or channel):
--   alter table public.edu_short_links drop constraint edu_short_links_label_check, add constraint edu_short_links_label_check check (char_length(btrim(label)) between 1 and 80);
--   alter table public.edu_short_links drop constraint edu_short_links_channel_check, add constraint edu_short_links_channel_check check (char_length(btrim(channel)) between 1 and 40);
alter table public.edu_short_links
  drop constraint if exists edu_short_links_label_check,
  add constraint edu_short_links_label_check check (char_length(label) <= 80);
alter table public.edu_short_links
  drop constraint if exists edu_short_links_channel_check,
  add constraint edu_short_links_channel_check check (char_length(channel) <= 40);
