"""PostgreSQL repository for purchase-request drafts and their outbox events.

Task 0002, phase 3, step 1. NOT CONNECTED TO THE APP YET: nothing but the tests imports this
module. ``create_app`` still uses the in-memory repository, and the API still reports the
frozen contract value ``storage_mode: "in_memory_dev"``. Wiring this in needs a separate,
approved step (and a decision about that wire value).

Rules this module follows:

* It reads no environment and no file. The caller hands it a **connection factory**, a function
  that returns a new connection. ``make_connection_factory`` builds one from a connection string.
* Every SQL statement is a constant string with ``%s`` placeholders. Values travel as
  parameters. No SQL text is ever built from data (a test enforces this).
* One short-lived connection per operation, closed afterwards. There is no pool, because a
  serverless function cannot keep one. ``prepare_threshold=None`` turns off server-side
  prepared statements, which a connection pooler may not support (psycopg documentation).
* ``add`` stores the draft and its outbox event in ONE transaction: both rows are committed
  together or neither is.

Durable only as far as the database is. It approves, releases and sends nothing.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any

import psycopg
from psycopg.errors import SequenceGeneratorLimitExceeded
from psycopg.types.json import Jsonb

from app.modules.requests.domain import (
    Draft,
    PurchaseRequestData,
    format_request_id,
)
from app.modules.requests.events import EventStatus, OutboxEvent

ConnectionFactory = Callable[[], psycopg.Connection[Any]]

_STATEMENT_TIMEOUT_MS = 5000

# ---- SQL: constants only. Placeholders (%s) are filled by the driver, never by string building. --

_SET_TIMEOUT = "SELECT set_config('statement_timeout', %s, true)"  # true = this transaction only

_NEXT_ID = "SELECT nextval('purchase_request_seq')"

_INSERT_DRAFT = (
    "INSERT INTO purchase_requests "
    "(id, created_at, description, quantity, unit_price, currency, "
    "requester_display_name, estimated_total, status) "
    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
)

_INSERT_EVENT = (
    "INSERT INTO outbox_events "
    "(event_id, type, payload, status, attempts, next_attempt_at) "
    "VALUES (%s, %s, %s, %s, %s, %s)"
)

_SELECT_DUE = (
    "SELECT event_id, type, payload, status, attempts, next_attempt_at "
    "FROM outbox_events WHERE status = %s AND next_attempt_at <= %s "
    "ORDER BY next_attempt_at LIMIT %s"
)

_UPDATE_EVENT = (
    "UPDATE outbox_events "
    "SET status = %s, attempts = %s, next_attempt_at = COALESCE(%s::timestamptz, next_attempt_at) "
    "WHERE event_id = %s"
)

_SELECT_DRAFTS = (
    "SELECT id, created_at, description, quantity, unit_price, currency, "
    "requester_display_name, estimated_total "
    "FROM purchase_requests ORDER BY id"
)

_SELECT_EVENTS = (
    "SELECT event_id, type, payload, status, attempts, next_attempt_at "
    "FROM outbox_events ORDER BY next_attempt_at, event_id"
)


def make_connection_factory(dsn: str, *, connect_timeout: int = 5) -> ConnectionFactory:
    """Return a function that opens a new connection to ``dsn``.

    ``dsn`` is a secret. This module never logs it, prints it or puts it in an error message.
    """

    def connect() -> psycopg.Connection[Any]:
        return psycopg.connect(dsn, connect_timeout=connect_timeout, prepare_threshold=None)

    return connect


def _row_to_event(row: tuple[Any, ...]) -> OutboxEvent:
    return OutboxEvent(
        event_id=row[0],
        type=row[1],
        payload=dict(row[2]),
        status=EventStatus(row[3]),
        attempts=row[4],
        next_attempt_at=row[5],
    )


def _row_to_draft(row: tuple[Any, ...]) -> Draft:
    return Draft(
        id=row[0],
        created_at=row[1],
        data=PurchaseRequestData(
            description=row[2],
            quantity=row[3],
            unit_price=row[4],
            currency=row[5],
            requester_display_name=row[6],
        ),
        estimated_total=row[7],
    )


class PostgresRequestRepository:
    """Implements ``RequestRepository`` and ``OutboxPort`` on PostgreSQL."""

    # A label for people and tests. It is NOT the value the API puts on the wire (see the
    # module docstring): the frozen contract still says "in_memory_dev".
    storage_mode = "postgres"

    def __init__(self, connect: ConnectionFactory) -> None:
        self._connect = connect

    # ---- RequestRepository -------------------------------------------------------------------

    def add(self, draft: Draft, event: OutboxEvent) -> None:
        # Leaving the ``with`` block normally commits. Any exception rolls back, so the draft
        # and its event are stored together or not at all.
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(_SET_TIMEOUT, (str(_STATEMENT_TIMEOUT_MS),))
            cur.execute(
                _INSERT_DRAFT,
                (
                    draft.id,
                    draft.created_at,
                    draft.data.description,
                    draft.data.quantity,
                    draft.data.unit_price,
                    draft.data.currency,
                    draft.data.requester_display_name,
                    draft.estimated_total,
                    draft.status,
                ),
            )
            cur.execute(
                _INSERT_EVENT,
                (
                    event.event_id,
                    event.type,
                    Jsonb(event.payload),
                    event.status.value,
                    event.attempts,
                    event.next_attempt_at,
                ),
            )

    # ---- OutboxPort --------------------------------------------------------------------------

    def list_due(self, now: datetime, limit: int) -> list[OutboxEvent]:
        # Read-only listing, not a claim: safe only with ONE dispatcher. Several dispatchers
        # would need a real claim (for example SELECT ... FOR UPDATE SKIP LOCKED).
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(_SET_TIMEOUT, (str(_STATEMENT_TIMEOUT_MS),))
            cur.execute(_SELECT_DUE, (EventStatus.PENDING.value, now, limit))
            rows = cur.fetchall()
        return [_row_to_event(row) for row in rows]

    def mark_dispatched(self, event_id: str, attempts: int) -> None:
        self._update(event_id, EventStatus.DISPATCHED, attempts, None)

    def mark_retry(self, event_id: str, attempts: int, next_attempt_at: datetime) -> None:
        self._update(event_id, EventStatus.PENDING, attempts, next_attempt_at)

    def mark_failed(self, event_id: str, attempts: int) -> None:
        self._update(event_id, EventStatus.FAILED, attempts, None)

    def _update(
        self,
        event_id: str,
        status: EventStatus,
        attempts: int,
        next_attempt_at: datetime | None,
    ) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(_SET_TIMEOUT, (str(_STATEMENT_TIMEOUT_MS),))
            cur.execute(_UPDATE_EVENT, (status.value, attempts, next_attempt_at, event_id))
            if cur.rowcount == 0:
                raise KeyError(event_id)  # same behaviour as the in-memory repository

    # ---- Read access for tests and diagnostics only (no route uses these) ----------------------

    def drafts(self) -> list[Draft]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(_SELECT_DRAFTS)
            rows = cur.fetchall()
        return [_row_to_draft(row) for row in rows]

    def events(self) -> list[OutboxEvent]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(_SELECT_EVENTS)
            rows = cur.fetchall()
        return [_row_to_event(row) for row in rows]


class PostgresRequestIdGenerator:
    """Hands out request IDs from the database sequence ``purchase_request_seq``.

    IDs are unique across every process that shares the database. A failed insert after an
    ID was handed out leaves a gap, which is normal for a sequence. The sequence stops at
    999999 and never wraps (see the migration), which is reported as ``OverflowError``, the
    same error the in-memory generator raises.
    """

    def __init__(self, connect: ConnectionFactory) -> None:
        self._connect = connect

    def next_id(self, moment: datetime) -> str:
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute(_NEXT_ID)
                row = cur.fetchone()
        except SequenceGeneratorLimitExceeded as exc:
            raise OverflowError("request id sequence exhausted") from exc
        if row is None:
            raise RuntimeError("the id sequence returned no value")
        return format_request_id(moment, int(row[0]))
