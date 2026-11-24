begin;

create table if not exists public.app_user_category_permissions (
  user_id uuid not null references public.app_users(id) on delete cascade,
  category_key text not null,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  primary key (user_id, category_key)
);

create index if not exists app_user_category_permissions_user_idx
  on public.app_user_category_permissions (user_id, updated_at_ms desc);

alter table public.app_user_category_permissions enable row level security;

commit;
