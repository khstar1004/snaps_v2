# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0

"""
Snaps compatibility endpoints.

The main Snaps backend expects a small job API:
POST /generate and GET /status/{job_id}.  This router adapts that contract to
Pixelle-Video's internal generator while keeping the original API routes intact.
"""

from pathlib import Path
from typing import Any, Dict, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from loguru import logger
from pydantic import BaseModel, Field

from api.dependencies import PixelleVideoDep
from api.routers.video import path_to_url
from api.tasks import TaskType, task_manager
from api.tasks.models import TaskStatus
from pixelle_video.config import config_manager

router = APIRouter(tags=["Snaps Adapter"])


class SnapsScriptScene(BaseModel):
    scene: Optional[int] = None
    startSecond: Optional[int] = None
    endSecond: Optional[int] = None
    visual: Optional[str] = None
    narration: Optional[str] = None
    overlayText: Optional[str] = None
    pixellePrompt: Optional[str] = None


class SnapsScript(BaseModel):
    title: Optional[str] = None
    coreSummary: Optional[str] = None
    hook: Optional[str] = None
    durationSeconds: Optional[int] = None
    narration: Optional[str] = None
    storyboard: list[SnapsScriptScene] = Field(default_factory=list)
    caption: Optional[str] = None
    uploadMetadata: Dict[str, Any] = Field(default_factory=dict)
    hashtags: list[str] = Field(default_factory=list)


class SnapsGenerateRequest(BaseModel):
    sourceText: str
    durationSeconds: Optional[int] = 45
    platform: Optional[Literal["instagram", "youtube", "tiktok"]] = "youtube"
    script: Optional[SnapsScript] = None


def _workflow_status(workflow_key: Optional[str]) -> Dict[str, Any]:
    if not workflow_key:
        return {
            "key": None,
            "configured": False,
            "exists": False,
            "path": None,
            "message": "워크플로우가 설정되지 않았습니다.",
        }

    candidates = [
        Path("workflows") / workflow_key,
        Path("data") / "workflows" / workflow_key,
    ]
    found = next((path for path in candidates if path.exists()), None)
    return {
        "key": workflow_key,
        "configured": True,
        "exists": found is not None,
        "path": str(found or candidates[0]),
    }


async def _comfyui_status(comfyui_url: str) -> Dict[str, Any]:
    if not comfyui_url:
        return {
            "configured": False,
            "ok": False,
            "message": "ComfyUI 주소가 설정되지 않았습니다.",
        }

    url = comfyui_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{url}/system_stats")
        return {
            "configured": True,
            "ok": response.status_code < 400,
            "statusCode": response.status_code,
            "url": url,
        }
    except Exception as exc:
        return {
            "configured": True,
            "ok": False,
            "url": url,
            "message": str(exc)[:300],
        }


def _duration_to_scene_count(duration: int) -> int:
    if duration <= 30:
        return 4
    if duration >= 60:
        return 6
    return 5


def _script_text(body: SnapsGenerateRequest) -> str:
    script = body.script
    if not script:
        return body.sourceText

    storyboard_lines = []
    for scene in script.storyboard[:8]:
        parts = [
            scene.overlayText or "",
            scene.narration or "",
            scene.visual or "",
            scene.pixellePrompt or "",
        ]
        line = " / ".join(part for part in parts if part)
        if line:
            storyboard_lines.append(line)

    return "\n".join(
        part
        for part in [
            script.title,
            script.hook,
            script.coreSummary,
            script.narration,
            "\n".join(storyboard_lines),
            body.sourceText,
        ]
        if part
    )


