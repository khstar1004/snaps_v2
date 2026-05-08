# snaps

snaps is a Korean-first AI social content operations platform built on the existing Postiz scheduling infrastructure.

The product keeps the proven social account, OAuth, media upload, calendar, and scheduling core, and adds the snaps layer for:

- Ollama-based platform content transformation
- Operator-managed RAG style examples
- Korean channel support flows such as Naver Blog assist and Naver Cafe drafts
- AI analytics report generation
- Pixelle-compatible short-form video script and generation handoff
- Source, RAG, report, feedback, scheduling, Pixelle, and reply workflows with operator confirmation before destructive or externally mutating actions

## Core Stack

- Frontend: Next.js / React
- Backend: NestJS
- Scheduling: Temporal
- Database: PostgreSQL / Prisma
- Cache: Redis
- Local AI: Ollama

## snaps Environment

```env
SNAPS_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen3.5:9b
OLLAMA_EMBED_MODEL=nomic-embed-text:latest
OLLAMA_TEMPERATURE=0.35
OLLAMA_NUM_PREDICT=4096
OLLAMA_DISABLE_THINKING=true
SNAPS_RAG_ENABLED=true
SNAPS_RAG_TOP_K=5
SNAPS_ALLOW_RULE_FALLBACK=true
SNAPS_DATA_DIR=./var/snaps
# PIXELLE_VIDEO_URL=http://localhost:7860
# SNAPS_PIXELLE_CONFIRM=generate
# SNAPS_INBOX_CLEAR_CONFIRM=clear
# NAVER_CAFE_ACCESS_TOKEN=
# NAVER_CAFE_CLUB_ID=
# NAVER_CAFE_MENU_ID=
# SNAPS_NAVER_CAFE_CONFIRM=post
```

The local fallback keeps the transform UI usable when Ollama is down, but production deployments should keep Ollama health green.

## snaps API

The backend accepts both `/snaps/*` and `/api/snaps/*` for snaps routes. The frontend uses `/snaps/*` directly.

- `GET /snaps/health`
- `POST /snaps/health`
- `GET /snaps/activity`
- `POST /snaps/transform`
- `POST /snaps/transform-and-draft`
- `POST /snaps/transform-and-schedule`
- `POST /snaps/rag/examples`
- `GET /snaps/rag/examples`
- `DELETE /snaps/rag/examples/:exampleId`
- `GET /snaps/rag/search`
- `POST /snaps/rag/rebuild`
- `POST /snaps/schedule-variants`
- `GET /snaps/export`
- `POST /snaps/import`
- `POST /snaps/source-library`
- `GET /snaps/source-library`
- `DELETE /snaps/source-library/:sourceId`
- `POST /snaps/source-library/:sourceId/promote-to-rag`
- `POST /snaps/report/generate`
- `POST /snaps/report/from-platform-analytics`
- `GET /snaps/report/history`
- `GET /snaps/report/:reportId/export?format=markdown|html|print-html`
- `POST /snaps/report/:reportId/promote-to-rag`
- `DELETE /snaps/report/:reportId`
- `POST /snaps/inbox/import`
- `POST /snaps/inbox/import-post-comments`
- `GET /snaps/inbox/items`
- `DELETE /snaps/inbox/items`
- `DELETE /snaps/inbox/items/:itemId`
- `GET /snaps/inbox/reply-capabilities`
- `POST /snaps/inbox/summary`
- `POST /snaps/inbox/reply-draft`
- `POST /snaps/inbox/publish-reply`
- `POST /snaps/video/script`
- `POST /snaps/video/generate-short`
- `GET /snaps/video/status/:jobId`
- `POST /snaps/video/attach-to-draft`

## Verification

```bash
npm run verify:snaps
npm run verify:snaps:env
npm run verify:snaps:audit
npm run verify:snaps:api
npm run verify:snaps:frontend-surface
npm run verify:snaps:product-shell
npm run verify:snaps:runtime-contract
npm run verify:snaps:db
npm run verify:snaps:platforms
npm run verify:snaps:providers
npm run verify:snaps:demo
npm run verify:snaps:naver-cafe -- --dry-run
npm run verify:snaps:pixelle -- --dry-run
npm run verify:snaps:controller
npm run verify:snaps:services
npm run verify:snaps:preflight
npm run verify:snaps:ollama
npm run verify:snaps:final-guards
npm run verify:snaps:readiness
npm run verify:snaps:readiness:json
npm run verify:snaps:readiness:strict
npm run verify:snaps:dev-images
npm run verify:snaps:handoff
npm run verify:snaps:runtime -- -Auth <token> -ShowOrg <organizationId> -FrontendUrl http://localhost:4200
$env:SNAPS_OLLAMA_RAG_CONFIRM = "embed"
$env:SNAPS_RUNTIME_CONFIRM = "smoke"
npm run verify:snaps:final -- -Auth <token> -ShowOrg <organizationId> -IncludeOllama -FrontendUrl http://localhost:4200
```

