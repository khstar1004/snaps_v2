begin;

create or replace view public.publish_customers as
select
  user_id,
  category_key as customer_key,
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
from public.publish_categories;

comment on view public.publish_customers is 'Customer-oriented alias view backed by publish_categories.category_key.';

commit;
