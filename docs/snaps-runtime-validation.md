# snaps Runtime Validation

Run this after dependency installation, Prisma generation, and the backend server are available.

## 1. Local prerequisites

Use Node `22.12.x`; the repository pins this in both `engines.node` and Volta before the install step.
Copy `.env.example` to `.env` before app startup only when `.env` does not already exist; the sample `DATABASE_URL`, `REDIS_URL`, and `TEMPORAL_ADDRESS` are aligned with `docker-compose.dev.yaml`.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
pnpm install
npm run prisma-generate
npm run dev:docker
npm run dev
```

The dev helper UIs are intentionally kept off the app and extension watcher ports: pgAdmin is `http://localhost:5050`, RedisInsight is `http://localhost:5540`, and Temporal UI is `http://localhost:8082`. The extension hot-reload socket uses `4281`.

If a deployment cannot use Prisma db push/migrate, review the snaps-only PostgreSQL helper first:

```powershell
Get-Content .\scripts\snaps-postgres-migration.sql
```

Ollama should expose the configured models:

```powershell
curl http://localhost:11434/api/tags
```

Or run the snaps Ollama smoke before the app server is installed:

```powershell
.\scripts\verify-snaps-ollama.ps1
```

For the install-skipped preflight gate, run:

```powershell
npm run verify:snaps:preflight
npm run verify:snaps:runtime-contract
npm run verify:snaps:demo
```

To check final-gate fail-fast guards without a live server:

```powershell
npm run verify:snaps:final-guards
```

To see which install/runtime gates are ready or still blocked:

```powershell
npm run verify:snaps:readiness
npm run verify:snaps:readiness:json
npm run verify:snaps:dev-images
npm run verify:snaps:handoff

# After the server is expected to be running, make blocked runtime checks fail the command.
npm run verify:snaps:readiness -- -RequireRuntime

# Final-grade readiness also rejects warnings such as the wrong Node version.
npm run verify:snaps:readiness -- -RequireRuntime -RequireNoWarnings
npm run verify:snaps:readiness:strict

# Optional: require the dev stack to start without image pulls.
npm run verify:snaps:dev-images -- --strict
```

The handoff script also checks the local Docker image cache for the images named in `docker-compose.dev.yaml` when Docker is accessible, so you can tell whether `npm run dev:docker` is likely to spend time pulling Postgres, Redis, Temporal, or UI helper images before services become reachable.

`npm run build`, `npm run dev`, individual build/dev/start scripts, and `npm run prisma-generate` are safe to use even when global `pnpm` is missing because they fall back to the repository-local Corepack `pnpm.cjs` or local Prisma CLI through `scripts/run-pnpm.mjs` and `scripts/run-prisma.mjs`. Individual build/dev scripts clean `dist` with `scripts/clean-path.mjs`, which refuses to remove paths outside the repository.

To also include live local Ollama in that same bundle:

```powershell
npm run verify:snaps:preflight -- -IncludeOllama
```

`docs/snaps-demo-workspace.json` is a ready-to-import disposable workspace backup. Run `npm run verify:snaps:demo` before using it, then paste the JSON into snaps 스튜디오's workspace import field after the app is running to seed source content, RAG examples, report history, feedback inbox items, and activity records.

After the app server is running and you have a browser `auth` cookie, run the final gate:

```powershell
$env:SNAPS_OLLAMA_RAG_CONFIRM = "embed"
$env:SNAPS_RUNTIME_CONFIRM = "smoke"
npm run verify:snaps:final -- -Auth "<auth-cookie>" -ShowOrg "<organizationId>" -IncludeOllama
```

The final gate reads `FRONTEND_URL` and `NEXT_PUBLIC_BACKEND_URL` from `.env` when `-FrontendUrl` and `-BaseUrl` are omitted. It calls `node_modules\.bin\prisma.cmd` directly for Prisma generation/db push and falls back to the repository-local Corepack `pnpm.cjs` when `pnpm` is not on PATH. Preflight runs `verify-snaps-final.ps1 -CheckPrerequisitesOnly` to verify that tool resolution path before an auth cookie is available. Use explicit `-BaseUrl` and `-FrontendUrl` only when you need to override `.env`; for all-in-one Docker, one app URL is enough. Before the detailed runtime smoke, the final gate prints the same Docker dev image cache report used by preflight, then runs the readiness verifier with `-RequireRuntime -RequireNoWarnings` so missing `DATABASE_URL`, Postgres TCP reachability, Redis TCP reachability, Temporal TCP reachability, backend/frontend, Ollama readiness, and warnings such as the wrong Node version are summarized first. The authenticated runtime smoke requires `SNAPS_RUNTIME_CONFIRM=smoke` because normal transform and video-script checks record snaps activity entries. Add `-IncludeOllama` only with `SNAPS_OLLAMA_RAG_CONFIRM=embed` because it creates/searches/deletes a temporary RAG example to exercise the server-mediated embedding path. Add `-ApplyDbPush` only after reviewing `DATABASE_URL` and the deployment migration policy, and only with `SNAPS_DB_PUSH_CONFIRM=push` because the command uses Prisma `--accept-data-loss`. Add `-IncludeMutating` only against a disposable workspace and only with `SNAPS_MUTATING_CONFIRM=mutate` because it creates and deletes snaps workspace records. Add `-ConnectedIntegrationId` only with `SNAPS_CONNECTED_DRAFT_CONFIRM=draft` because the connected-channel smoke creates a real connected draft. Add `-IncludeConnectedSchedule` only with `-ConnectedIntegrationId` and `SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule`; the final gate fails fast otherwise because it creates a real scheduled post. Add `-IncludeNaverCafeLive` only when the Naver Cafe live-post env vars point at a disposable board; the final gate checks `NAVER_CAFE_ACCESS_TOKEN`, cafe IDs, and `SNAPS_NAVER_CAFE_CONFIRM=post` before preflight/build work starts. Add `-IncludePixelleDirect` or `-IncludePixelleJob` only when the Pixelle env vars point at a disposable endpoint; the final gate checks `PIXELLE_VIDEO_URL` and `SNAPS_PIXELLE_CONFIRM=generate` before preflight/build work starts. Add `-IncludeInboxClear` only against a disposable organization; the final gate checks `SNAPS_INBOX_CLEAR_CONFIRM=clear` before preflight/build work starts.

