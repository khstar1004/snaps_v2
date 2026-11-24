begin;

create table if not exists public.audit_logs (
  id text primary key,
  actor_user_id uuid not null,
  actor_login_id text not null default '',
  actor_display_name text not null default '',
  workspace_user_id uuid,
  workspace_login_id text not null default '',
  workspace_display_name text not null default '',
  is_acting_as boolean not null default false,
  action text not null,
  resource_type text not null,
  resource_id text not null default '',
  resource_label text not null default '',
  route text not null default '',
  detail text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at_ms bigint not null
);

create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at_ms desc);

create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_user_id, created_at_ms desc);

create index if not exists audit_logs_workspace_created_idx
  on public.audit_logs (workspace_user_id, created_at_ms desc);

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at_ms desc);

alter table public.audit_logs enable row level security;

commit;
