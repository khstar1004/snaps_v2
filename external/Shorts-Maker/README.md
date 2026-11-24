# Shorts Maker

Next.js App Router 기반 쇼츠 제작 워크스페이스다. 문서는 Codex가 빨리 읽고 바로 수정 지점을 찾을 수 있게 최소 수의 living docs와 generated JSON 인덱스로 유지한다.

## Quick Entry

- `docs/README.md`
- `docs/CODEX_GUIDE.md`
- `docs/OPERATIONS.md`
- `docs/developer-map.json`
- `docs/environment-map.json`

## Current Surfaces

- `/home`: 콘텐츠 프로필별 최근 작업, 발행 현황, 메모, 빠른 진입점
- `/shorts-json-studio`: 주제/스크립트/JSON 입력, prepare, 미리보기, 렌더, 발행 handoff
- `/layout-studio`: 템플릿 슬롯, 텍스트/이미지 레이아웃, 콘텐츠 프로필별 브랜딩 프리셋 편집기
- `/assets`: 렌더 결과, 업로드 자산, 오디오 라이브러리, 스튜디오 재진입
- `/publish`: 즉시 발행, 예약 발행, preflight, 작업 상태 관리
- `/settings`: 콘텐츠 프로필/채널 매핑 통합 설정, 외부 연결, 템플릿·출력, 저장소·복구 관리 (`/channel-categories`는 legacy redirect 호환 경로)
- `/admin/overview`, `/admin/users`: 관리자 메트릭, 사용자/권한, 작업공간 운영
- `/quick-studio`: 기존 북마크 호환용 경로이며 단계별 제작 시작 화면으로 이동
- `/trash`: 정리 화면

## Repo Shape

- `app`: App Router 페이지와 route handler
- `lib`: 인증, 스튜디오, 발행, 자산, 텔레메트리 등 도메인 로직
- `components`: 화면 간 공유 UI
- `scripts`: 테스트 러너, smoke 스크립트, docs refresh 유틸리티
- `docs`: living guides, generated maps, reference data
- `remotion`, `public`, `supabase`, `types`: 렌더 자산, 정적 파일, 스토리지 보조, 공용 타입

전체 route/file 맵은 `docs/developer-map.json`에 정리되어 있다.

## Local Run

1. 의존성 설치

```bash
npm install
```

2. 최소 필수 env를 채운다.

- 앱/세션
  - `APP_BASE_URL`
  - `AUTH_SESSION_SECRET`
- Supabase
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_VIDEO_ASSETS_BUCKET`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

전체 env 분류와 사용 파일은 `docs/OPERATIONS.md`와 `docs/environment-map.json`을 본다.

3. 관리자 계정을 준비한다.

```bash
npm run auth:bootstrap-admin -- --dry-run
npm run auth:bootstrap-admin
```

- `AUTH_BOOTSTRAP_ADMIN_LOGIN_ID` / `AUTH_BOOTSTRAP_ADMIN_PASSWORD`가 있으면 명시 계정으로 준비된다.
- 비생산 환경에서 명시 값이 없으면 파생된 로컬 admin 계정을 사용한다.

4. 개발 서버를 띄운다.

```bash
npm run dev
```

5. `http://localhost:4100/login`으로 접속한다.

## Daily Commands

```bash
npm run clean
npm run dev
npm run lint
npm run test
npm run build
npm run docs:refresh
npm run docs:check
npm run render:smoke
npm run auth:bootstrap-admin
npm run test:codex-local
```

- `npm run clean`: `.next`, `.next-build-verify`, `.npm-cache`, `tsconfig.tsbuildinfo`, `tmp/codex-imagegen*`, `tmp/dev-server.log` 같은 로컬 아티팩트를 정리한다.
- `npm run test`: `app/**`, `lib/**`의 co-located `*.test.ts(x)`와 `scripts/test-codex-local-paths.ts`를 Node test runner로 실행한다.
- `npm run docs:refresh`: `docs/developer-map.json`과 `docs/environment-map.json`을 현재 코드 기준으로 다시 생성한다.
- `npm run docs:check`: generated JSON이 git 기준과 일치하는지 확인한다.
- `npm run render:smoke`: native renderer 기본 경로를 검증한다.

## Doc Set

- [문서 인덱스](./docs/README.md)
- [Codex Guide](./docs/CODEX_GUIDE.md)
- [Operations](./docs/OPERATIONS.md)
- [BGM Setup](./docs/BGM_SETUP.md)
- [Developer Map JSON](./docs/developer-map.json)
- [Environment Map JSON](./docs/environment-map.json)
- [Revenue Ratecard](./docs/revenue-ratecard.yaml)