## 2. Authenticated API smoke

The snaps routes use the existing authenticated application middleware. After logging in through the app, copy the `auth` cookie value. If you need to force an organization, also copy `showorg`.
If the `/snaps` frontend route smoke fails, the verifier prints the HTTP status, redirect location, and a short HTML snippet so invalid auth cookies, missing frontend server, and unexpected markup are easier to separate.

```powershell
$env:SNAPS_OLLAMA_RAG_CONFIRM = "embed"
$env:SNAPS_RUNTIME_CONFIRM = "smoke"
.\scripts\verify-snaps-runtime.ps1 -Auth "<auth-cookie>" -RequireOllama
```

To also create a source-library entry and a report-history entry:

```powershell
$env:SNAPS_MUTATING_CONFIRM = "mutate"
.\scripts\verify-snaps-runtime.ps1 -Auth "<auth-cookie>" -IncludeMutating

# Connected-channel draft smoke. Add -IncludeConnectedSchedule only if creating a real scheduled post is intended.
$env:SNAPS_CONNECTED_DRAFT_CONFIRM = "draft"
.\scripts\verify-snaps-runtime.ps1 -Auth "<auth-cookie>" -ConnectedIntegrationId "<integration-id>" -ConnectedPlatform instagram -RuntimeSmokeId "snaps-smoke-manual-001"

# Connected-channel scheduled post smoke. Use only against a disposable connected channel.
$env:SNAPS_CONNECTED_DRAFT_CONFIRM = "draft"
$env:SNAPS_CONNECTED_SCHEDULE_CONFIRM = "schedule"
.\scripts\verify-snaps-runtime.ps1 -Auth "<auth-cookie>" -ConnectedIntegrationId "<integration-id>" -ConnectedPlatform instagram -IncludeConnectedSchedule -RuntimeSmokeId "snaps-smoke-schedule-001"

# Direct Naver Cafe provider payload smoke. Dry-run does not post.
npm run verify:snaps:naver-cafe -- --dry-run

# Direct Naver Cafe live post smoke. Use only against a disposable cafe board.
$env:NAVER_CAFE_ACCESS_TOKEN = "<naver-access-token>"
$env:NAVER_CAFE_CLUB_ID = "<club-id>"
$env:NAVER_CAFE_MENU_ID = "<menu-id>"
$env:SNAPS_NAVER_CAFE_CONFIRM = "post"
$env:SNAPS_NAVER_CAFE_SMOKE_ID = "snaps-naver-cafe-manual-001"
npm run verify:snaps:naver-cafe

# Direct Pixelle script handoff smoke. Dry-run does not submit a job.
npm run verify:snaps:pixelle -- --dry-run

# Direct Pixelle live job smoke. Use only against a disposable Pixelle endpoint.
$env:PIXELLE_VIDEO_URL = "http://localhost:7860"
$env:SNAPS_PIXELLE_CONFIRM = "generate"
$env:SNAPS_PIXELLE_SMOKE_ID = "snaps-pixelle-manual-001"
npm run verify:snaps:pixelle

# Authenticated snaps server Pixelle job smoke. Use only against a disposable Pixelle endpoint.
$env:PIXELLE_VIDEO_URL = "http://localhost:7860"
$env:SNAPS_PIXELLE_CONFIRM = "generate"
.\scripts\verify-snaps-runtime.ps1 -Auth "<auth-cookie>" -IncludePixelleJob

# Whole-inbox clear smoke. Use only against a disposable organization.
$env:SNAPS_INBOX_CLEAR_CONFIRM = "clear"
.\scripts\verify-snaps-runtime.ps1 -Auth "<auth-cookie>" -IncludeInboxClear
```

