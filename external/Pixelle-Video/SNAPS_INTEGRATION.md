# snaps integration notes

- Upstream repository: https://github.com/AIDC-AI/Pixelle-Video
- Synced commit: `848b054e4fae40dabc62ec58e960b573e83793ac` (main, synced 2026-09-09; previously pinned at `fd88c62`, 37 commits behind)
- Integration style: isolated external engine, called from snaps through `PIXELLE_VIDEO_URL`
- Sync method: 3-way git merge (common ancestor `fd88c62`, ours = snaps-patched tree, theirs = upstream `main`) so future syncs can repeat the same process instead of a manual diff. `README.md`/`README_EN.md` conflicts were resolved by keeping the snaps-localized versions; `web/i18n/locales/zh_CN.json` stays deleted (snaps only ships `ko_KR.json`); trivial trailing-whitespace conflicts in `web/pipelines/asset_based.py`/`digital_human.py` were resolved as no-ops. All 4 snaps-only files below were untouched by upstream and merged with zero conflicts.
- Notable upstream pickup: `pixelle_video/config/schema.py` now has a first-class `api_providers.deepseek` config block (see `config.example.yaml`), so Pixelle-Video's own script/storyboard LLM step can call DeepSeek directly, independent of snaps' own `AI_PROVIDER=deepseek` switch in the NestJS backend.

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
