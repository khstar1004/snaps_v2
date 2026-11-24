begin;

create table if not exists public.app_users (
  id uuid primary key,
  email text not null,
  password_hash text not null default '',
  created_at_ms bigint not null,
  updated_at_ms bigint not null
);

create unique index if not exists app_users_email_lower_key on public.app_users ((lower(email)));

create table if not exists public.youtube_accounts (
  user_id uuid not null references public.app_users(id) on delete cascade,
  platform text not null default 'youtube',
  channel_id text not null,
  channel_title text not null,
  access_token text not null,
  refresh_token text not null,
  expiry_date_ms bigint not null,
  scope text not null,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  primary key (user_id, channel_id)
);

create table if not exists public.publish_categories (
  user_id uuid not null references public.app_users(id) on delete cascade,
  category_key text not null,
  is_default boolean not null default false,
  channel_id text,
  description text not null default '',
  tags jsonb not null default '[]'::jsonb,
  tts_voice_id text not null default '',
  bgm_enabled boolean,
  bgm_track_id text not null default '',
  mix_preset_id text not null default '',
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
  primary key (user_id, category_key)
);

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
  updated_at_ms bigint not null
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
  created_at_ms bigint not null
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
  updated_at_ms bigint not null
);

create table if not exists public.billing_ledger_entries (
  id text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  operation_id text not null,
  entry_type text not null,
  provider text not null,
  m_credit bigint not null,
  detail text,
  created_at_ms bigint not null
);

create index if not exists youtube_accounts_user_updated_idx on public.youtube_accounts (user_id, updated_at_ms desc);
create index if not exists publish_categories_user_created_idx on public.publish_categories (user_id, created_at_ms desc);
create index if not exists publish_jobs_user_created_idx on public.publish_jobs (user_id, created_at_ms desc);
create index if not exists publish_jobs_user_updated_idx on public.publish_jobs (user_id, updated_at_ms desc);
create index if not exists publish_jobs_user_status_idx on public.publish_jobs (user_id, status, updated_at_ms desc);
create index if not exists video_assets_user_created_idx on public.video_assets (user_id, created_at_ms desc);
create index if not exists workflow_telemetry_events_user_ts_idx on public.workflow_telemetry_events (user_id, ts_ms desc);
create index if not exists app_cache_entries_scope_expiry_idx on public.app_cache_entries (scope, user_scope, expires_at_ms);
create index if not exists billing_ledger_entries_user_created_idx on public.billing_ledger_entries (user_id, created_at_ms desc);

insert into storage.buckets (id, name, public)
values ('video-assets', 'video-assets', true)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

commit;