`verify:snaps:services` runs the snaps service layer without a live server. It covers Ollama client JSON parsing/request shape, partial successful Ollama transform normalization including string hashtag cleanup, analytics metric mapping from existing provider output, malformed and non-array report metric handling, local JSON store recovery for malformed/non-array source, RAG, report, inbox, and activity files, activity record/import/list, activity import normalization without object-string leakage, source/RAG/report import-delete flows, source import/report export normalization without object-string leakage, RAG rebuild, RAG save/search, finite-only embedding normalization, malformed RAG import rejection, malformed `topK` clamping, transform fallback including Naver Blog and KakaoTalk assist variants, report export, feedback import/delete/clear/classification, malformed feedback input handling, malformed shorts LLM script normalization, short-form video fallback, Pixelle generate/status request normalization including nested job/status/video URL fields with a stubbed endpoint, Naver Cafe schedule settings validation including partial-warning behavior, and Naver Cafe OAuth/refresh/post payload/error normalization against an isolated `tmp/snaps-service-smoke-*` data directory, then removes that temporary smoke directory.

`npm test -- --runInBand` runs the focused snaps Jest suite. It currently verifies twelve core behaviors: Korean assist fallback variants, partial Ollama response normalization, mixed valid/invalid scheduling payloads, malformed feedback input handling, RAG save/search/import/rebuild/delete, source library import/report export normalization, activity import normalization, deterministic analytics report output, Pixelle script-ready fallback, malformed shorts script normalization, Naver Cafe OAuth/refresh/post normalization, and Ollama health/chat/embed JSON handling.

The same service smoke also verifies the pure publishing payload builder used by `/snaps/schedule-variants` and the video variant builder used by `/snaps/video/attach-to-draft`, so draft/schedule handoff shapes can be checked before the backend server is installed.

`verify:snaps:api` checks that the README snaps API list, `SnapsController` route decorators, and `SnapsWorkspace` route calls stay aligned.

`verify:snaps:frontend-surface` checks that the snaps 스튜디오 screen still wires the user-facing actions, `/snaps/*` API calls, platform tabs, import/export controls, RAG controls, report exports, inbox reply controls, and Pixelle shorts controls that make up the product workflow.

`verify:snaps:product-shell` checks the surrounding product shell: `/snaps` route registration, main menu entry, calendar shortcut, local font usage, snaps branding, privacy/terms baseline pages, browser extension metadata, SDK packaging/docs/default API URL, and Naver Cafe icon rendering.

`verify:snaps:runtime-contract` checks that every snaps controller route is exercised by `verify-snaps-runtime.ps1`; dangerous routes such as whole-inbox deletion stay behind explicit confirmation flags.

`verify:snaps:db` checks that the snaps Prisma models and `scripts/snaps-postgres-migration.sql` agree on tables, columns, indexes, foreign keys, and `updatedAt` triggers.

`verify:snaps:platforms` checks that backend platform rules, DTO validation, frontend platform tabs, default selections, assist-only channels, and video-capable channels stay in sync.

`verify:snaps:providers` checks the Naver Cafe provider registration path across backend provider, DTO discriminator, integration manager, frontend provider settings, icon rendering, schedule payload rules, and service smoke coverage.

`verify:snaps:demo` checks `docs/snaps-demo-workspace.json`, a ready-to-import snaps workspace backup with source content, RAG style examples, report history, feedback inbox items, and activity records. After the app is running, paste that JSON into snaps 스튜디오's workspace import field to seed a disposable demo organization.

`verify:snaps:naver-cafe -- --dry-run` checks the live Naver Cafe provider smoke payload without posting. To run a real Naver Cafe post, set `NAVER_CAFE_ACCESS_TOKEN`, `NAVER_CAFE_CLUB_ID`, `NAVER_CAFE_MENU_ID`, and `SNAPS_NAVER_CAFE_CONFIRM=post`, preferably with `SNAPS_NAVER_CAFE_SMOKE_ID` so the generated article is easy to find.

