# Operations

런타임 설정, 배포 전제, QA, telemetry, publish 상태 참고를 한 문서로 모은다. 정확한 env-to-file 매핑은 `docs/environment-map.json`에 있다.

## Bootstrap Admin

- 명령:

```bash
npm run auth:bootstrap-admin -- --dry-run
npm run auth:bootstrap-admin
```

- 핵심 env:
  - `AUTH_BOOTSTRAP_ADMIN_LOGIN_ID`
  - `AUTH_BOOTSTRAP_ADMIN_PASSWORD`
  - 선택: `AUTH_BOOTSTRAP_ADMIN_NAME`, `AUTH_BOOTSTRAP_ADMIN_EMAIL`
- 비생산 환경에서 명시 계정이 없으면 파생된 로컬 admin을 사용할 수 있다.
- 명시 bootstrap 계정을 로그인 시점에도 강제로 맞추려면 `AUTH_BOOTSTRAP_ADMIN_SYNC_ON_LOGIN=true`
- 소스 오브 트루스:
  - `scripts/bootstrap-auth-admin.ts`
  - `lib/auth/bootstrap.ts`

## Runtime Switches

- `NEXT_PUBLIC_HOME_V1`
  - `true`: `/home`을 기본 시작점으로 사용
  - `false`: 기존 publish 중심 진입 경로 유지
- `NEXT_PUBLIC_STUDIO_STEPPER_V1`
  - `true`: 단계형 Studio UI
  - `false`: 확장형 Studio UI

이 두 값은 브라우저 빌드에 포함되는 공개 변수다.

## Environment Groups

전체 키와 사용 파일은 `docs/environment-map.json`을 본다. 실무에서 자주 보는 분류는 아래다.

- 앱/세션
  - `APP_BASE_URL`
  - `AUTH_SESSION_SECRET`
  - `NODE_ENV`, `VERCEL`, `NEXT_PUBLIC_*`
- 인증/로컬 우회
  - `AUTH_*`
  - `LOCAL_AUTH_*`
- Codex OAuth / 로컬 CLI
  - `CODEX_*`
  - `XDG_CONFIG_HOME`
- Supabase / 미디어 스토리지
  - `SUPABASE_*`
  - `NEXT_PUBLIC_SUPABASE_*`
- Google / YouTube OAuth
  - `GOOGLE_*`
  - `AUTH_GOOGLE_*`
- 예약 발행
  - `QSTASH_*`
  - `PUBLISH_EXECUTE_SECRET`
- Studio TTS
  - `TYPECAST_*`
  - `VOICE_*`
- 이미지 공급자
  - `GIPHY_*`
  - `NAVER_*`
  - `PEXELS_*`
  - `PIXABAY_*`
  - `MEME_*`
- Studio 렌더/실행 토글
  - `STUDIO_*`
- 캐시/스토리지
  - `UPSTASH_*`

## Deployment / Desktop Baseline

- Production에서는 `APP_BASE_URL`에 실제 HTTPS 운영 origin만 넣는다
- `APP_BASE_URL`, Codex OAuth redirect, Google OAuth redirect host는 서로 일치해야 한다
- Preview URL이나 `localhost`를 Production origin처럼 쓰지 않는다
- `LOCAL_AUTH_BYPASS_*`는 Production에 넣지 않는다
- PC 점검 기준:
  - 1280px 이상에서 4단계 제작, 히스토리, 미리보기, 결과 섹션 이동 가능
  - 빠른 제작 또는 모바일 전용 패널이 노출되지 않음
  - `prepare`, `render`, `publish` 버튼과 히스토리 패널 조작이 가려지지 않음
  - 새로고침 후 draft/preset/history 복원이 서로 덮어쓰지 않음

## Release / QA Baseline

- 기본 검증:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- 렌더 경로 변경 시:
  - `npm run render:smoke`
- 인증/bootstrap 경로 변경 시:
  - `npm run auth:bootstrap-admin -- --dry-run`
- 수동 회귀 기본 묶음:
  - `/` 또는 `/home` 진입
  - Studio에서 input -> prepare -> render -> publish handoff
  - `/assets`의 대표 액션 동작
  - `/channel-categories` 저장/수정/삭제
  - `/layout-studio` 접근 및 저장

## Telemetry Reference

- 소스 오브 트루스:
  - `lib/telemetry/schema.ts`
  - `lib/telemetry/client.ts`
  - `app/api/telemetry/event/route.ts`
  - `lib/telemetry/use-preflight-tracking.ts`
- 핵심 흐름 이벤트:
  - `page_view`
  - `json_input_started`
  - `prepare_succeeded`
  - `render_succeeded`
  - `upload_succeeded`
  - `publish_request_succeeded`
- 실패 이벤트:
  - `prepare_failed`
  - `render_failed`
  - `upload_failed`
  - `publish_request_failed`
- 보조 운영 이벤트:
  - `publish_preflight_checked`
  - `home_recent_action_clicked`
  - `settings_quick_action_clicked`
  - `assets_preflight_fix_clicked`

이벤트 전체 목록은 `lib/telemetry/schema.ts`를 그대로 본다.

## Publish Status Reference

- 상태 라벨 구현 위치:
  - `lib/publish/job-status.ts`
- 매핑:
  - `pending` -> `예약 대기`
  - `processing` -> `처리 중`
  - `published` -> `발행 완료`
  - `failed` -> `실패`
  - `canceled` -> `취소`

### Assets primary action

- 구현 위치:
  - `lib/publish/primary-actions.ts`
- 동작:
  - 작업이 없으면 `발행 화면`
  - `failed` 이고 `attempts >= 3`이면 `실패 작업 정리`
  - `pending`이면 `지금 바로 올리기`
  - `canceled`이면 `취소 작업 정리`
  - 그 외는 `발행 화면`

### Home recent action

- 게시 URL이 있으면 `게시물 열기`
- `failed` 또는 `canceled`이면 `바로 발행하기`
- `pending`이면 `/assets`로 보내는 `예약 작업 관리`
- 그 외는 `발행 화면으로`
