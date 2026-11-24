create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key,
  email text not null,
  password_hash text not null default '',
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  login_id text not null,
  display_name text not null default '',
  role text not null default 'member',
  is_active boolean not null default true,
  constraint app_users_role_check check (role = any (array['admin'::text, 'member'::text, 'system'::text]))
);

create unique index if not exists app_users_email_lower_key on public.app_users ((lower(email)));
create unique index if not exists app_users_login_id_key on public.app_users (login_id);

create table if not exists public.youtube_accounts (
  user_id uuid not null references public.app_users(id) on delete cascade,
  platform text not null default 'youtube',
  channel_id text not null,
  channel_title text not null,
  access_token text not null,
  refresh_token text not null,
  expiry_date_ms bigint not null,
  scope text not null default '',
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  primary key (user_id, channel_id),
  constraint youtube_accounts_platform_check check (platform = 'youtube')
);

create table if not exists public.publish_customers (
  user_id uuid not null references public.app_users(id) on delete cascade,
  customer_key text not null,
  is_default boolean not null default false,
  channel_id text,
  description text not null default '',
  tags jsonb not null default '[]'::jsonb,
  tts_voice_id text not null default '',
  bgm_enabled boolean,
  bgm_track_id text not null default '',
  mix_preset_id text not null default '',
  bgm_volume double precision,
  playback_rate double precision,
  sfx_enabled boolean,
  sfx_master_gain_db double precision,
  header_title text not null default '',
  header_accent_text text not null default '',
  header_color text not null default '',
  footer_color text not null default '',
  info_line_text text not null default '',
  font_family text not null default '',
  image_rounded boolean not null default true,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  deleted_at_ms bigint,
  deleted_by text,
  delete_reason text,
  primary key (user_id, customer_key)
);

alter table public.publish_customers
  add column if not exists bgm_volume double precision,
  add column if not exists playback_rate double precision;

drop view if exists public.publish_categories;
create view public.publish_categories as
select
  user_id,
  customer_key as category_key,
  is_default,
  channel_id,
  description,
  tags,
  tts_voice_id,
  bgm_enabled,
  bgm_track_id,
  mix_preset_id,
  bgm_volume,
  playback_rate,
  sfx_enabled,
  sfx_master_gain_db,
  header_title,
  header_accent_text,
  header_color,
  footer_color,
  info_line_text,
  font_family,
  image_rounded,
  created_at_ms,
  updated_at_ms,
  deleted_at_ms,
  deleted_by,
  delete_reason
from public.publish_customers;

create table if not exists public.publish_jobs (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  platform text not null default 'youtube',
  channel_id text not null,
  publish_category text,
  video_url text not null,
  title text not null,
  description text not null,
  tags jsonb not null default '[]'::jsonb,
  visibility text not null,
  scheduled_at_ms bigint,
  status text not null,
  attempts integer not null default 0,
  last_error text,
  platform_post_id text,
  published_url text,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  deleted_at_ms bigint,
  deleted_by text,
  delete_reason text,
  constraint publish_jobs_platform_check check (platform = 'youtube'),
  constraint publish_jobs_status_check check (status = any (array['pending'::text, 'processing'::text, 'published'::text, 'failed'::text, 'canceled'::text])),
  constraint publish_jobs_visibility_check check (visibility = any (array['private'::text, 'public'::text, 'unlisted'::text]))
);

create table if not exists public.video_assets (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null,
  url text not null,
  publish_category text,
  size_bytes bigint not null,
  mime_type text not null,
  storage_bucket text,
  storage_path text,
  created_at_ms bigint not null,
  deleted_at_ms bigint,
  deleted_by text,
  delete_reason text
);

