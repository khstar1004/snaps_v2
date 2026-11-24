# Codex Guide

Codex가 이 저장소를 빠르게 파악하기 위한 진입 문서다. 파일 위치와 환경변수 사용처는 generated JSON 쪽이 더 자세하고, 이 문서는 시작점만 압축한다.

## Repo Map

- `app`: UI 페이지와 `app/api/**` route handler
- `lib`: 인증, 스튜디오, 자산, 발행, 텔레메트리, 스토리지 계층
- `components`: 화면 간 공유 UI
- `scripts`: 테스트 러너, smoke, docs refresh/check
- `docs`: living guides와 generated JSON
- `remotion`, `public`, `supabase`, `types`: 렌더/정적 자산/스토리지 보조/공용 타입

주요 page 그룹은 `home`, `shorts-json-studio`, `layout-studio`, `publish`, `assets`, `settings`, `admin`, `login`이다. 전체 route 목록은 `docs/developer-map.json`에 있다.

## Task Routing

### 인증/권한

- 경로: `app/login`, `app/api/auth`, `lib/auth`
- 먼저 볼 파일:
  - `app/api/auth/login/route.ts`
  - `lib/auth/bootstrap.ts`
  - `lib/auth/session.ts`
  - `app/api/auth/codex/status/route.ts`

### 스튜디오 제작 흐름

- 경로: `app/shorts-json-studio`, `app/api/studio`, `lib/studio`
- 먼저 볼 파일:
  - `app/shorts-json-studio/page.tsx`
  - `app/api/studio/bootstrap/route.ts`
  - `app/api/studio/prepare/route.ts`
  - `app/api/studio/render-native/route.ts`
  - `lib/studio/codex-script.ts`

### 레이아웃/템플릿 편집기

- 경로: `app/layout-studio`
- 먼저 볼 파일:
  - `app/layout-studio/page.tsx`
  - `app/layout-studio/layout-studio-helpers.ts`
  - `app/layout-studio/layout-studio-inspector.ts`
  - `app/layout-studio/layout-studio-workbench.ts`

### 발행/예약/분석

- 경로: `app/publish`, `app/api/publish`, `lib/publish`
- 먼저 볼 파일:
  - `app/publish/page.tsx`
  - `app/api/publish/execute/route.ts`
  - `lib/publish/publish-store.ts`
  - `lib/publish/scheduler.ts`
  - `lib/publish/submit-flow.ts`

### 자산/라이브러리

- 경로: `app/assets`, `app/api/assets`, `lib/assets`
- 먼저 볼 파일:
  - `app/assets/page.tsx`
  - `app/api/assets/latest/route.ts`
  - `components/assets-explorer-panel.tsx`
  - `lib/assets/use-assets-browser-state.ts`

### 설정/관리자

- 경로: `app/settings`, `app/channel-categories`, `app/admin`, `app/api/admin`
- 먼저 볼 파일:
  - `app/settings/page.tsx`
  - `app/settings/history/page.tsx`
  - `app/admin/overview/page.tsx`
  - `app/admin/users/page.tsx`
  - `app/api/admin/users/route.ts`

### 텔레메트리

- 경로: `app/api/telemetry`, `lib/telemetry`
- 먼저 볼 파일:
  - `app/api/telemetry/event/route.ts`
  - `lib/telemetry/client.ts`
  - `lib/telemetry/schema.ts`
  - `lib/telemetry/use-preflight-tracking.ts`

## Codex-Specific Seams

- topic/script + script-to-json:
  - `app/api/studio/topic-to-script/route.ts`
  - `app/api/studio/script-to-json/route.ts`
  - `lib/studio/codex-script.ts`
  - `lib/studio/codex-script-core.ts`
  - `lib/studio/codex-script-to-json.ts`
- 로컬 Codex CLI/OAuth 브리지:
  - `lib/auth/codex-local.ts`
  - `lib/auth/codex-local-cli.ts`
  - `app/api/auth/codex/*`
  - `app/api/studio/codex-models/route.ts`
- 수동/자동 AI 이미지 경로:
  - `app/api/studio/prepare/route.ts`
  - `app/api/studio/manual-image-generate/route.ts`
  - `lib/studio/manual-image-scene-planner.ts`
  - `lib/studio/codex-local-image-generator.ts`
- SFX planner:
  - `lib/studio/sfx-query-planner.ts`

로컬 Codex CLI 프롬프트 경로는 `lib/auth/codex-local-cli.ts`에서 stdin 기반으로 처리한다. 이 경로를 수정하면 최소 `npm run test:codex-local`과 관련 co-located 테스트를 다시 돌린다.

## Hotspots

- `app/layout-studio/page.tsx`
- `lib/studio/image-provider-resolver.ts`
- `lib/studio/codex-script-core.ts`
- `lib/studio/codex-script-to-json.ts`
- `lib/publish/publish-store.ts`

이 파일들은 여전히 큰 진입점이므로, 수정 전에 주변 helper/test를 같이 보는 편이 빠르다.

## Verification

- 기본: `npm run lint`, `npm run test`
- docs/path/env 변경: `npm run docs:refresh`, `npm run docs:check`
- render 경로 변경: `npm run render:smoke`
- local Codex 경로 변경: `npm run test:codex-local`
- 특정 테스트만 재실행할 때:

```bash
node --experimental-strip-types --test --loader ./scripts/ts-paths-loader.mjs ./lib/studio/<file>.test.ts
```
