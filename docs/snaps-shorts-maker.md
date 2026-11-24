# snaps Shorts-Maker 영상 생성 엔진 세팅

## 구조

Shorts-Maker는 메인 앱 코드에 섞지 않고 `external/Shorts-Maker`에 격리한다. Pixelle-Video를 대체하는 것이 아니라, 두 번째 쇼츠 제작 엔진으로 나란히 실행한다 (독립 서비스로 병렬 운영).

- `snaps`: 기존 메인 앱
- `snaps-pixelle-video`: Pixelle-Video 엔진 (AI 직접 생성 + 로컬 ComfyUI, 기존 문서 참고)
- `snaps-shorts-maker`: Shorts-Maker 엔진. Next.js 16 + React 19 + Remotion 4 기반 자체 완결형 쇼츠 제작 앱
- `snaps-postgres`: 메인 앱(`snaps-db-local`)과 Shorts-Maker(`shorts-maker-db-local`)가 같은 인스턴스를 쓰되 DB를 분리해 격리한다. Pixelle-Video는 Postgres를 쓰지 않고 컨테이너 안 `data/snaps-video-tasks.json`에 작업 상태를 저장한다.

메인 앱은 `SHORTS_MAKER_URL=http://snaps-shorts-maker:4100`로 `ShortsMakerClientService` 어댑터 (`libraries/nestjs-libraries/src/snaps/shorts-maker/shorts-maker-client.service.ts`)를 통해 호출한다.

## 보안 가정: NODE_ENV=development + AUTH_LOCAL_BYPASS

`docker-compose.yaml`의 `snaps-shorts-maker` 서비스는 의도적으로 `NODE_ENV=development`, `AUTH_LOCAL_BYPASS=true`, `LOCAL_AUTH_BYPASS_ROLE=admin`으로 실행한다. 실수가 아니다.

- Shorts-Maker의 `lib/auth/local-bypass.ts`는 `NODE_ENV !== "production"`일 때만 `AUTH_LOCAL_BYPASS`를 허용한다.
- **이 가정은 이제 강제된다.** `npm run verify:snaps:shorts-maker-contract`가 compose 서비스에 `ports:` 매핑이
  생기면, `AUTH_LOCAL_BYPASS`가 꺼지면, `NODE_ENV`가 production이 되면, `local-bypass.ts`가 두 조건 중 하나를
  더 이상 읽지 않으면 실패한다. 스튜디오 라우트·verb와 상태 조회의 `id=` 파라미터도 양쪽에서 확인하고,
  `SHORTS_MAKER_URL`이 실제 compose 서비스와 Dockerfile이 서비스하는 포트로 해결되는지도 본다.
- 이 컨테이너는 `ports:`에 노출하지 않는다. `snaps-network`/`temporal-network` 내부 도커 네트워크에서만 `http://snaps-shorts-maker:4100`으로 접근 가능하고, 호스트나 외부 인터넷에서는 접근할 수 없다.
- 위 두 조건이 함께 있어야 안전하다: 우회 인증이 켜져 있어도 컨테이너가 외부에 노출되지 않으므로, 실제 로그인 플로우나 Shorts-Maker 자체 인증 코드를 건드리지 않고도 메인 백엔드가 바로 API를 호출할 수 있다.
- Shorts-Maker 코드를 추적해보면 (`lib/auth/api.ts` → `lib/auth/local-bypass.ts`) 바이패스가 켜져 있을 때 `requireSessionUser`/`requireAuthenticatedSessionUser`는 요청 자체를 검사하지 않고 환경변수로 만든 가상 세션 사용자를 그대로 반환한다. 즉 세션 쿠키를 별도로 발급받아 전달할 필요가 없다 — `ShortsMakerClientService`는 인증 헤더/쿠키 없이 단순 `fetch` 호출만 한다.

## 실행

```bash
docker compose up -d snaps-shorts-maker
docker compose up -d snaps
```

### 최초 1회 수동 설정: `shorts-maker-db-local` 데이터베이스 부트스트랩

