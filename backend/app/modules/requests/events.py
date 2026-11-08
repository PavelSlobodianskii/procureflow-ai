"""Outbox event types, the outbox interface and the pure backoff function.

This is an event-driven SEAM inside one process, not a durable transactional outbox.
Events live in memory and are lost on restart (DEV ONLY). The real outbox needs a
database and is a separate, not yet approved, task.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

DRAFTED_EVENT_TYPE = "purchase_request.drafted"


class EventStatus(StrEnum):
    PENDING = "pending"
    DISPATCHED = "dispatched"
    FAILED = "failed"


@dataclass(frozen=True)
class OutboxEvent:
    event_id: str
    type: str
    payload: dict[str, str]  # holds the request ID only, never request content
    status: EventStatus
    attempts: int
    next_attempt_at: datetime


def new_drafted_event(event_id: str, request_id: str, now: datetime) -> OutboxEvent:
    return OutboxEvent(
        event_id=event_id,
        type=DRAFTED_EVENT_TYPE,
        payload={"request_id": request_id},
        status=EventStatus.PENDING,
        attempts=0,
        next_attempt_at=now,
    )


class OutboxPort(Protocol):
    """What the dispatcher needs from an event store."""

    def claim_due(self, now: datetime, limit: int) -> list[OutboxEvent]:
        """Pending events whose ``next_attempt_at`` is not after ``now``."""
        ...

    def mark_dispatched(self, event_id: str, attempts: int) -> None: ...

    def mark_retry(self, event_id: str, attempts: int, next_attempt_at: datetime) -> None: ...

    def mark_failed(self, event_id: str, attempts: int) -> None: ...


def backoff_delay(
    attempt: int,
    rand: Callable[[], float],
    *,
    base: float = 0.5,
    factor: float = 2.0,
    cap: float = 30.0,
) -> float:
    """Exponential backoff with full jitter, in seconds.

    ``attempt`` is the number of the attempt that just failed (1 for the first failure).
    The result is uniform in ``[0, min(cap, base * factor ** (attempt - 1))]``.
    Pure: the randomness (``rand`` returns a float in ``[0, 1)``) is injected.
    """
    if attempt < 1:
        raise ValueError("attempt must be at least 1")
    ceiling = min(cap, base * factor ** (attempt - 1))
    return rand() * ceiling
