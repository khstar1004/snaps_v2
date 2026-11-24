begin;

create table if not exists public.publish_category_versions (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  category_key text not null,
  section text not null,
  template_id text,
  payload_json jsonb not null,
  created_by text,
  created_at_ms bigint not null
);

create index if not exists publish_category_versions_lookup_idx
  on public.publish_category_versions (user_id, category_key, section, template_id, created_at_ms desc);

alter table public.publish_category_versions enable row level security;

commit;