create table if not exists public.video_asset_snapshots (
  asset_id text primary key references public.video_assets(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  snapshot jsonb not null,
  updated_at_ms bigint not null
);

create table if not exists public.workflow_telemetry_events (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  page text not null,
  stage text,
  status text,
  detail text,
  error_code text,
  retryable boolean,
  route text,
  session_id text,
  ts_ms bigint not null
);

create table if not exists public.app_cache_entries (
  scope text not null,
  user_scope text not null,
  cache_key text not null,
  value_text text,
  value_json jsonb,
  expires_at_ms bigint,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  primary key (scope, user_scope, cache_key)
);

create table if not exists public.billing_wallets (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  plan text not null,
  balance_m_credit bigint not null default 0,
  monthly_used_m_credit bigint not null default 0,
  updated_at_ms bigint not null,
  constraint billing_wallets_plan_check check (plan = any (array['trial'::text, 'starter'::text, 'growth'::text, 'pro'::text]))
);

create table if not exists public.billing_ledger_entries (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  operation_id text not null,
  entry_type text not null,
  provider text not null,
  m_credit bigint not null,
  detail text,
  created_at_ms bigint not null,
  constraint billing_ledger_entries_entry_type_check check (entry_type = any (array['commit'::text, 'refund'::text])),
  constraint billing_ledger_entries_provider_check check (provider = any (array['grok'::text, 'gemini_image'::text, 'render_compute'::text, 'mixed'::text]))
);

create table if not exists public.studio_media_assets (
  user_id uuid not null references public.app_users(id) on delete cascade,
  id text not null,
  provider text not null,
  provider_asset_id text,
  is_favorite boolean not null default false,
  title text,
  source_url text not null,
  source_media_url text,
  source_page_url text,
  storage_url text,
  storage_media_url text,
  media_kind text not null default 'image',
  width integer,
  height integer,
  query_hints jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  emotion_tags jsonb not null default '[]'::jsonb,
  manual_tags jsonb not null default '[]'::jsonb,
  auto_tags jsonb not null default '[]'::jsonb,
  manual_emotion_tags jsonb not null default '[]'::jsonb,
  auto_emotion_tags jsonb not null default '[]'::jsonb,
  manual_query_hints jsonb not null default '[]'::jsonb,
  auto_query_hints jsonb not null default '[]'::jsonb,
  auto_source_metadata jsonb not null default '{}'::jsonb,
  summary text,
  vlm_status text,
  inserted_at_ms bigint not null,
  updated_at_ms bigint not null,
  primary key (user_id, id)
);

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

create table if not exists public.app_user_category_permissions (
  user_id uuid not null references public.app_users(id) on delete cascade,
  category_key text not null,
  access_level text not null default 'manage',
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  primary key (user_id, category_key)
);

create table if not exists public.app_user_category_access_policies (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  access_mode text not null default 'all',
  all_access_level text not null default 'manage',
  updated_at_ms bigint not null
);

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

create index if not exists youtube_accounts_user_updated_idx on public.youtube_accounts (user_id, updated_at_ms desc);
create index if not exists publish_customers_user_created_idx on public.publish_customers (user_id, created_at_ms desc);
create index if not exists publish_customers_order_idx on public.publish_customers (user_id, is_default desc, created_at_ms);
create index if not exists publish_customers_user_deleted_at_idx on public.publish_customers (user_id, deleted_at_ms desc, updated_at_ms desc);
create index if not exists publish_jobs_user_created_idx on public.publish_jobs (user_id, created_at_ms desc);
create index if not exists publish_jobs_user_updated_idx on public.publish_jobs (user_id, updated_at_ms desc);
create index if not exists publish_jobs_user_status_idx on public.publish_jobs (user_id, status, updated_at_ms desc);
create index if not exists publish_jobs_user_video_idx on public.publish_jobs (user_id, video_url);
create index if not exists publish_jobs_user_deleted_at_idx on public.publish_jobs (user_id, deleted_at_ms desc, updated_at_ms desc);
create index if not exists video_assets_user_created_idx on public.video_assets (user_id, created_at_ms desc);
create index if not exists video_assets_user_category_idx on public.video_assets (user_id, publish_category);
create index if not exists video_assets_user_deleted_at_idx on public.video_assets (user_id, deleted_at_ms desc, created_at_ms desc);
create index if not exists video_asset_snapshots_user_idx on public.video_asset_snapshots (user_id, updated_at_ms desc);
create index if not exists workflow_telemetry_events_user_ts_idx on public.workflow_telemetry_events (user_id, ts_ms desc);
create index if not exists app_cache_entries_scope_expiry_idx on public.app_cache_entries (scope, user_scope, expires_at_ms);
create index if not exists app_cache_entries_scope_user_updated_idx on public.app_cache_entries (scope, user_scope, updated_at_ms desc);
create unique index if not exists billing_ledger_entries_dedupe_idx on public.billing_ledger_entries (user_id, entry_type, operation_id);
create index if not exists studio_media_assets_user_provider_updated_idx on public.studio_media_assets (user_id, provider, updated_at_ms desc);
create index if not exists studio_media_assets_user_updated_idx on public.studio_media_assets (user_id, updated_at_ms desc);
create index if not exists studio_media_assets_user_favorite_updated_idx on public.studio_media_assets (user_id, is_favorite desc, updated_at_ms desc);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at_ms desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at_ms desc);
create index if not exists audit_logs_workspace_created_idx on public.audit_logs (workspace_user_id, created_at_ms desc);
create index if not exists audit_logs_action_created_idx on public.audit_logs (action, created_at_ms desc);
create index if not exists app_user_category_permissions_user_idx on public.app_user_category_permissions (user_id, updated_at_ms desc);
create index if not exists app_user_category_access_policies_updated_idx on public.app_user_category_access_policies (updated_at_ms desc);
create index if not exists publish_category_versions_lookup_idx on public.publish_category_versions (user_id, category_key, section, template_id, created_at_ms desc);

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
