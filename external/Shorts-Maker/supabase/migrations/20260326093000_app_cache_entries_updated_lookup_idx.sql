begin;

create index if not exists app_cache_entries_scope_user_updated_idx
  on public.app_cache_entries (scope, user_scope, updated_at_ms desc);

commit;