Shorts-Maker는 `snaps-postgres` 컨테이너를 재사용하지만, 메인 `snaps-db-local` 스키마와 충돌하지 않도록 별도 데이터베이스(`shorts-maker-db-local`)를 사용한다. 이 데이터베이스 생성과 스키마 적용은 자동화되어 있지 않으므로 최초 1회 수동으로 실행해야 한다.

```bash
docker exec -it snaps-postgres psql -U snaps-user -d snaps-db-local -c "CREATE DATABASE \"shorts-maker-db-local\";"
docker exec -i snaps-postgres psql -U snaps-user -d shorts-maker-db-local < external/Shorts-Maker/scripts/local-postgres-schema.sql
```

## 기본 워크플로우

Shorts-Maker의 제작 파이프라인은 주제(topic) → 대본(script) → 슬라이드 JSON → 미디어 준비(prepare) → 렌더(오디오+비디오) → 게시 순서로 진행된다 (`external/Shorts-Maker/CLAUDE.md` 참고). Remotion 컴포지션 하나(`StudioShorts`, 1080x1920@30fps)로 서버 사이드 렌더링하고, ffmpeg로 내레이션+BGM+SFX를 믹싱한다.

- DeepSeek AI 프로바이더가 이미 연동되어 있다 (`AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`) — 실제 DeepSeek API로 검증 완료된 상태이며 이 작업에서는 손대지 않았다.
- **이미지 프로바이더**(Naver, Pexels, Pixabay, Giphy)는 비워둬도 된다. `lib/studio/image-provider-resolver*.ts`가 남은 프로바이더로 폴백하고, openverse/wikimedia는 키 없이 동작한다.
- **Shorts-Maker의 자체 게시 스택은 의도적으로 설정하지 않았다.** `lib/publish/scheduler.ts`는 QStash 기반으로 예약 게시를 하며 `QSTASH_TOKEN`, `QSTASH_URL`, `PUBLISH_EXECUTE_SECRET`을 요구하는데, `docker-compose.yaml`에 셋 다 없다. snaps는 Shorts-Maker를 **렌더 엔진으로만** 쓰고 게시는 자체 프로바이더(Postiz)로 하기 때문이다. 어댑터가 호출하는 것은 `/api/studio/topic-to-script`와 `/api/studio/render-jobs` 둘뿐이다. 컨테이너 안에서 `/api/publish/*`를 직접 호출하면 `QSTASH_TOKEN is required`로 실패하는데, 이는 설정 누락이 아니라 이 배포에서 쓰지 않는 경로다.
- **TTS(Typecast)는 필수다.** 폴백이 없다 — `TYPECAST_API_KEY`가 없으면 `lib/studio/tts-typecast.ts`가 `TYPECAST_API_KEY가 필요합니다.`로 바로 실패한다. 내레이션 오디오가 없으면 렌더 파이프라인이 진행되지 않으므로, 실제로 영상을 뽑으려면 이 키를 반드시 채워야 한다. `docker-compose.yaml`에는 빈 placeholder로만 두었다.

## snaps 호환 API

메인 백엔드(`apps/backend/src/api/routes/snaps.controller.ts`)는 `ShortsMakerClientService`를 통해 다음 엔드포인트를 얇게 프록시한다.

- `POST /snaps/shorts-maker/topic-to-script`: 주제로부터 대본 생성. Shorts-Maker의 `POST /api/studio/topic-to-script`를 호출한다.
- `POST /snaps/shorts-maker/render-jobs`: 비동기 렌더 작업 큐에 등록. Shorts-Maker의 `POST /api/studio/render-jobs`를 호출한다.
- `GET /snaps/shorts-maker/render-jobs/:jobId`: 렌더 작업 상태 조회 (폴링). Shorts-Maker의 `GET /api/studio/render-jobs?id=<jobId>`를 호출한다.

렌더 작업 요청 본문(`fullAudio`, `narration`, `durationMs`, `frameDurationsSec`, `visuals` 등)은 Shorts-Maker 자체의 대본→JSON→준비→렌더(오디오) 파이프라인을 먼저 거쳐야 만들어지는 값이다. 이 어댑터는 `render-jobs` HTTP 계약 자체만 감싸며, 그 페이로드를 조립하는 작업은 포함하지 않는다.

