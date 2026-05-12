# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Task Manager

In-memory task management for video generation jobs.
"""

import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Callable
from loguru import logger

from api.tasks.models import Task, TaskStatus, TaskType, TaskProgress
from api.config import api_config


class TaskManager:
    """
    Task manager for handling async video generation tasks
    
    Features:
    - In-memory storage (can be replaced with Redis later)
    - Task lifecycle management
    - Progress tracking
    - Auto cleanup of old tasks
    """
    
    def __init__(self):
        self._tasks: Dict[str, Task] = {}
        self._task_futures: Dict[str, asyncio.Task] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False
        self._store_path = Path(
            os.environ.get("SNAPS_PIXELLE_TASK_STORE", "data/snaps-video-tasks.json")
        )
        self._load_tasks()
    
    async def start(self):
        """Start task manager and cleanup scheduler"""
        if self._running:
            logger.warning("Task manager already running")
            return
        
        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("✅ Task manager started")
    
    async def stop(self):
        """Stop task manager and cancel all tasks"""
        self._running = False
        
        # Cancel cleanup task
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        # Cancel all running tasks
        for task_id, future in self._task_futures.items():
            if not future.done():
                future.cancel()
                logger.info(f"Cancelled task: {task_id}")
        
        self._task_futures.clear()
        self._persist_tasks()
        logger.info("✅ Task manager stopped")
    
    def create_task(
        self,
        task_type: TaskType,
        request_params: Optional[dict] = None
    ) -> Task:
        """
        Create a new task
        
        Args:
            task_type: Type of task
            request_params: Original request parameters
            
        Returns:
            Created task
        """
        task_id = str(uuid.uuid4())
        task = Task(
            task_id=task_id,
            task_type=task_type,
            status=TaskStatus.PENDING,
            request_params=request_params,
        )
        
        self._tasks[task_id] = task
        self._persist_tasks()
        logger.info(f"Created task {task_id} ({task_type})")
        return task
    
    async def execute_task(
        self,
        task_id: str,
        coro_func: Callable,
        *args,
        **kwargs
    ):
        """
        Execute task asynchronously
        
        Args:
            task_id: Task ID
            coro_func: Async function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments
        """
        task = self._tasks.get(task_id)
        if not task:
            logger.error(f"Task {task_id} not found")
            return
        
        # Create async task
        async def _execute():
            try:
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now()
                self._persist_tasks()
                logger.info(f"Task {task_id} started")
                
                # Execute the actual work
                result = await coro_func(*args, **kwargs)
                
                # Update task with result
                task.status = TaskStatus.COMPLETED
                task.result = result
                task.completed_at = datetime.now()
                self._persist_tasks()
                logger.info(f"Task {task_id} completed")
                
            except Exception as e:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.completed_at = datetime.now()
                self._persist_tasks()
                logger.error(f"Task {task_id} failed: {e}")
        
        # Start execution
        future = asyncio.create_task(_execute())
        self._task_futures[task_id] = future
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get task by ID"""
        return self._tasks.get(task_id)
    
    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100
    ) -> List[Task]:
        """
        List tasks with optional filtering
        
        Args:
            status: Filter by status
            limit: Maximum number of tasks to return
            
        Returns:
            List of tasks
        """
        tasks = list(self._tasks.values())
        
        if status:
            tasks = [t for t in tasks if t.status == status]
        
        # Sort by created_at descending
        tasks.sort(key=lambda t: t.created_at, reverse=True)
        
        return tasks[:limit]
    
    def update_progress(
        self,
        task_id: str,
        current: int,
        total: int,
        message: str = ""
    ):
        """
        Update task progress
        
        Args:
            task_id: Task ID
            current: Current progress
            total: Total steps
            message: Progress message
        """
        task = self._tasks.get(task_id)
        if not task:
            return
        
        percentage = (current / total * 100) if total > 0 else 0
        task.progress = TaskProgress(
            current=current,
            total=total,
            percentage=percentage,
            message=message
        )
        self._persist_tasks()
    
    def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a running task
        
        Args:
            task_id: Task ID
            
        Returns:
            True if cancelled, False otherwise
        """
        task = self._tasks.get(task_id)
        if not task:
            return False
        
        # Do not cancel already-terminal tasks
        if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
            return False

        # Cancel future if running
        future = self._task_futures.get(task_id)
        if future and not future.done():
            future.cancel()
        
        # Update task status
        task.status = TaskStatus.CANCELLED
        task.completed_at = datetime.now()
        self._persist_tasks()
        logger.info(f"Cancelled task {task_id}")
        return True
    
    async def _cleanup_loop(self):
        """Periodically clean up old completed tasks"""
        while self._running:
            try:
                await asyncio.sleep(api_config.task_cleanup_interval)
                self._cleanup_old_tasks()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
    
    def _cleanup_old_tasks(self):
        """Remove old completed/failed tasks"""
        cutoff_time = datetime.now() - timedelta(seconds=api_config.task_retention_time)
        
        tasks_to_remove = []
        for task_id, task in self._tasks.items():
            if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                if task.completed_at and task.completed_at < cutoff_time:
                    tasks_to_remove.append(task_id)
        
        for task_id in tasks_to_remove:
            del self._tasks[task_id]
            if task_id in self._task_futures:
                del self._task_futures[task_id]
        
        if tasks_to_remove:
            self._persist_tasks()
            logger.info(f"Cleaned up {len(tasks_to_remove)} old tasks")

    def _load_tasks(self):
        """Load persisted task snapshots."""
        try:
            if not self._store_path.exists():
                return
            parsed = json.loads(self._store_path.read_text(encoding="utf-8"))
            if not isinstance(parsed, list):
                return

            for raw_task in parsed:
                try:
                    task = Task(**raw_task)
                except Exception as exc:
                    logger.warning(f"Skipping invalid persisted task: {exc}")
                    continue
                if task.status in [TaskStatus.PENDING, TaskStatus.RUNNING]:
                    task.status = TaskStatus.FAILED
                    task.error = "Pixelle 엔진이 재시작되어 진행 중이던 작업을 복구할 수 없습니다."
                    task.completed_at = task.completed_at or datetime.now()
                self._tasks[task.task_id] = task

            if self._tasks:
                logger.info(f"Loaded {len(self._tasks)} persisted tasks")
                self._persist_tasks()
        except Exception as exc:
            logger.warning(f"Failed to load persisted tasks: {exc}")

    def _persist_tasks(self):
        """Persist task snapshots for status recovery after restart."""
        try:
            self._store_path.parent.mkdir(parents=True, exist_ok=True)
            tasks = sorted(
                self._tasks.values(),
                key=lambda task: task.created_at,
                reverse=True,
            )[:500]
            payload = [task.model_dump(mode="json") for task in tasks]
            tmp_path = self._store_path.with_suffix(
                f"{self._store_path.suffix}.{os.getpid()}.{int(datetime.now().timestamp() * 1000)}.tmp"
            )
            tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp_path.replace(self._store_path)
        except Exception as exc:
            logger.warning(f"Failed to persist tasks: {exc}")


# Global task manager instance
task_manager = TaskManager()

