# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-package shorts-video production workspace: Next.js 16 App Router + React 19 + TypeScript + Remotion 4, `"type": "module"`. UI strings, user-facing errors, LLM prompts, and most docs are Korean; identifiers and AGENTS.md are English.

`AGENTS.md` at the repo root contains verified commands and a change-surface → verification matrix; it applies to this repo and stays accurate. `docs/CODEX_GUIDE.md` has per-domain "read these files first" routing. `docs/developer-map.json` is the generated route/domain/hotspot inventory; `docs/environment-map.json` maps every env var to its using files.

## Commands

```bash
npm run dev          # dev server on port 4100 (login at http://localhost:4100/login)
npm run lint         # tsc --noEmit (this is the only "lint")
npm test             # Node test runner over co-located *.test.ts(x) in app/ and lib/
npm run build        # production build
npm run docs:refresh # regenerate docs/developer-map.json + environment-map.json
npm run docs:check   # fail if generated docs drifted from git (first step of CI)
npm run render:smoke # native renderer smoke test
npm run test:codex-local  # local Codex CLI bridge paths
```

Single test file (no Jest/Vitest — plain `node:test` + `node:assert`):

```bash
node --experimental-strip-types --test --loader ./scripts/ts-paths-loader.mjs ./lib/studio/codex-script-to-json.test.ts
```

CI sequence (Node 22): `docs:check` → `lint` → `test` → `build`.

**Generated-docs gate:** whenever you add/remove/rename a route, entry file, or any `process.env.X` reference, run `npm run docs:refresh` and commit the result — `docs:check` diffs the two JSON maps against git and CI fails on drift. Never hand-edit those two files.

## Architecture

### Production pipeline (the core of the app)

Topic → script → slide JSON → prepare (media) → render (audio+video) → publish:

1. **Topic → script**: `app/api/studio/topic-to-script/route.ts` → `lib/studio/codex-script-core.ts` (`generateScriptFromTopic`). Prompt templates in `lib/studio/prompt-templates.ts`.
2. **Script → JSON**: `app/api/studio/script-to-json/route.ts` → `codex-script-core.ts` (`convertScriptToStudioJson`) → `lib/studio/codex-script-to-json.ts`. The model returns `lineTokenRanges` (index pairs into pre-tokenized script text), not free text — slide text is reconstructed deterministically so it can't be hallucinated. Line-width budgets come from `lib/studio/caption-layout.ts`. Two modes throughout: `"normal"` and `"dialogue"` (multi-speaker).
3. **Prepare**: `app/api/studio/prepare/route.ts` (stages `full|plan|resolve`) — image query planning, provider resolution (`lib/studio/image-provider-resolver*.ts`: naver/pexels/pixabay/openverse/wikimedia/giphy/library), image policy, AI image generation.
4. **Render (audio/timeline)**: `app/api/studio/render/route.ts` — Typecast TTS (`lib/studio/tts-service.ts`), timeline alignment, `buildRenderPlanV2` (`lib/studio/render-plan.ts`). Narration audio is stashed in `lib/studio/narration-cache.ts` under a `narrationRef`, not passed through the video render request.
5. **Video render**: server-native only. `lib/studio/render-native-server.ts` renders via Remotion (`lib/studio/render-remotion-server.ts`, `remotion/StudioShortsComposition.tsx` — single `StudioShorts` composition, 1080×1920@30fps) then shells out to ffmpeg (`STUDIO_FFMPEG_PATH`/`FFMPEG_PATH`) to mix narration + BGM + SFX with ducking. Routes: `app/api/studio/render-native/route.ts` (direct) and `app/api/studio/render-jobs/route.ts` (async queue with fingerprint dedup, `lib/studio/render-jobs.ts`). The `@ffmpeg/ffmpeg` wasm client renderer (`lib/studio/render-shorts-video.ts`, `"client_wasm"`) is legacy and unused by the app.
6. **Publish**: `app/api/publish/schedule|run-now` → Upstash QStash enqueues `POST /api/publish/execute` (shared-secret header `PUBLISH_EXECUTE_SECRET`, loopback base URLs bypass QStash and call directly) → YouTube upload via `lib/publish/youtube.ts` (googleapis). "Category" (`publish_customers` table) is the customer/brand unit; permission checks via `lib/auth/category-permissions.ts` gate every studio/publish route.

The studio UI (`app/shorts-json-studio/`, ~90 files) is `page.tsx` as a shell over ~40 `use-studio-*.ts` hooks; `use-studio-workflow-actions.ts` holds the render/publish decision tree. `components/studio-remotion-preview.tsx` is the only `@remotion/player` consumer.

**Shared contracts live in `types/`** — `types/studio-json.ts` is the central slide/prepare/render schema; `types/studio-renderer.ts` for render jobs/engines.

### "Codex" = the LLM backend (OpenAI, or DeepSeek)

Two transports, selected by `lib/auth/codex-bridge.ts`: a local `@openai/codex` CLI bridge (`lib/auth/codex-local-cli.ts`, `codex exec` via stdin/temp files — preferred off-Vercel) or OAuth → OpenAI API (`lib/studio/codex-script-transport.ts`). Used for script generation, script→JSON, image/SFX planning, dialogue speaker planning, local AI image generation (`lib/studio/codex-local-image-generator.ts`), and publish analytics strategy. Changes to the local bridge require `npm run test:codex-local`.