## 상태 확인

`GET /snaps/health`의 `shortsMaker` 필드로 확인한다.

```json
{ "configured": true, "ok": true, "reachable": true, "authPassed": true, "url": "http://snaps-shorts-maker:4100", "status": 400 }
```

Shorts-Maker에는 전용 health 라우트가 없어서, JSON을 반환하는 API 라우트를 프로브한다. id 없이 `GET /api/studio/render-jobs`를 호출하면 `400 STUDIO_RENDER_JOB_ID_REQUIRED`가 나오는데, **거기까지 도달했다는 것 자체가** 컨테이너가 떠 있고 라우팅이 동작하며 `requireSessionUser`를 통과했다는 뜻이다. 즉 이 통합이 의존하는 `AUTH_LOCAL_BYPASS` 가정이 실제로 성립하는지까지 함께 확인된다. `status: 400`은 정상이다.

네 가지 상태를 구분한다.

| 상태 | reachable | status | 의미 |
| --- | --- | --- | --- |
| 정상 | true | 400 | 서비스와 인증 우회 모두 정상 (`authPassed: true`) |
| 서버 오류 | true | 5xx | 컨테이너나 앞단 프록시가 응답했지만 실패했다 — 인증 설정과 무관하다 |
| 인증 우회 깨짐 | true | 그 외 | 컨테이너는 떴지만 `AUTH_LOCAL_BYPASS`/`NODE_ENV` 설정 확인 필요 |
| 미도달 | false | 없음 | `SHORTS_MAKER_URL`이 틀렸거나 컨테이너가 없음 |

**`status`의 유무가 "응답했다"와 "도달하지 못했다"를 가른다.** 프로브가 JSON이 아닌 본문(프록시의 HTML 502, Next.js 오류 페이지)을 받으면 파싱 실패가 연결 실패와 같은 경로로 빠져 `status`를 잃었고, 결과적으로 **응답한 컨테이너를 "unreachable"로 보고**했다. 운영자는 네트워크를 뒤지고, `error` 필드에는 `Unexpected token '<'`가 찍혔다. 지금은 상태 코드를 유지하고 본문 앞부분을 스니펫으로 실어 보낸다. 5xx일 때 `AUTH_LOCAL_BYPASS`를 확인하라고 안내하던 것도 상태에 맞게 고쳤다.

`SHORTS_MAKER_URL`이 비어 있으면 `configured: false`로만 보고하고 네트워크 호출은 하지 않는다.

## 타임아웃

`fetch`에는 기본 타임아웃이 없다. Shorts-Maker가 연결만 받고 응답하지 않으면 백엔드 요청이 **무기한** 열린 채 남고, 느린 렌더링과 구분할 방법도 없다. 세 호출 모두 `snapsFetchWithTimeout`을 거친다.

| 환경 변수 | 기본값 | 적용 대상 |
| --- | --- | --- |
| `SHORTS_MAKER_TIMEOUT_MS` | 120000 | topic-to-script, 렌더 작업 제출 |
| `SHORTS_MAKER_STATUS_TIMEOUT_MS` | 30000 | 렌더 작업 상태 조회 |

렌더링은 느리므로 제출 쪽은 넉넉하게, 상태 폴링은 짧게 잡는다. 숫자가 아닌 값을 넣으면 기본값으로 떨어진다 — `Number()`가 `NaN`이 되면 `setTimeout`이 이를 1ms로 취급해 **모든 요청을 즉시 중단**시키기 때문이다.

## 운영자 화면

쇼츠 워크스페이스(`apps/frontend/src/components/snaps/snaps-shorts-workspace.tsx`)의 원문 입력 아래에 **Shorts-Maker 대본 패널**이 있다. 주제와 모드(일반/대화)를 받아 `POST /snaps/shorts-maker/topic-to-script`를 호출하고, 돌아온 대본을 **원문 상자에 넣는다** — 그 뒤로는 이 페이지의 기존 흐름(Pixelle 생성·초안·예약)이 그대로 이어진다.

