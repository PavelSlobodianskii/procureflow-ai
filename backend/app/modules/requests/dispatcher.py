"""In-process outbox dispatcher (DEV ONLY seam, not a separate worker).

It polls pending events and calls a handler. The only handler is a no-op that logs the
event. It approves nothing and calls nothing external.
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

from app.modules.requests import domain
from app.modules.requests.events import OutboxEvent, OutboxPort, backoff_delay
from app.platform.settings import Settings

logger = logging.getLogger("procureflow.dispatcher")

EventHandler = Callable[[OutboxEvent], Awaitable[None]]

_BATCH_SIZE = 50


async def log_event_handler(event: OutboxEvent) -> None:
    """The only handler in this slice: log the event and do nothing else."""
    logger.info("outbox event handled (no-op): type=%s event_id=%s", event.type, event.event_id)


class Dispatcher:
    def __init__(
        self,
        outbox: OutboxPort,
        handler: EventHandler = log_event_handler,
        *,
        settings: Settings | None = None,
        # Full precision on purpose: a whole-second clock would round a 0.25 s retry delay up
        # to the next second and defeat the sub-second jitter.
        clock: Callable[[], datetime] = domain.utc_now,
        rand: Callable[[], float] = random.random,
    ) -> None:
        self._outbox = outbox
        self._handler = handler
        self._settings = settings or Settings()
        self._clock = clock
        self._rand = rand

    async def run_once(self) -> int:
        """Process every event that is due now. Returns how many were attempted."""
        due = self._outbox.list_due(self._clock(), _BATCH_SIZE)
        for event in due:
            await self._attempt(event)
        return len(due)

    async def _attempt(self, event: OutboxEvent) -> None:
        attempts = event.attempts + 1
        try:
            await asyncio.wait_for(
                self._handler(event), timeout=self._settings.handler_timeout_seconds
            )
        except Exception:  # noqa: BLE001 - any handler failure is retried, then marked failed
            if attempts >= self._settings.max_attempts:
                self._outbox.mark_failed(event.event_id, attempts)
                logger.error(
                    "outbox event failed permanently: event_id=%s attempts=%d",
                    event.event_id,
                    attempts,
                )
                return
            delay = backoff_delay(
                attempts,
                self._rand,
                base=self._settings.backoff_base_seconds,
                factor=self._settings.backoff_factor,
                cap=self._settings.backoff_cap_seconds,
            )
            # Read the clock again: earlier events in this batch may have taken up to 2 s each,
            # so a time read before the batch started would be stale.
            retry_at = self._clock() + timedelta(seconds=delay)
            self._outbox.mark_retry(event.event_id, attempts, retry_at)
            logger.warning(
                "outbox event attempt failed: event_id=%s attempts=%d retry_in=%.2fs",
                event.event_id,
                attempts,
                delay,
            )
            return
        self._outbox.mark_dispatched(event.event_id, attempts)

    async def run_forever(self) -> None:
        while True:
            try:
                await self.run_once()
            except Exception:
                logger.exception("dispatcher loop error")
            await asyncio.sleep(self._settings.dispatcher_poll_seconds)
