begin;

do $$
declare
  customers_kind "char";
begin
  select c.relkind
    into customers_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'publish_customers'
   limit 1;

  if customers_kind = 'r' then
    alter table public.publish_customers
      add column if not exists bgm_volume double precision;

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

    comment on view public.publish_categories is 'Backward-compatibility view backed by publish_customers.customer_key.';
  else
    alter table public.publish_categories
      add column if not exists bgm_volume double precision;

    drop view if exists public.publish_customers;
    create view public.publish_customers as
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
      bgm_volume,
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

    comment on view public.publish_customers is
      'Compatibility view backed by publish_categories.category_key.';
  end if;
end;
$$;

commit;