`verify:snaps:pixelle -- --dry-run` checks the snaps Pixelle script handoff without submitting a job. To submit a real Pixelle job, set `PIXELLE_VIDEO_URL` and `SNAPS_PIXELLE_CONFIRM=generate`, preferably with `SNAPS_PIXELLE_SMOKE_ID` so generated jobs are easy to find.

`verify:snaps:controller` instantiates `SnapsController` with mocked scheduler/Ollama/provider dependencies and exercises controller-level glue without a live Nest server. It covers health, transform validation/activity, schedule handoff with invalid `scheduleType` coercion, source promotion, analytics warning persistence, reply capability and publish paths, video attach validation/scheduling, connected-comment import filtering, and workspace import/export.

`verify:snaps:final-guards` verifies that dangerous final-gate options fail fast before preflight/build work when required auth-adjacent values, external-service envs, or explicit confirmation variables are missing.

`verify:snaps:readiness` prints the current install/runtime readiness state: Node/pnpm/Prisma CLI, `.env`, `DATABASE_URL`, Postgres TCP reachability, Redis URL/TCP reachability, Temporal address/TCP reachability, Ollama models, backend `/snaps` health aliases, and frontend `/snaps` markup. It exits successfully by default so it can be used before the server is running. `verify:snaps:readiness:json` emits the same checks as machine-readable JSON for CI or handoff logs. `verify:snaps:readiness:strict` is the final-grade version and fails on blocked runtime checks or warnings such as the wrong Node version.

`verify:snaps:dev-images` reports whether every image referenced by `docker-compose.dev.yaml` is already available in the local Docker cache. It exits successfully by default even when Docker is unavailable or images are missing, so install-skipped preflight can still run; use `npm run verify:snaps:dev-images -- --strict` when the dev stack is expected to start without image pulls.

`verify:snaps:handoff` prints the current readiness report, checks whether the `docker-compose.dev.yaml` images are already available locally when Docker can be queried, and then prints the exact install, startup, strict-readiness, and final-gate commands to run after dependency installation is allowed.

`verify:snaps:preflight` is the install-skipped gate for this repository state. It runs the static verifier, env/compose verifier, completion-audit verifier, API contract verifier, frontend surface verifier, product shell verifier, runtime smoke contract verifier, DB contract verifier, platform contract verifier, provider contract verifier, demo workspace verifier, Naver Cafe provider dry-run smoke, Pixelle dry-run smoke, service smoke, controller smoke, snaps library typecheck, full backend/frontend/orchestrator/commands/extension/SDK typecheck, backend/frontend snaps-filtered typecheck output guards, Jest smoke, Prisma schema validation, Docker compose config validation, Docker dev image cache reporting, PowerShell parser checks for the runtime/Ollama/final scripts, final option guard verification, readiness report, readiness JSON contract parsing, and final prerequisite smoke. The env/compose verifier checks DB credentials, Ollama model names, local dev URLs, Docker public URLs, and snaps data directories. The audit verifier keeps the implemented checklist and open runtime gates explicit. Add `-- -IncludeOllama` to include the live local Ollama smoke.

`npm run build`, `npm run dev`, individual build/dev/start scripts, and commands workspace builds use `scripts/run-pnpm.mjs`, which first tries `pnpm` from PATH and then falls back to the repository-local Corepack `pnpm.cjs`. `npm run prisma-generate` uses `scripts/run-prisma.mjs`, which uses the local Prisma CLI before falling back to `pnpm dlx prisma@6.5.0`. Individual build/dev scripts clean `dist` through `scripts/clean-path.mjs`, which refuses to remove paths outside the repository. This keeps production build, dev startup, Prisma generation, and common workspace commands reproducible on Windows machines where `pnpm` is not installed globally.

Use `-IncludeMutating` on the runtime verifier only against a disposable workspace and only with `SNAPS_MUTATING_CONFIRM=mutate` because it creates source, report, and inbox smoke records.

