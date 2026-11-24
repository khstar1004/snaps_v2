begin;

alter table public.studio_media_assets
  add column if not exists manual_tags jsonb not null default '[]'::jsonb,
  add column if not exists auto_tags jsonb not null default '[]'::jsonb,
  add column if not exists manual_emotion_tags jsonb not null default '[]'::jsonb,
  add column if not exists auto_emotion_tags jsonb not null default '[]'::jsonb,
  add column if not exists manual_query_hints jsonb not null default '[]'::jsonb,
  add column if not exists auto_query_hints jsonb not null default '[]'::jsonb,
  add column if not exists auto_source_metadata jsonb not null default '{}'::jsonb;

update public.studio_media_assets
set
  manual_tags =
    case
      when jsonb_typeof(manual_tags) = 'array' and jsonb_array_length(manual_tags) > 0 then manual_tags
      else coalesce(tags, '[]'::jsonb)
    end,
  manual_emotion_tags =
    case
      when jsonb_typeof(manual_emotion_tags) = 'array' and jsonb_array_length(manual_emotion_tags) > 0 then manual_emotion_tags
      else coalesce(emotion_tags, '[]'::jsonb)
    end,
  manual_query_hints =
    case
      when jsonb_typeof(manual_query_hints) = 'array' and jsonb_array_length(manual_query_hints) > 0 then manual_query_hints
      else coalesce(query_hints, '[]'::jsonb)
    end,
  auto_tags =
    case
      when jsonb_typeof(auto_tags) = 'array' then auto_tags
      else '[]'::jsonb
    end,
  auto_emotion_tags =
    case
      when jsonb_typeof(auto_emotion_tags) = 'array' then auto_emotion_tags
      else '[]'::jsonb
    end,
  auto_query_hints =
    case
      when jsonb_typeof(auto_query_hints) = 'array' then auto_query_hints
      else '[]'::jsonb
    end,
  auto_source_metadata =
    case
      when jsonb_typeof(auto_source_metadata) = 'object' then auto_source_metadata
      else '{}'::jsonb
    end;

commit;