Before mutating workspace data, the runtime verifier checks both `/snaps/*` and `/api/snaps/*` aliases for health, the `/snaps` frontend route smoke, transform, transform-to-draft, transform-to-schedule, shorts script, video generation fallback when Pixelle is not configured, video status fallback when Pixelle is not configured, video-attach validation paths, reply capability shape, fail-closed reply-draft body validation, and fail-closed publish-reply behavior for a missing integration.

With `-IncludeMutating`, the runtime verifier also saves and lists sources, promotes a source and report to RAG, reloads the RAG example list, runs RAG search/rebuild, checks empty-integration draft warnings, lists report history, generates a platform-analytics report with empty provider inputs, imports and filters feedback, checks empty connected-comment import behavior, checks report exports, checks video draft warnings without media-library writes, confirms workspace export/import includes snaps sources, style examples, reports, inbox items, and activity, checks the activity log, and removes generated smoke source, report, RAG examples, and only the generated feedback inbox items in a cleanup `finally` block.

## 3. Browser smoke

- Open `/snaps`.
- The runtime verifier's frontend route smoke should already confirm `/snaps` returns snaps 스튜디오 markup when the `auth` header is supplied.
- Confirm the health panel shows Ollama, chat model, RAG, and Pixelle state.
- Run the runtime smoke against both `/snaps/health` and `/api/snaps/health` aliases.
- Use `-RequireOllama` with `SNAPS_OLLAMA_RAG_CONFIRM=embed` for the final snaps gate so both aliases must report configured chat and embedding models as ready, then create/search/delete a temporary RAG example through the server to exercise the embedding path.
- Use `-IncludePixelleJob` only when a real Pixelle job submission/status check is safe for the configured endpoint and `SNAPS_PIXELLE_CONFIRM=generate` is set.
- Use `-IncludeInboxClear` only against a disposable organization because it deletes every snaps inbox item.
- Use `-RuntimeSmokeId` for any smoke that may leave drafts, schedules, media, or Pixelle jobs so generated artifacts are searchable after the run.
- Use `verify:snaps:naver-cafe` live mode only with a disposable Naver Cafe board because it creates a real article. Keep `SNAPS_NAVER_CAFE_CONFIRM=post` out of default shell profiles so accidental posts fail closed.
- Use `verify:snaps:pixelle` live mode only with a disposable Pixelle endpoint because it submits a real generation job. Keep `SNAPS_PIXELLE_CONFIRM=generate` out of default shell profiles so accidental jobs fail closed.
- Confirm the runtime smoke checks `/api/snaps/transform`, `/api/snaps/transform-and-draft`, `/api/snaps/transform-and-schedule`, `/api/snaps/video/script`, `/api/snaps/video/generate-short`, `/api/snaps/video/status/:jobId`, and `/api/snaps/video/attach-to-draft` aliases before the mutating workspace checks.
- Click `Export` and confirm snaps workspace JSON copies sources, style examples, reports, inbox items, and activity.
- Paste the exported JSON into `Workspace Import` and confirm it merges without deleting existing workspace data.
- Enter source text and a topic/campaign, select Threads, Instagram, Xiaohongshu, Naver Blog, KakaoTalk, then run `AI 변환`.
- On Xiaohongshu, Naver Blog, and KakaoTalk variants, confirm Assist Checklist is visible and copy Markdown/HTML for manual publishing.
- Edit one generated variant, create drafts for connected channels, then switch mode to `예약` and confirm the selected publish date creates scheduled posts.
- Save and reload a source from Source Library, then use `RAG 승격` to promote it into style examples for the selected platform.
- Save, search, and delete a RAG style example.
- Run `RAG 임베딩 재생성` after import or model changes and confirm the activity log records the rebuild.
- Generate a report, confirm Korean insights, trends, and next actions render, reload it from history, copy Markdown, HTML, and PDF-oriented print HTML exports.
- Click `RAG 저장` on a generated report and confirm the report insights appear in RAG style examples for the selected platform.
- Generate a shorts script, paste a video URL, keep `Media library에 영상 URL 저장` enabled, and attach it to Instagram/YouTube/TikTok drafts or scheduled posts according to the selected mode.
- Confirm the shorts script includes Core Summary, timed scenes, Pixelle prompts, and Upload Metadata.
- Import feedback JSON and run inbox summary.
- Confirm the Feedback Inbox renders sentiment counts for question, praise, complaint, spam, collaboration, and other.
- Paste one or more connected post IDs in Feedback Inbox, choose the expected platform, and confirm `댓글 가져오기` imports existing stored comments into the snaps inbox.
- For a provider that supports comments, choose a connected reply channel, enter the external platform post ID, and confirm `플랫폼 게시` publishes the selected reply.
- Choose a generated reply suggestion, enter the target connected post ID, and confirm `답글 저장` creates a connected comment draft.
- Confirm Activity Log records transform, draft, source, report, video, and inbox operations.

## 4. Expected non-green cases

- If Ollama is down, transform should return the rule fallback unless `SNAPS_ALLOW_RULE_FALLBACK=false`.
- If `PIXELLE_VIDEO_URL` is empty, video generation should return script-ready output and still allow manual video URL attachment.
- If no channel is connected, draft creation should warn instead of failing silently.