이 한 호출만 화면에 올린 이유는 계약이 거기까지만 온전하기 때문이다. `render-jobs` 페이로드(`fullAudio`, `frameDurationsSec`, `visuals`)는 Shorts-Maker 자신의 파이프라인을 먼저 돌려야 조립되고, 그건 어댑터 주석이 이미 범위 밖이라고 적어 둔 것이다. 없는 것을 추측해 만드는 대신 있는 것만 올렸다.

세 응답이 모두 200으로 오므로 본문으로 판정한다 — `ok: false, status: 'not-configured'` 는 `SHORTS_MAKER_URL` 안내로, `status: 'error'` 는 오류 메시지와 재시도 가능 여부로, 빈 대본은 그 사실대로 알린다. 헬스가 미설정이면 버튼은 비활성이고 배지가 이유를 말한다.

## 아직 하지 않은 것 (후속 작업)

- Pixelle-Video와 Shorts-Maker 중 **엔진을 선택하는** UI는 없다. 위 패널은 대본만 가져오고, 영상 생성은 여전히 Pixelle 경로를 쓴다.
- `render-jobs` 페이로드를 채우기 위한 전체 파이프라인(대본→JSON→준비→렌더) 연동은 포함하지 않았다. `topic-to-script` + 렌더 작업 등록/상태 조회의 계약 수준 연동까지만 되어 있다.
- 실제 docker 스택을 기동해 엔드투엔드로 검증하지는 않았다. `docker compose config`로 설정 유효성을 확인하고, `docker build`로 이미지 빌드는 실제로 돌려봤다.

## 캡션 폰트와 네트워크 의존

`remotion/index.ts`가 `styles/studio-fonts.css`를 import하는데, 이 CSS는 Google Fonts·jsDelivr 등 **외부 CDN 5곳**을 `@import`한다. 즉 영상 렌더 시점에 아웃바운드 네트워크를 탄다.

기본 캡션 폰트 스택은 다음과 같다 (`lib/publish/template-branding.ts`).

```
"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif
```

컨테이너 안에서는 이 중 앞의 것들이 대부분 해석되지 않는다. `Pretendard Variable`은 CDN에서만 오고, `Pretendard`는 이미지에 설치되어 있지 않으며, `-apple-system`/`BlinkMacSystemFont`는 macOS, `Malgun Gothic`은 Windows 전용이다. 결국 `sans-serif`로 떨어지고 fontconfig가 `fonts-noto-cjk`를 고른다.

정리하면:

- **egress가 열린 호스트**: 의도한 Pretendard Variable로 렌더된다.
- **egress가 막힌 호스트**: 한글은 Noto Sans CJK로 정상 렌더되지만 서체가 달라진다. 깨지지는 않는다.

`fonts-noto-cjk`가 없으면 한글이 아예 두부가 되므로 Dockerfile의 apt 목록에서 이걸 빼면 안 된다. 서체까지 고정하고 싶으면 Pretendard를 이미지에 설치하면 되는데, 빌드 컨텍스트가 `external/Shorts-Maker`라 저장소가 이미 갖고 있는 카드뉴스용 OTF(4.7MB)를 이 디렉토리에 복제해야 한다. 사본이 갈라질 여지가 있어 지금은 넣지 않았다.

## 이미지 구성 주의점

`next.config.ts`에 `output: "standalone"`이 없어 런타임 이미지는 `node_modules` 전체를 싣고 `next start`로 뜬다.

런타임 이미지에는 `.next`뿐 아니라 **소스 디렉토리도 함께 들어가야 한다**. Remotion이 렌더 시점에 소스를 번들링하기 때문이다.

```
lib/studio/render-remotion-server.ts
  bundle({ entryPoint: join(process.cwd(), "remotion", "index.ts") })
```

`remotion/`이 없으면 영상 렌더가 전부 실패한다. `remotion/`은 상대 경로와 `@/` alias로 `types/`, `lib/studio/`, `app/shorts-json-studio/components/templates/*`를 끌어오므로 `remotion/`, `types/`, `lib/`, `app/`을 모두 복사하고, alias 해석을 위해 `tsconfig.json`도 함께 둔다.
