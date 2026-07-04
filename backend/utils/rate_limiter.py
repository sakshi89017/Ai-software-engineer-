"""
Basic abuse protection for the two endpoints that cost real money/disk on
every call: POST /api/chat/message (hits OpenAI) and POST /api/files/upload
(hits disk). Everything else (auth, chat CRUD, file listing/deletion) is
left unthrottled per the Step 6 spec.

Storage choice: in-memory, per-process counters (Step 6 design decision)
--------------------------------------------------------------------------
`docker-compose.yml` runs a single `backend` container with a single
`uvicorn` process (see backend/Dockerfile — no `--workers` flag), so a
plain in-process dict is sufficient: there's only one process's memory to
keep consistent, and it disappears with the same lifecycle as the app
itself (no stale rows to clean up). This avoids the cost a DB-backed table
would add on the hot path — an extra write to Postgres on every single
chat message and file upload, for data nobody needs to query or persist
across restarts.

The tradeoff, spelled out for whoever scales this next: this does **not**
work across multiple backend replicas or processes, since each process
gets its own counters. If DevPilot AI moves to `--workers > 1` or multiple
containers behind a load balancer, this must move to a shared store
(Redis, or a `rate_limits` table) so all processes see the same counts.
That is noted as a forward-looking caveat in PROJECT_STATE.md, not a bug
in the current single-process deployment target.
"""

import os
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import Depends, HTTPException, status

from auth.dependencies import get_current_user
from models.user import User


class InMemoryRateLimiter:
    """Per-key fixed-window-ish sliding counter, safe for concurrent requests."""

    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        """
        Records a hit for `key` if under `limit` within the trailing
        `window_seconds`. Returns (allowed, retry_after_seconds).
        """
        now = time.time()
        with self._lock:
            hits = self._hits[key]
            cutoff = now - window_seconds
            while hits and hits[0] < cutoff:
                hits.popleft()

            if len(hits) >= limit:
                retry_after = int(hits[0] + window_seconds - now) + 1
                return False, max(retry_after, 1)

            hits.append(now)
            return True, 0


# Two independent limiters so a burst of chat messages can't also lock a
# user out of uploading (and vice versa).
_chat_limiter = InMemoryRateLimiter()
_upload_limiter = InMemoryRateLimiter()


def _limit_from_env(var_name: str, default: int) -> int:
    raw = os.getenv(var_name)
    if raw is None:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def enforce_chat_rate_limit(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency for POST /api/chat/message. Drop-in replacement for
    `get_current_user` — returns the same User on success, raises 429 on
    limit exceeded. Configurable via CHAT_RATE_LIMIT_PER_MINUTE (default 15).
    """
    limit = _limit_from_env("CHAT_RATE_LIMIT_PER_MINUTE", 15)
    allowed, retry_after = _chat_limiter.check(str(current_user.id), limit, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You're sending messages too quickly (limit: {limit} per minute). "
                f"Please wait {retry_after}s and try again."
            ),
            headers={"Retry-After": str(retry_after)},
        )
    return current_user


def enforce_upload_rate_limit(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency for POST /api/files/upload. Configurable via
    UPLOAD_RATE_LIMIT_PER_MINUTE (default 10).
    """
    limit = _limit_from_env("UPLOAD_RATE_LIMIT_PER_MINUTE", 10)
    allowed, retry_after = _upload_limiter.check(str(current_user.id), limit, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You're uploading files too quickly (limit: {limit} per minute). "
                f"Please wait {retry_after}s and try again."
            ),
            headers={"Retry-After": str(retry_after)},
        )
    return current_user
