begin;

alter table public.app_users
  add column if not exists login_id text,
  add column if not exists display_name text not null default '',
  add column if not exists role text not null default 'member',
  add column if not exists is_active boolean not null default true;

update public.app_users
set
  login_id = coalesce(nullif(trim(login_id), ''), lower(email)),
  display_name = case
    when nullif(trim(display_name), '') is not null then trim(display_name)
    when nullif(trim(login_id), '') is not null then trim(login_id)
    else lower(email)
  end,
  role = case
    when role in ('admin', 'member', 'system') then role
    else 'member'
  end,
  is_active = coalesce(is_active, true)
where
  login_id is null
  or nullif(trim(login_id), '') is null
  or nullif(trim(display_name), '') is null
  or role not in ('admin', 'member', 'system')
  or is_active is null;

alter table public.app_users
  alter column login_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_role_check'
  ) then
    alter table public.app_users
      add constraint app_users_role_check check (role = any (array['admin'::text, 'member'::text, 'system'::text]));
  end if;
end $$;

create unique index if not exists app_users_login_id_key on public.app_users (login_id);

insert into public.app_users (
  id,
  login_id,
  email,
  display_name,
  role,
  is_active,
  password_hash,
  created_at_ms,
  updated_at_ms
)
values (
  '00000000-0000-0000-0000-000000000001',
  '_shared_library',
  'shared-library@system.local',
  '공유 라이브러리',
  'system',
  false,
  '',
  extract(epoch from now())::bigint * 1000,
  extract(epoch from now())::bigint * 1000
)
on conflict (id) do update
set
  login_id = excluded.login_id,
  email = excluded.email,
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at_ms = excluded.updated_at_ms;

update public.studio_media_assets
set user_id = '00000000-0000-0000-0000-000000000001'
where user_id <> '00000000-0000-0000-0000-000000000001';

update public.app_cache_entries
set user_scope = '_shared_library'
where scope = 'studio_media_asset_folder';

commit;
