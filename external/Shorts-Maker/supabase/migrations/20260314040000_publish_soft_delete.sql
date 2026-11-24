begin;

alter table public.publish_categories
  add column if not exists deleted_at_ms bigint,
  add column if not exists deleted_by text,
  add column if not exists delete_reason text;

create index if not exists publish_categories_user_deleted_at_idx
  on public.publish_categories (user_id, deleted_at_ms desc, updated_at_ms desc);

alter table public.publish_jobs
  add column if not exists deleted_at_ms bigint,
  add column if not exists deleted_by text,
  add column if not exists delete_reason text;

create index if not exists publish_jobs_user_deleted_at_idx
  on public.publish_jobs (user_id, deleted_at_ms desc, updated_at_ms desc);

alter table public.video_assets
  add column if not exists deleted_at_ms bigint,
  add column if not exists deleted_by text,
  add column if not exists delete_reason text;

create index if not exists video_assets_user_deleted_at_idx
  on public.video_assets (user_id, deleted_at_ms desc, created_at_ms desc);

commit;
