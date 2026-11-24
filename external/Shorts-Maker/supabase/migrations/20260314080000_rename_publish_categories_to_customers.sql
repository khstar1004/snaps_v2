begin;

drop view if exists public.publish_customers;

alter table if exists public.publish_categories
  rename to publish_customers;

alter table if exists public.publish_customers
  rename column category_key to customer_key;

alter index if exists public.publish_categories_user_created_idx
  rename to publish_customers_user_created_idx;

alter index if exists public.publish_categories_order_idx
  rename to publish_customers_order_idx;

alter index if exists public.publish_categories_user_deleted_at_idx
  rename to publish_customers_user_deleted_at_idx;

create or replace view public.publish_categories as
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

comment on table public.publish_customers is 'Primary customer table. customer_key stores the customer identifier shown in the studio.';
comment on view public.publish_categories is 'Backward-compatibility view backed by publish_customers.customer_key.';

commit;
