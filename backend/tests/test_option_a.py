"""Option A: repository + outbox, in-process dispatcher, bounded backoff."""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.modules.requests.dispatcher import Dispatcher, log_event_handler
from app.modules.requests.domain import Draft, PurchaseRequestData, RequestIdGenerator
from app.modules.requests.events import (
    DRAFTED_EVENT_TYPE,
    EventStatus,
    OutboxEvent,
    backoff_delay,
    new_drafted_event,
)
from app.modules.requests.repository import RequestRepository
from app.modules.requests.repository_memory import InMemoryRequestRepository
from app.modules.requests.service import RequestService
from app.platform.settings import Settings
from tests.helpers import FIXED_NOW, FakeClock, post_json, valid_body


def make_data() -> PurchaseRequestData:
    return PurchaseRequestData("Synthetic chairs", 2, Decimal("10.00"), "EUR", "Alex Example")


def seed_event(repo: InMemoryRequestRepository, clock: FakeClock) -> str:
    service = RequestService(repo, RequestIdGenerator(), clock)
    draft = service.create_draft(make_data())
    return draft.id


# ---- repository --------------------------------------------------------------------------------


def test_repository_interface_has_exactly_one_write_method() -> None:
    public = {
        name
        for name, _ in inspect.getmembers(RequestRepository, inspect.isfunction)
        if not name.startswith("_")
    }
    assert public == {"add"}


def test_add_stores_draft_and_event_together(
    client: TestClient, repo: InMemoryRequestRepository
) -> None:
    response = post_json(client, valid_body())
    request_id = response.json()["id"]

    drafts, events = repo.drafts(), repo.events()
    assert [d.id for d in drafts] == [request_id]
    assert len(events) == 1
    event = events[0]
    assert event.type == DRAFTED_EVENT_TYPE == "purchase_request.drafted"
    assert event.payload == {"request_id": request_id}  # the ID only, no request content
    assert event.status is EventStatus.PENDING
    assert event.attempts == 0
    assert event.next_attempt_at == FIXED_NOW
    assert event.event_id


def test_each_draft_has_exactly_one_event(
    client: TestClient, repo: InMemoryRequestRepository
) -> None:
    for _ in range(5):
        post_json(client, valid_body())
    assert {d.id for d in repo.drafts()} == {e.payload["request_id"] for e in repo.events()}
    assert len(repo.events()) == 5


def test_in_memory_storage_is_labelled(client: TestClient, repo: InMemoryRequestRepository) -> None:
    assert InMemoryRequestRepository.storage_mode == "in_memory_dev"
    assert "DEV ONLY" in (inspect.getmodule(InMemoryRequestRepository).__doc__ or "")
    assert "DEV ONLY" in (InMemoryRequestRepository.__doc__ or "")
    assert client.get("/health").json()["storage_mode"] == "in_memory_dev"
    assert post_json(client, valid_body()).json()["storage_mode"] == "in_memory_dev"


def test_startup_logs_a_dev_only_warning(caplog: pytest.LogCaptureFixture) -> None:
    app = create_app(start_dispatcher=False)
    with caplog.at_level(logging.WARNING, logger="procureflow.api"), TestClient(app):
        pass
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("DEV ONLY" in r.getMessage() and "in_memory_dev" in r.getMessage() for r in warnings)


# ---- backoff (pure) ----------------------------------------------------------------------------


def test_backoff_ceilings_double_then_cap_at_30() -> None:
    ceilings = [backoff_delay(n, lambda: 1.0) for n in range(1, 9)]
    assert ceilings == [0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 30.0, 30.0]


def test_backoff_uses_full_jitter_from_injected_randomness() -> None:
    assert backoff_delay(3, lambda: 0.0) == 0.0
    assert backoff_delay(3, lambda: 0.5) == pytest.approx(1.0)
    assert backoff_delay(3, lambda: 0.999) == pytest.approx(1.998)
    assert backoff_delay(20, lambda: 0.5) == pytest.approx(15.0)  # capped ceiling of 30


def test_backoff_is_pure_and_validates_input() -> None:
    assert backoff_delay(2, lambda: 0.25) == backoff_delay(2, lambda: 0.25)
    with pytest.raises(ValueError):
        backoff_delay(0, lambda: 0.5)


def test_default_limits_match_the_brief() -> None:
    settings = Settings()
    assert settings.max_body_bytes == 16384
    assert settings.handler_timeout_seconds == 2.0
    assert (settings.backoff_base_seconds, settings.backoff_factor) == (0.5, 2.0)
    assert settings.backoff_cap_seconds == 30.0
    assert settings.max_attempts == 5


# ---- dispatcher --------------------------------------------------------------------------------


def run(coro):
    return asyncio.run(coro)


def event_of(repo: InMemoryRequestRepository) -> OutboxEvent:
    (event,) = repo.events()
    return event


