alter table public.studio_media_assets
  add column if not exists is_favorite boolean not null default false;

create index if not exists studio_media_assets_user_favorite_updated_idx
  on public.studio_media_assets using btree (user_id, is_favorite desc, updated_at_ms desc);
