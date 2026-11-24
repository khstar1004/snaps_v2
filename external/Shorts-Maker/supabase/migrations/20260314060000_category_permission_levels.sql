begin;

alter table public.app_user_category_permissions
  add column if not exists access_level text not null default 'manage';

create table if not exists public.app_user_category_access_policies (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  access_mode text not null default 'all',
  all_access_level text not null default 'manage',
  updated_at_ms bigint not null
);

create index if not exists app_user_category_access_policies_updated_idx
  on public.app_user_category_access_policies (updated_at_ms desc);

alter table public.app_user_category_access_policies enable row level security;

commit;