After installation and server startup, `verify:snaps:final` is the end-to-end gate. It runs the install-ready preflight, regenerates Prisma Client through `node_modules/.bin/prisma.cmd`, optionally applies `prisma db push` with `-ApplyDbPush`, runs the production build unless `-SkipBuild` is set, reports the Docker dev image cache, then runs `verify:snaps:readiness -- -RequireRuntime -RequireNoWarnings` before the authenticated runtime smoke. By default the final/runtime/readiness scripts read `FRONTEND_URL` and `NEXT_PUBLIC_BACKEND_URL` from `.env`; pass explicit `-BaseUrl` or `-FrontendUrl` only when overriding that local configuration. The authenticated runtime smoke requires `SNAPS_RUNTIME_CONFIRM=smoke` because normal transform and video-script checks record snaps activity entries. Add `-IncludeOllama` only with `SNAPS_OLLAMA_RAG_CONFIRM=embed`; it requires both configured Ollama models through the live snaps server health aliases and creates/searches/deletes a temporary RAG example to exercise the embedding path. To verify a real connected channel, pass `-ConnectedIntegrationId <id> -ConnectedPlatform instagram` only with `SNAPS_CONNECTED_DRAFT_CONFIRM=draft` because it creates a real connected draft; add `-IncludeConnectedSchedule` only when you intentionally want the smoke to create a real scheduled post, and the final gate will fail fast unless both the connected integration id and `SNAPS_CONNECTED_SCHEDULE_CONFIRM=schedule` are supplied. Add `-IncludeNaverCafeLive` only when the Naver Cafe live-post env vars point at a disposable board; the final gate requires `NAVER_CAFE_ACCESS_TOKEN`, cafe IDs, and `SNAPS_NAVER_CAFE_CONFIRM=post` before it starts. Add `-IncludePixelleDirect` or `-IncludePixelleJob` only when `PIXELLE_VIDEO_URL` points at a disposable Pixelle environment and a real job submission/status check is intended; both Pixelle live paths require `SNAPS_PIXELLE_CONFIRM=generate` before they can submit a job. Add `-IncludeInboxClear` only against a disposable organization because it deletes every snaps inbox item and requires `SNAPS_INBOX_CLEAR_CONFIRM=clear`. Pass `-RuntimeSmokeId <id>` when you want every generated smoke title/content/job prompt to carry a searchable identifier. If `pnpm` is not on PATH, it falls back to the repository-local Corepack `pnpm.cjs`. Preflight also runs `verify-snaps-final.ps1 -CheckPrerequisitesOnly` so the final gate's tool resolution is checked before an auth cookie is available.

The frontend uses a local system font stack through `snapsLocalFont`; it does not use `next/font/google`, so production builds do not depend on Google Fonts access.

## Local Development

Use Node `22.12.x`; `package.json`, Volta, `.nvmrc`, and `.node-version` all pin `22.12.0`.
Copy `.env.example` to `.env` before starting the app; its local `DATABASE_URL`, `REDIS_URL`, and `TEMPORAL_ADDRESS` match the Postgres, Redis, and Temporal services created by `npm run dev:docker`.

```bash
pnpm install
npm run prisma-generate
npm run dev:docker
npm run dev
```

The dev dependency UIs use non-app ports so they do not block the Next.js app or extension watcher: pgAdmin is on `http://localhost:5050`, RedisInsight is on `http://localhost:5540`, and Temporal UI is on `http://localhost:8082`. The extension hot-reload socket uses `4281`.

If `pnpm` is not on PATH but the repository-local Corepack package exists, the production build can be run without downloading pnpm:

```bash
node .corepack/v1/pnpm/10.6.1/bin/pnpm.cjs -r --workspace-concurrency=1 --filter ./apps/frontend --filter ./apps/backend --filter ./apps/orchestrator run build
```

Check Ollama separately:

```bash
curl http://localhost:11434/api/tags
```

## Docker Compose

The root `docker-compose.yaml` builds the local snaps source as `snaps-app:local` instead of pulling the upstream scheduler image.

```bash
docker compose up --build
```

The package shortcuts `npm run docker-build` and `npm run docker-create` use Docker Compose directly against the local `snaps` service instead of the legacy Postiz shell helpers.

When the app runs inside Docker and Ollama runs on the host, keep `OLLAMA_BASE_URL=http://host.docker.internal:11434`.

## Database

The canonical schema is `libraries/nestjs-libraries/src/database/prisma/schema.prisma`. When using the normal Postiz development flow, run `npm run prisma-generate` and the existing Prisma db push/migration workflow after dependencies are installed.

If you need a manual PostgreSQL helper for the snaps tables only, review and apply `scripts/snaps-postgres-migration.sql`. It creates the snaps style example, metric snapshot, and report tables plus indexes and `updatedAt` triggers.

## License

This codebase inherits the upstream AGPL-3.0 license. See [LICENSE](LICENSE).
