"""A slow, blocking database write must not freeze the server (task 0002, decision D10).

``create_draft`` is synchronous and will talk to a database. The route runs it in a worker
thread (``run_in_threadpool``). These tests use a repository whose ``add`` blocks on purpose
(``time.sleep``), the way a slow database call would, and measure what the event loop does.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any

import httpx

from app.main import create_app
from app.modules.requests.domain import Draft
from app.modules.requests.events import OutboxEvent
from app.modules.requests.repository_memory import InMemoryRequestRepository
from tests.helpers import JSON_HEADERS, FakeClock, valid_body


class SlowRepository(InMemoryRequestRepository):
    """``add`` blocks the calling thread, like a slow synchronous database call."""

    def __init__(self, delay: float) -> None:
        super().__init__()
        self._delay = delay
        self.threads: list[int] = []

    def add(self, draft: Draft, event: OutboxEvent) -> None:
        self.threads.append(threading.get_ident())
        time.sleep(self._delay)
        super().add(draft, event)


async def post_while_watching_the_loop(
    repository: SlowRepository, posts: int
) -> tuple[list[float], list[int], float, int]:
    """Send ``posts`` writes plus one /health at once and watch the event loop meanwhile.

    Returns the gaps between 10 ms heartbeats, the status codes, the wall time and the
    thread the event loop runs in.
    """
    app = create_app(repository=repository, clock=FakeClock(), start_dispatcher=False)
    loop = asyncio.get_running_loop()
    gaps: list[float] = []
    stop = asyncio.Event()

    async def heartbeat() -> None:
        last = loop.time()
        while not stop.is_set():
            await asyncio.sleep(0.01)
            now = loop.time()
            gaps.append(now - last)
            last = now

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        beat = asyncio.create_task(heartbeat())
        await asyncio.sleep(0.05)  # let the heartbeat settle
        started = loop.time()
        responses: list[Any] = await asyncio.gather(
            *[
                client.post(
                    "/api/v1/requests", content=json.dumps(valid_body()), headers=JSON_HEADERS
                )
                for _ in range(posts)
            ],
            client.get("/health"),
        )
        elapsed = loop.time() - started
        stop.set()
        await beat
    return gaps, [r.status_code for r in responses], elapsed, threading.get_ident()


def test_a_blocking_write_does_not_freeze_the_event_loop() -> None:
    repository = SlowRepository(delay=0.5)
    gaps, statuses, elapsed, _ = asyncio.run(post_while_watching_the_loop(repository, posts=1))

    assert statuses == [201, 200]  # the write and /health both succeeded
    assert elapsed >= 0.5  # the slow path really ran
    # Without the thread offload the loop would be frozen for the whole 0.5 s, one huge gap.
    assert max(gaps) < 0.3, f"the event loop stalled for {max(gaps):.2f} s"


def test_writes_run_in_parallel_instead_of_one_after_another() -> None:
    repository = SlowRepository(delay=0.4)
    _, statuses, elapsed, _ = asyncio.run(post_while_watching_the_loop(repository, posts=3))

    assert statuses == [201, 201, 201, 200]
    assert len(repository.drafts()) == 3
    assert elapsed < 0.9, (
        f"3 writes of 0.4 s took {elapsed:.2f} s (one after another would be 1.2 s)"
    )


def test_create_draft_runs_in_a_worker_thread_not_in_the_event_loop_thread() -> None:
    repository = SlowRepository(delay=0.0)
    _, statuses, _, loop_thread = asyncio.run(post_while_watching_the_loop(repository, posts=1))

    assert statuses == [201, 200]
    assert repository.threads
    assert loop_thread not in repository.threads  # the write did not run on the loop's thread


def test_a_failing_write_still_gives_the_generic_500_problem() -> None:
    class Failing(SlowRepository):
        def add(self, draft: Draft, event: OutboxEvent) -> None:
            raise RuntimeError("boom with secret internals")

    async def run() -> httpx.Response:
        app = create_app(repository=Failing(0.0), clock=FakeClock(), start_dispatcher=False)
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post(
                "/api/v1/requests", content=json.dumps(valid_body()), headers=JSON_HEADERS
            )

    response = asyncio.run(run())
    assert response.status_code == 500
    assert response.json()["type"] == "urn:procureflow:problem:internal-error"
    assert "boom" not in response.text and "secret" not in response.text  # nothing leaks
