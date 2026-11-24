begin;

do $$
declare
  rel_kind "char";
begin
  select c.relkind
    into rel_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'publish_customers'
   limit 1;

  -- If publish_customers already exists as a table, keep it as-is.
  if rel_kind = 'r' then
    return;
  end if;

  -- If it's a view/materialized view or absent, (re)create a compatibility view.
  if rel_kind is not null then
    execute 'drop view if exists public.publish_customers';
  end if;

  execute $view$
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
    from public.publish_categories
  $view$;

  comment on view public.publish_customers is
    'Compatibility view backed by publish_categories.category_key.';
end;
$$;

commit;
