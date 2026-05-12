# snaps Pixelle 영상 생성 엔진 세팅

## 구조

Pixelle-Video는 메인 앱 코드에 섞지 않고 `external/Pixelle-Video`에 격리한다.

- `snaps`: 기존 메인 앱
- `snaps-pixelle-video`: Pixelle-Video FastAPI 호환 서버
- `ComfyUI`: 호스트 PC에서 GPU로 실행하는 로컬 모델 런타임

메인 앱은 `PIXELLE_VIDEO_URL=http://snaps-pixelle-video:8000`으로 Pixelle 어댑터를 호출한다.

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

## snaps 호환 API

- `POST /generate`: 쇼츠 생성 작업 생성
- `GET /status/{jobId}`: 작업 상태 확인
- `GET /snaps/runtime`: ComfyUI 연결, 워크플로우 파일, LLM 설정 점검
- `GET /health`: Pixelle-Video API 상태 확인

작업 상태는 Pixelle 컨테이너의 `data/snaps-video-tasks.json`에 저장한다. 컨테이너가 재시작되면 완료/실패 작업은 유지되고, 진행 중이던 작업은 복구 불가 실패 상태로 전환된다.

프론트엔드는 두 모드를 제공한다.

- `AI 직접 생성`: 현재 활성 모드. Pixelle-Video와 로컬 ComfyUI를 사용한다.
- `HTML 영상화`: 개발중 상태로 표시한다.
