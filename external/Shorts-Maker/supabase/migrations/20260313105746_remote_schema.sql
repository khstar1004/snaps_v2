drop extension if exists "pg_net";


  create table "public"."studio_media_assets" (
    "user_id" uuid not null,
    "id" text not null,
    "provider" text not null,
    "provider_asset_id" text,
    "title" text,
    "source_url" text not null,
    "source_media_url" text,
    "source_page_url" text,
    "storage_url" text,
    "storage_media_url" text,
    "media_kind" text not null default 'image'::text,
    "width" integer,
    "height" integer,
    "query_hints" jsonb not null default '[]'::jsonb,
    "tags" jsonb not null default '[]'::jsonb,
    "emotion_tags" jsonb not null default '[]'::jsonb,
    "summary" text,
    "vlm_status" text,
    "inserted_at_ms" bigint not null,
    "updated_at_ms" bigint not null
      );


alter table "public"."studio_media_assets" enable row level security;

alter table "public"."app_cache_entries" enable row level security;

alter table "public"."app_users" enable row level security;

alter table "public"."billing_ledger_entries" enable row level security;

alter table "public"."billing_wallets" alter column "balance_m_credit" drop default;

alter table "public"."billing_wallets" alter column "monthly_used_m_credit" drop default;

alter table "public"."billing_wallets" enable row level security;

alter table "public"."publish_categories" enable row level security;

alter table "public"."publish_jobs" enable row level security;

alter table "public"."video_asset_snapshots" enable row level security;

alter table "public"."video_assets" enable row level security;

alter table "public"."workflow_telemetry_events" enable row level security;

alter table "public"."youtube_accounts" alter column "scope" set default ''::text;

alter table "public"."youtube_accounts" enable row level security;

CREATE INDEX app_cache_entries_expiry_idx ON public.app_cache_entries USING btree (scope, user_scope, expires_at_ms);

CREATE UNIQUE INDEX app_users_email_key ON public.app_users USING btree (email);

CREATE UNIQUE INDEX billing_ledger_entries_dedupe_idx ON public.billing_ledger_entries USING btree (user_id, entry_type, operation_id);

CREATE INDEX publish_categories_order_idx ON public.publish_categories USING btree (user_id, is_default DESC, created_at_ms);

CREATE INDEX publish_jobs_user_video_idx ON public.publish_jobs USING btree (user_id, video_url);

CREATE UNIQUE INDEX studio_media_assets_pkey ON public.studio_media_assets USING btree (user_id, id);

CREATE INDEX studio_media_assets_user_provider_updated_idx ON public.studio_media_assets USING btree (user_id, provider, updated_at_ms DESC);

CREATE INDEX studio_media_assets_user_updated_idx ON public.studio_media_assets USING btree (user_id, updated_at_ms DESC);

CREATE INDEX video_asset_snapshots_user_idx ON public.video_asset_snapshots USING btree (user_id, updated_at_ms DESC);

CREATE INDEX video_assets_user_category_idx ON public.video_assets USING btree (user_id, publish_category);

CREATE INDEX youtube_accounts_updated_idx ON public.youtube_accounts USING btree (user_id, updated_at_ms DESC);

alter table "public"."studio_media_assets" add constraint "studio_media_assets_pkey" PRIMARY KEY using index "studio_media_assets_pkey";

alter table "public"."app_users" add constraint "app_users_email_key" UNIQUE using index "app_users_email_key";

alter table "public"."billing_ledger_entries" add constraint "billing_ledger_entries_entry_type_check" CHECK ((entry_type = ANY (ARRAY['commit'::text, 'refund'::text]))) not valid;

alter table "public"."billing_ledger_entries" validate constraint "billing_ledger_entries_entry_type_check";

alter table "public"."billing_ledger_entries" add constraint "billing_ledger_entries_provider_check" CHECK ((provider = ANY (ARRAY['grok'::text, 'gemini_image'::text, 'render_compute'::text, 'mixed'::text]))) not valid;

alter table "public"."billing_ledger_entries" validate constraint "billing_ledger_entries_provider_check";

alter table "public"."billing_wallets" add constraint "billing_wallets_plan_check" CHECK ((plan = ANY (ARRAY['trial'::text, 'starter'::text, 'growth'::text, 'pro'::text]))) not valid;

alter table "public"."billing_wallets" validate constraint "billing_wallets_plan_check";

alter table "public"."publish_jobs" add constraint "publish_jobs_platform_check" CHECK ((platform = 'youtube'::text)) not valid;

alter table "public"."publish_jobs" validate constraint "publish_jobs_platform_check";

alter table "public"."publish_jobs" add constraint "publish_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'published'::text, 'failed'::text, 'canceled'::text]))) not valid;

alter table "public"."publish_jobs" validate constraint "publish_jobs_status_check";

alter table "public"."publish_jobs" add constraint "publish_jobs_visibility_check" CHECK ((visibility = ANY (ARRAY['private'::text, 'public'::text, 'unlisted'::text]))) not valid;

alter table "public"."publish_jobs" validate constraint "publish_jobs_visibility_check";

alter table "public"."studio_media_assets" add constraint "studio_media_assets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE not valid;

alter table "public"."studio_media_assets" validate constraint "studio_media_assets_user_id_fkey";

alter table "public"."youtube_accounts" add constraint "youtube_accounts_platform_check" CHECK ((platform = 'youtube'::text)) not valid;

alter table "public"."youtube_accounts" validate constraint "youtube_accounts_platform_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

grant delete on table "public"."studio_media_assets" to "anon";

grant insert on table "public"."studio_media_assets" to "anon";

grant references on table "public"."studio_media_assets" to "anon";

grant select on table "public"."studio_media_assets" to "anon";

grant trigger on table "public"."studio_media_assets" to "anon";

grant truncate on table "public"."studio_media_assets" to "anon";

grant update on table "public"."studio_media_assets" to "anon";

grant delete on table "public"."studio_media_assets" to "authenticated";

grant insert on table "public"."studio_media_assets" to "authenticated";

grant references on table "public"."studio_media_assets" to "authenticated";

grant select on table "public"."studio_media_assets" to "authenticated";

grant trigger on table "public"."studio_media_assets" to "authenticated";

grant truncate on table "public"."studio_media_assets" to "authenticated";

grant update on table "public"."studio_media_assets" to "authenticated";

grant delete on table "public"."studio_media_assets" to "service_role";

grant insert on table "public"."studio_media_assets" to "service_role";

grant references on table "public"."studio_media_assets" to "service_role";

grant select on table "public"."studio_media_assets" to "service_role";

grant trigger on table "public"."studio_media_assets" to "service_role";

grant truncate on table "public"."studio_media_assets" to "service_role";

grant update on table "public"."studio_media_assets" to "service_role";