def _video_params(body: SnapsGenerateRequest) -> Dict[str, Any]:
    duration = int(body.script.durationSeconds if body.script else body.durationSeconds or 45)
    title = (
        body.script.title
        if body.script and body.script.title
        else body.sourceText.strip().splitlines()[0][:80]
    )
    comfyui_config = config_manager.get_comfyui_config()
    video_config = comfyui_config.get("video", {})
    return {
        "text": _script_text(body),
        "mode": "fixed",
        "title": title or "snaps 쇼츠",
        "n_scenes": _duration_to_scene_count(duration),
        "min_narration_words": 5,
        "max_narration_words": 36,
        "min_image_prompt_words": 24,
        "max_image_prompt_words": 80,
        "media_workflow": video_config.get("default_workflow")
        or "selfhost/video_wan2.1_fusionx.json",
        "video_fps": 24,
        "frame_template": config_manager.config.template.default_template
        or "1080x1920/video_default.html",
        "prompt_prefix": video_config.get("prompt_prefix") or (
            "Korean vertical short-form video, clean editorial composition, "
            "natural camera motion, readable Korean overlay text, polished social ad style"
        ),
        "bgm_volume": 0.22,
    }


@router.post("/generate")
async def generate_for_snaps(
    request_body: SnapsGenerateRequest,
    pixelle_video: PixelleVideoDep,
    request: Request,
):
    try:
        task = task_manager.create_task(
            task_type=TaskType.VIDEO_GENERATION,
            request_params=request_body.model_dump(),
        )

        async def execute_video_generation():
            from pixelle_video.services.frame_html import HTMLFrameGenerator
            from pixelle_video.utils.template_util import resolve_template_path

            params = _video_params(request_body)
            task_manager.update_progress(
                task.task_id,
                1,
                4,
                "템플릿과 로컬 ComfyUI 워크플로우를 준비하는 중입니다.",
            )
            template_path = resolve_template_path(params["frame_template"])
            generator = HTMLFrameGenerator(template_path)
            media_width, media_height = generator.get_media_size()
            task_manager.update_progress(
                task.task_id,
                2,
                4,
                "영상 생성을 시작했습니다. ComfyUI 처리 시간이 걸릴 수 있습니다.",
            )
            result = await pixelle_video.generate_video(
                **params,
                media_width=media_width,
                media_height=media_height,
            )
            task_manager.update_progress(
                task.task_id,
                4,
                4,
                "영상 생성이 완료되었습니다.",
            )
            return {
                "status": "completed",
                "videoUrl": path_to_url(request, result.video_path),
                "duration": result.duration,
                "script": request_body.script.model_dump() if request_body.script else None,
            }

        await task_manager.execute_task(task.task_id, execute_video_generation)
        return {
            "status": "queued",
            "jobId": task.task_id,
            "id": task.task_id,
            "message": "snaps 영상 생성 작업을 시작했습니다.",
            "script": request_body.script.model_dump() if request_body.script else None,
        }
    except Exception as error:
        logger.exception(error)
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/snaps/runtime")
async def snaps_runtime():
    comfyui_config = config_manager.get_comfyui_config()
    llm_config = config_manager.get_llm_config()
    video_workflow = comfyui_config.get("video", {}).get("default_workflow", "")
    tts_workflow = comfyui_config.get("tts", {}).get("default_workflow", "")
    image_workflow = comfyui_config.get("image", {}).get("default_workflow", "")
    workflows = {
        "video": _workflow_status(video_workflow),
        "tts": _workflow_status(tts_workflow),
        "image": _workflow_status(image_workflow),
    }
    comfyui = await _comfyui_status(str(comfyui_config.get("comfyui_url", "")))
    workflow_ok = workflows["video"]["exists"]
    ok = bool(comfyui.get("ok")) and workflow_ok

    return {
        "ok": ok,
        "service": "snaps-pixelle-video",
        "comfyui": comfyui,
        "workflows": workflows,
        "llm": {
            "configured": bool(llm_config.get("base_url") and llm_config.get("model")),
            "baseUrl": llm_config.get("base_url"),
            "model": llm_config.get("model"),
        },
    }


@router.get("/status/{job_id}")
async def snaps_status(job_id: str):
    task = task_manager.get_task(job_id)
    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    payload: Dict[str, Any] = {
        "status": task.status.value,
        "jobId": task.task_id,
        "id": task.task_id,
    }
    if task.status == TaskStatus.COMPLETED and task.result:
        payload.update(task.result)
    if task.status == TaskStatus.FAILED:
        payload["message"] = task.error or "영상 생성에 실패했습니다."
        payload["error"] = task.error
    if task.progress:
        payload["progress"] = task.progress.model_dump()
    return payload
