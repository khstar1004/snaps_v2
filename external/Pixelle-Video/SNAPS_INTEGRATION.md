# snaps integration notes

- Upstream repository: https://github.com/AIDC-AI/Pixelle-Video
- Cloned commit: `fd88c62363ccb57ba0e7d4fdb8ba465e653562b7`
- Integration style: isolated external engine, called from snaps through `PIXELLE_VIDEO_URL`

## Local runtime

The default `config.yaml` targets host ComfyUI:

```yaml
comfyui:
  comfyui_url: "http://host.docker.internal:8188"
  video:
    default_workflow: "selfhost/video_wan2.1_fusionx.json"
```

Keep custom snaps changes small and isolated:

- `api/routers/snaps.py` exposes `/generate`, `/status/{jobId}`, and `/snaps/runtime` for the main snaps backend.
- `api/tasks/manager.py` persists task snapshots to `data/snaps-video-tasks.json` so status checks survive container restarts.
- `web/i18n/locales/ko_KR.json` is the default UI locale.
- `config.yaml` is the local selfhost default used by Docker.

Before attempting a real generation run, open the selected workflow in ComfyUI and confirm that all nodes and model files are available.
