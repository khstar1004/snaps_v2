# snaps 영상 생성 엔진

이 디렉터리는 `snaps`에서 AI 직접 영상 생성 모드를 실행하기 위해 격리해 둔 Pixelle-Video 기반 엔진입니다.

## 실행 구조

- `snaps` 백엔드: `PIXELLE_VIDEO_URL=http://snaps-pixelle-video:8000`으로 호출
- `snaps-pixelle-video`: FastAPI 기반 Pixelle-Video 호환 서버
- 로컬 ComfyUI: `http://host.docker.internal:8188`

## 주요 엔드포인트

- `POST /generate`: snaps 쇼츠 생성 요청을 받아 비동기 작업을 시작합니다.
- `GET /status/{jobId}`: 작업 상태와 생성된 영상 URL을 반환합니다.
- `GET /health`: 엔진 상태를 확인합니다.
- `POST /api/video/generate/async`: 원본 Pixelle-Video 비동기 API입니다.

## 로컬 모델 준비

`config.yaml`은 기본적으로 로컬 ComfyUI selfhost 워크플로우를 사용합니다.

- 영상: `workflows/selfhost/video_wan2.1_fusionx.json`
- TTS: `workflows/selfhost/tts_edge.json`
- 기본 템플릿: `templates/1080x1920/video_default.html`

ComfyUI에서 해당 워크플로우가 먼저 단독 실행되어야 snaps에서도 성공합니다. VRAM이 부족하면 작업은 실패할 수 있지만, 모델과 노드가 준비된 환경에서는 바로 생성 요청을 받을 수 있도록 세팅되어 있습니다.
