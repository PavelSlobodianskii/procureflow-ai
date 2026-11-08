"""In-memory repository. DEV ONLY.

Data lives in this process and is lost on restart. Nothing here is durable, and it is
not a real transactional outbox. One lock stands in for a database transaction.
"""

from __future__ import annotations

import threading
from dataclasses import replace
from datetime import datetime

from app.modules.requests.domain import Draft
from app.modules.requests.events import EventStatus, OutboxEvent


class InMemoryRequestRepository:
    """DEV ONLY storage. Implements ``RequestRepository`` and ``OutboxPort``."""

    storage_mode = "in_memory_dev"

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._drafts: dict[str, Draft] = {}
        self._events: dict[str, OutboxEvent] = {}

    # ---- RequestRepository -------------------------------------------------------------------

    def add(self, draft: Draft, event: OutboxEvent) -> None:
        with self._lock:  # draft and event become visible together
            self._drafts[draft.id] = draft
            self._events[event.event_id] = event

    # ---- OutboxPort --------------------------------------------------------------------------

    def claim_due(self, now: datetime, limit: int) -> list[OutboxEvent]:
        with self._lock:
            due = [
                event
                for event in self._events.values()
                if event.status is EventStatus.PENDING and event.next_attempt_at <= now
            ]
        due.sort(key=lambda event: event.next_attempt_at)
        return due[:limit]

    def mark_dispatched(self, event_id: str, attempts: int) -> None:
        self._update(event_id, status=EventStatus.DISPATCHED, attempts=attempts)

    def mark_retry(self, event_id: str, attempts: int, next_attempt_at: datetime) -> None:
        self._update(
            event_id,
            status=EventStatus.PENDING,
            attempts=attempts,
            next_attempt_at=next_attempt_at,
        )

    def mark_failed(self, event_id: str, attempts: int) -> None:
        self._update(event_id, status=EventStatus.FAILED, attempts=attempts)

    def _update(self, event_id: str, **changes: object) -> None:
        with self._lock:
            self._events[event_id] = replace(self._events[event_id], **changes)  # type: ignore[arg-type]

    # ---- Read access for tests and diagnostics only (no route uses these) ----------------------

    def drafts(self) -> list[Draft]:
        with self._lock:
            return list(self._drafts.values())

    def events(self) -> list[OutboxEvent]:
        with self._lock:
            return list(self._events.values())