**DeepSeek provider (snaps addition):** set `AI_PROVIDER=deepseek` and `DEEPSEEK_API_KEY=...` (optionally `DEEPSEEK_MODEL`, default `deepseek-chat`) to route every chat-completion call through DeepSeek's OpenAI-compatible endpoint instead — see `lib/studio/ai-provider.ts`. This forces the connection mode to the direct API path (`resolveCodexConnectionMode()` never returns `local_codex_bridge` when DeepSeek is configured, since there is no local DeepSeek CLI) and uses `DEEPSEEK_API_KEY` as the access token everywhere `resolveCodexAccessTokenFromRequest` would otherwise read the Codex OAuth cookie. Verified against the live DeepSeek API (`npm run smoke:deepseek`):
- topic-to-script and SFX planning work reliably through the real DeepSeek chat-completions call.
- script-to-json's `lineTokenRanges` task (mechanical per-token character-budget arithmetic) is not something `deepseek-chat` converges on within the retry budget — it keeps grouping too many tokens per line. `preferDeterministicScriptToJsonForDeepseek()` therefore short-circuits straight to the deterministic local converter (`codexScriptToJson.buildDeterministicScriptToJson`) for this one stage when DeepSeek is active, which still uses the real DeepSeek-generated script text and correctly enforces the caption width budget — it just skips the LLM's semantic slide-boundary picking. Set `DEEPSEEK_SCRIPT_TO_JSON_USE_API=1` to force the API path anyway.
- **Planner API transports (snaps addition):** upstream, `lib/studio/image-query-planner.ts`, `lib/studio/manual-image-scene-planner.ts` and `lib/studio/dialogue-speaker-planner.ts` had *only* a local-CLI transport (`planByCodexCli`), so without the Codex CLI the first two silently degraded to their heuristic/rule-based fallbacks and the third hard-failed with `DIALOGUE_SPEAKER_PLAN_CLI_UNAVAILABLE`. Each now also has a `planByCodexApi` sibling that goes through `requestCodexChatCompletion`, selected when the CLI bridge is unavailable but an access token is present (`useLocalCli ? planWithCli(...) : planWithApi(...)`). All three expose `planByCodexApi` in their `...TransportOverrides` type for tests. This is what makes image-query planning, scene-prompt planning, and dialogue speaker assignment actually LLM-driven under `AI_PROVIDER=deepseek`; verified against the live DeepSeek API via `npm run smoke:deepseek`.
- **Not portable to DeepSeek:** `lib/studio/codex-local-image-generator.ts` drives the Codex CLI as a file-writing agent (`runLocalCodexCliPromptDetailed` with `sandbox: "workspace-write"`, writing generated images into `cwd`). DeepSeek's chat-completions API has no image-generation endpoint and no agentic file-writing, so this stage has no API equivalent and stays CLI-only by design — AI image generation requires the local Codex CLI regardless of `AI_PROVIDER`.
- Set `CODEX_DEBUG_VALIDATION=1` to log each failed generation attempt (candidate text + validation issues) to stderr — useful when tuning prompts/retry budgets against a new model.

### Persistence

Supabase is the primary datastore, accessed through a hand-rolled PostgREST client (`lib/supabase/server.ts`, service-role key — **not** `@supabase/supabase-js`), with a transparent fallback to local Docker Postgres (`lib/local/postgres.ts`, set up via `npm run local:postgres:setup`). `lib/supabase/app-cache.ts` exposes a KV interface over the `app_cache_entries` table — render jobs and narration cache use it. Storage buckets (`video-assets`) have a local-filesystem fallback served by `app/api/local-storage/`. Upstash Redis is used only for the TTS segment cache.

Auth is hand-rolled: HMAC-signed session cookies (`lib/auth/session.ts`), users in `app_users`, admin bootstrap via `npm run auth:bootstrap-admin` (`--dry-run` first). Google OAuth is sign-in only; YouTube OAuth is a separate flow.

## Conventions

- **Route handler testability pattern**: API routes export a `...RouteDependencies` type, a `default...RouteDependencies` object, and a `handleXPost(request, deps)` function; tests inject fakes instead of module-mocking (see `app/api/studio/script-to-json/route.ts`). Follow this when adding routes.
- Tests are co-located (`foo.ts` + `foo.test.ts`) and only discovered under `app/` and `lib/` (plus `scripts/test-codex-local-paths.ts`). Tests touching Supabase/local Postgres/storage are opt-in via `SUPABASE_ENABLE_IN_TESTS` etc.
- API errors are uniform `{ ok: false, error, errorCode, retryable }` (`lib/studio/error-response.ts`, `lib/publish/api-error.ts`); pipeline errors use `CodexPipelineError` (`lib/studio/codex-script-core-errors.ts`).
- Path alias: only `@/*` → repo root. Outside the bundler (tests, scripts) it's resolved by `scripts/ts-paths-loader.mjs` — always pass that loader when running TS files with Node.
- Layer boundaries: pages/HTTP in `app`, domain/server logic in `lib`, cross-page UI in `components`, shared contracts in `types`. Files are kept small and single-purpose; large multi-concern files are tracked as `hotspots` in `docs/developer-map.json`.
- Fixed asset contract: `public/bgm/Tango de la Noche - Wayne Jones.mp3` — the runtime hardcodes that exact filename.
- Outbound fetches in render/proxy paths must go through `lib/network/request-guard.ts` (redirect validation + byte limits).
- Render-path changes (spanning `remotion/`, `lib/studio` render modules, `app/api/studio` handlers) need `npm run render:smoke` in addition to focused tests.
- Do not configure `LOCAL_AUTH_BYPASS_*` in production; production `APP_BASE_URL` must match the Codex/Google OAuth redirect hosts.