def test_dispatcher_marks_successful_events_dispatched(clock: FakeClock) -> None:
    repo = InMemoryRequestRepository()
    seed_event(repo, clock)
    handled: list[OutboxEvent] = []

    async def handler(event: OutboxEvent) -> None:
        handled.append(event)

    assert run(Dispatcher(repo, handler, clock=clock).run_once()) == 1
    assert event_of(repo).status is EventStatus.DISPATCHED
    assert event_of(repo).attempts == 1
    assert len(handled) == 1
    # A dispatched event is never handled again.
    assert run(Dispatcher(repo, handler, clock=clock).run_once()) == 0
    assert len(handled) == 1


def test_default_handler_is_a_logging_no_op(
    clock: FakeClock, caplog: pytest.LogCaptureFixture
) -> None:
    repo = InMemoryRequestRepository()
    seed_event(repo, clock)
    with caplog.at_level(logging.INFO, logger="procureflow.dispatcher"):
        run(Dispatcher(repo, log_event_handler, clock=clock).run_once())
    assert event_of(repo).status is EventStatus.DISPATCHED
    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "purchase_request.drafted" in messages
    assert "Synthetic chairs" not in messages and "Alex" not in messages  # no request content


def test_failing_handler_retries_with_backoff_then_fails_after_5_attempts(clock: FakeClock) -> None:
    repo = InMemoryRequestRepository()
    seed_event(repo, clock)
    calls = 0

    async def always_fails(event: OutboxEvent) -> None:
        nonlocal calls
        calls += 1
        raise RuntimeError("boom")

    dispatcher = Dispatcher(repo, always_fails, clock=clock, rand=lambda: 0.5)

    expected_delays = [0.25, 0.5, 1.0, 2.0]  # 0.5 x ceilings 0.5, 1, 2, 4
    for attempt, delay in enumerate(expected_delays, start=1):
        assert run(dispatcher.run_once()) == 1
        event = event_of(repo)
        assert (event.status, event.attempts) == (EventStatus.PENDING, attempt)
        assert event.next_attempt_at == clock.now + timedelta(seconds=delay)
        # Not due yet: nothing happens until the clock reaches next_attempt_at.
        assert run(dispatcher.run_once()) == 0
        assert calls == attempt
        clock.now = event.next_attempt_at

    assert run(dispatcher.run_once()) == 1  # 5th attempt
    assert (event_of(repo).status, event_of(repo).attempts) == (EventStatus.FAILED, 5)
    clock.advance(3600)
    assert run(dispatcher.run_once()) == 0  # failed is final: no 6th attempt
    assert calls == 5


def test_handler_that_recovers_is_dispatched(clock: FakeClock) -> None:
    repo = InMemoryRequestRepository()
    seed_event(repo, clock)
    calls = 0

    async def flaky(event: OutboxEvent) -> None:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise RuntimeError("temporary")

    dispatcher = Dispatcher(repo, flaky, clock=clock, rand=lambda: 0.0)  # zero delay
    for _ in range(3):
        run(dispatcher.run_once())
    assert (event_of(repo).status, event_of(repo).attempts) == (EventStatus.DISPATCHED, 3)


def test_handler_over_the_timeout_counts_as_a_failure(clock: FakeClock) -> None:
    repo = InMemoryRequestRepository()
    seed_event(repo, clock)

    async def too_slow(event: OutboxEvent) -> None:
        await asyncio.sleep(5)

    settings = Settings(handler_timeout_seconds=0.05)
    started = time.monotonic()
    run(Dispatcher(repo, too_slow, settings=settings, clock=clock, rand=lambda: 0.5).run_once())
    assert time.monotonic() - started < 2
    assert (event_of(repo).status, event_of(repo).attempts) == (EventStatus.PENDING, 1)


def test_new_event_starts_pending_and_due_immediately() -> None:
    event = new_drafted_event("e-1", "PR-2026-000001", FIXED_NOW)
    assert (event.status, event.attempts, event.next_attempt_at) == (
        EventStatus.PENDING,
        0,
        FIXED_NOW,
    )


def test_service_stores_a_draft(clock: FakeClock) -> None:
    repo = InMemoryRequestRepository()
    draft = RequestService(repo, RequestIdGenerator(), clock).create_draft(make_data())
    assert isinstance(draft, Draft)
    assert draft.status == "draft"
    assert draft.estimated_total == Decimal("20.00")


def test_background_dispatcher_runs_inside_the_app_lifespan() -> None:
    repo = InMemoryRequestRepository()
    handled: list[str] = []

    async def handler(event: OutboxEvent) -> None:
        handled.append(event.payload["request_id"])

    app = create_app(
        repository=repo, handler=handler, settings=Settings(dispatcher_poll_seconds=0.01)
    )
    with TestClient(app) as client:
        request_id = post_json(client, valid_body()).json()["id"]
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and event_of(repo).status is not EventStatus.DISPATCHED:
            time.sleep(0.02)
    assert event_of(repo).status is EventStatus.DISPATCHED
    assert handled == [request_id]
