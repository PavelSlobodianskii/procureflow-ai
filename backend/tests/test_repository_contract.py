"""One behaviour test for every repository: in-memory (always) and PostgreSQL (owner-run).

The PostgreSQL variant runs only when ``TEST_DATABASE_URL`` is set in the shell of whoever runs
the tests. Its value is a secret: it is never written to a file, a log or a test message. Use a
throw-away database or a Neon branch that already has ``migrations/0001_purchase_requests.sql``
applied. The tests never truncate or drop anything. They delete only the rows they created.

Without the variable the PostgreSQL variant is SKIPPED, which means "not run", not "passed".
"""

from __future__ import annotations

import os
import re
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from app.modules.requests.domain import (
    Draft,
    PurchaseRequestData,
    RequestIdGenerator,
    RequestIdSource,
)
from app.modules.requests.events import EventStatus, OutboxEvent
from app.modules.requests.repository_memory import InMemoryRequestRepository
from app.modules.requests.repository_postgres import (
    PostgresRequestIdGenerator,
    PostgresRequestRepository,
    make_connection_factory,
)
from app.modules.requests.service import RequestService
from tests.helpers import FIXED_NOW, FakeClock

# The one place this test file touches the database directly, and only for rows it created.
_DELETE_EVENTS = "DELETE FROM outbox_events WHERE event_id = ANY(%s)"
_DELETE_DRAFTS = "DELETE FROM purchase_requests WHERE id = ANY(%s)"


@dataclass
class Store:
    # Typed loosely on purpose: drafts() and events() are diagnostic readers that both the
    # in-memory and the PostgreSQL repository offer, but the interfaces do not list them.
    repository: Any
    ids: RequestIdSource
    clock: FakeClock = field(default_factory=FakeClock)
    event_ids: list[str] = field(default_factory=list)

    def _new_event_id(self) -> str:
        event_id = f"test-{uuid.uuid4()}"
        self.event_ids.append(event_id)
        return event_id

    def create(self, **changes: object) -> Draft:
        values: dict[str, object] = {
            "description": "Synthetic office chairs, model A",
            "quantity": 10,
            "unit_price": Decimal("249.90"),
            "currency": "EUR",
            "requester_display_name": "Alex Example",
        }
        values.update(changes)
        service = RequestService(
            self.repository, self.ids, self.clock, event_id_factory=self._new_event_id
        )
        return service.create_draft(PurchaseRequestData(**values))  # type: ignore[arg-type]

    def own_events(self) -> list[OutboxEvent]:
        return [e for e in self.repository.events() if e.event_id in self.event_ids]

    def own_due(self, now: datetime) -> list[str]:
        due = self.repository.list_due(now, 1000)
        return [e.event_id for e in due if e.event_id in self.event_ids]


@pytest.fixture(params=["memory", "postgres"])
def store(request: pytest.FixtureRequest) -> Iterator[Store]:
    if request.param == "memory":
        yield Store(InMemoryRequestRepository(), RequestIdGenerator())
        return

    dsn = os.environ.get("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("TEST_DATABASE_URL is not set: the PostgreSQL variant is owner-run (not run)")
    connect = make_connection_factory(dsn)
    postgres_store = Store(PostgresRequestRepository(connect), PostgresRequestIdGenerator(connect))
    yield postgres_store

    # Clean up only what this test created: its events, and the drafts those events point to.
    request_ids = [event.payload["request_id"] for event in postgres_store.own_events()]
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(_DELETE_EVENTS, (postgres_store.event_ids,))
        cursor.execute(_DELETE_DRAFTS, (request_ids,))


def test_a_draft_round_trips_with_exact_values(store: Store) -> None:
    draft = store.create()
    found = [d for d in store.repository.drafts() if d.id == draft.id]  # type: ignore[attr-defined]

    assert found == [draft]
    assert found[0].data.unit_price == Decimal("249.90")
    assert found[0].estimated_total == Decimal("2499.00")
    assert found[0].status == "draft"


def test_the_event_is_stored_with_its_draft(store: Store) -> None:
    draft = store.create()
    events = store.own_events()

    assert len(events) == 1
    event = events[0]
    assert event.type == "purchase_request.drafted"
    assert event.payload == {"request_id": draft.id}  # the ID only, no request content
    assert event.status is EventStatus.PENDING
    assert event.attempts == 0
    assert event.next_attempt_at == FIXED_NOW


def test_ids_are_distinct_and_correctly_formatted(store: Store) -> None:
    first, second = store.create(), store.create()

    assert first.id != second.id
    for draft in (first, second):
        assert re.fullmatch(r"PR-2026-[0-9]{6}", draft.id)


def test_an_event_is_due_only_from_its_scheduled_time(store: Store) -> None:
    store.create()

    assert store.own_due(FIXED_NOW) == store.event_ids
    assert store.own_due(FIXED_NOW - timedelta(seconds=1)) == []


def test_a_dispatched_event_is_no_longer_due(store: Store) -> None:
    store.create()
    event_id = store.event_ids[0]

    store.repository.mark_dispatched(event_id, 1)

    assert store.own_due(FIXED_NOW + timedelta(days=1)) == []
    assert [(e.status, e.attempts) for e in store.own_events()] == [(EventStatus.DISPATCHED, 1)]


def test_a_retried_event_is_due_again_only_after_the_new_time(store: Store) -> None:
    store.create()
    event_id = store.event_ids[0]
    later = FIXED_NOW + timedelta(seconds=30)

    store.repository.mark_retry(event_id, 1, later)

    assert store.own_due(FIXED_NOW + timedelta(seconds=29)) == []
    assert store.own_due(later) == [event_id]
    assert [(e.status, e.attempts, e.next_attempt_at) for e in store.own_events()] == [
        (EventStatus.PENDING, 1, later)
    ]


def test_a_failed_event_is_final(store: Store) -> None:
    store.create()
    event_id = store.event_ids[0]

    store.repository.mark_failed(event_id, 5)

    assert store.own_due(FIXED_NOW + timedelta(days=365)) == []
    assert [(e.status, e.attempts) for e in store.own_events()] == [(EventStatus.FAILED, 5)]


def test_updating_an_unknown_event_is_a_key_error(store: Store) -> None:
    with pytest.raises(KeyError):
        store.repository.mark_failed(f"test-missing-{uuid.uuid4()}", 1)
