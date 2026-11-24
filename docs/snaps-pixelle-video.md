# snaps Pixelle 영상 생성 엔진 세팅

## 구조

Pixelle-Video는 메인 앱 코드에 섞지 않고 `external/Pixelle-Video`에 격리한다.

- `snaps`: 기존 메인 앱
- `snaps-pixelle-video`: Pixelle-Video FastAPI 호환 서버
- `ComfyUI`: 호스트 PC에서 GPU로 실행하는 로컬 모델 런타임

메인 앱은 `PIXELLE_VIDEO_URL=http://snaps-pixelle-video:8000`으로 Pixelle 어댑터를 호출한다.

두 호출 모두 데드라인을 둔다 — `fetch`에는 기본 타임아웃이 없어서, Pixelle이 연결만 받고 응답하지 않으면 백엔드 요청이 무기한 열린 채 남는다. `PIXELLE_TIMEOUT_MS`(기본 120000)는 `/generate`에, `PIXELLE_STATUS_TIMEOUT_MS`(기본 30000)는 `/status/:jobId`에 적용된다. 숫자가 아닌 값은 기본값으로 떨어진다.

## 실행

```bash
docker compose up -d snaps-pixelle-video
docker compose up -d snaps
```

호스트에서는 ComfyUI를 먼저 `http://127.0.0.1:8188`로 실행한다. Docker 컨테이너 안에서는 `config.yaml`의 `http://host.docker.internal:8188` 주소로 접근한다.

## 기본 워크플로우

- 영상 생성: `external/Pixelle-Video/workflows/selfhost/video_wan2.1_fusionx.json`
- TTS: `external/Pixelle-Video/workflows/selfhost/tts_edge.json`
- 기본 템플릿: `external/Pixelle-Video/templates/1080x1920/video_default.html`

ComfyUI에서 이 워크플로우를 단독으로 먼저 성공시켜야 snaps에서도 생성된다. VRAM이 부족한 환경에서는 실제 생성 테스트가 실패할 수 있지만, 모델과 커스텀 노드가 준비되면 바로 `/generate` 요청을 받을 수 있다.

## i18n 범위 참고

`web/i18n/locales/ko_KR.json`은 `en_US.json`의 501개 키 중 168개만 번역되어 있다. 이는 업스트림 동기화 이전부터 그랬고(동기화가 추가한 키는 0개), snaps 배포에는 영향이 없다. compose가 실행하는 것은 `api/app.py`(FastAPI)뿐이고 Streamlit `web/` UI는 띄우지 않기 때문이다. Pixelle 자체 웹 UI를 별도로 쓸 계획이 생기면 그때 번역 범위를 다시 보면 된다.

## 계약 검사

`external/`은 jest와 모든 tsconfig에서 제외된다. 이 포크는 Pixelle 쪽 Python 파일 24개를 수정했는데, 오랫동안 **어떤 자동 검사도 닿지 않았다** — 문법 오류 하나도 Pixelle 서비스를 실제로 띄울 때까지 드러나지 않고, 그것은 아직 열린 런타임 게이트다.

`npm run verify:snaps:pixelle-contract`가 네 가지를 본다.

**라우터 접두사.** `api/app.py`는 라우터 11개 중 9개를 `prefix=api_config.api_prefix`로 마운트하고 **health와 snaps만 접두사 없이** 붙인다. 그 덕분에 `/generate`·`/status/{job_id}`·`/snaps/runtime`·`/health`가 백엔드가 기대하는 위치에 있다. snaps 라우터를 "형제 9개와 일관되게" 만드는 편집 한 번이면 세 경로가 옮겨가고 **모든 snaps 영상 요청이 404**가 되는데, 그 실패는 서비스를 띄워 봐야 보인다.

**양방향 경로.** Python이 그 네 경로를 서비스하는지와, 백엔드가 여전히 그 경로를 호출하는지를 함께 본다. 한쪽만 움직여도 잡힌다.

**URL 해결.** `verify:snaps:env`는 `.env.example`과 `docker-compose.yaml`의 `PIXELLE_VIDEO_URL` 문자열이 서로 같은지만 본다. 계약 검사는 그 URL의 호스트가 실제 compose 서비스이고 `container_name`이 일치하는지, 포트가 컨테이너 `command`의 `--port` 값과 같은지를 확인한다 — 서비스 이름을 바꾸거나 포트를 바꾸면 고정된 문자열은 그대로라 env 검사를 통과한다.

**Python 컴파일.** `external/Pixelle-Video`의 모든 `.py`를 컴파일한다(현재 118개). Python 인터프리터가 없는 환경에서는 실패가 아니라 건너뛴다.

## 노출 범위 주의

`snaps-pixelle-video` 서비스는 `ports: - "8000:8000"`으로 **호스트에 API를 발행한다**. `api/app.py`는 CORS 미들웨어만 추가하고 인증이 없다 — `/generate`·`/status/{job_id}`·파일 라우트 모두 API 키도, 세션도, Authorization 헤더도 요구하지 않는다. 즉 **호스트의 8000 포트에 닿을 수 있는 무엇이든** 영상 생성 작업을 큐에 넣고 결과물을 읽을 수 있다.

형제 `snaps-shorts-maker`는 정반대로 포트를 열지 않는다(`docs/snaps-shorts-maker.md`의 보안 가정 참고). Pixelle 웹 UI를 `localhost:8000`으로 여는 워크플로가 있을 수 있어 매핑은 그대로 두었고, compose에 무엇이 노출되는지와 호스트 전용이면 `127.0.0.1:8000:8000`으로 바인딩하라는 안내를 적어 두었다. 배포 정책은 운영자가 정한다.

## snaps 호환 API

- `POST /generate`: 쇼츠 생성 작업 생성
- `GET /status/{jobId}`: 작업 상태 확인
- `GET /snaps/runtime`: ComfyUI 연결, 워크플로우 파일, LLM 설정 점검
- `GET /health`: Pixelle-Video API 상태 확인

작업 상태는 Pixelle 컨테이너의 `data/snaps-video-tasks.json`에 저장한다. 컨테이너가 재시작되면 완료/실패 작업은 유지되고, 진행 중이던 작업은 복구 불가 실패 상태로 전환된다.

프론트엔드는 두 모드를 제공한다.

- `AI 직접 생성`: 현재 활성 모드. Pixelle-Video와 로컬 ComfyUI를 사용한다.
- `HTML 영상화`: 개발중 상태로 표시한다.
