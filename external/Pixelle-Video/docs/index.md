# snaps 영상 생성 엔진

이 문서는 snaps에 포함된 Pixelle-Video 기반 영상 생성 엔진의 로컬 운영 안내입니다.

## 기본 실행

```bash
docker compose up -d snaps-pixelle-video
```

ComfyUI는 호스트에서 `http://127.0.0.1:8188`로 먼저 실행해 주세요. Docker 컨테이너에서는 `http://host.docker.internal:8188`로 접근합니다.
