-- Additive cosmetics only. Apply before the matching app; existing RLS and grants remain unchanged.
-- NULL legacy model retains the renderer gender-based choice. No private field enters presence.
alter table public.edu_campus_space_profiles
 add column avatar_model smallint check(avatar_model between 0 and 5),
 add column hair_color text not null default '#302825' check(hair_color ~ '^#[0-9a-fA-F]{6}$'),
 add column skin_color text not null default '#e8b68b' check(skin_color ~ '^#[0-9a-fA-F]{6}$'),
 add column pants_color text not null default '#36485d' check(pants_color ~ '^#[0-9a-fA-F]{6}$'),
 add column held_item text not null default 'none' check(held_item in ('none','coffee','book'));
alter table public.edu_campus_space_presence
 add column avatar_model smallint check(avatar_model between 0 and 5),
 add column hair_color text not null default '#302825' check(hair_color ~ '^#[0-9a-fA-F]{6}$'),
 add column skin_color text not null default '#e8b68b' check(skin_color ~ '^#[0-9a-fA-F]{6}$'),
 add column pants_color text not null default '#36485d' check(pants_color ~ '^#[0-9a-fA-F]{6}$'),
 add column held_item text not null default 'none' check(held_item in ('none','coffee','book'));
