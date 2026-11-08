"""PostgreSQL adapter, tested with a FAKE connection (no database needed).

This proves the adapter's own behaviour: what SQL it sends, with which parameters, and when it
commits or rolls back. It does NOT prove that PostgreSQL accepts the SQL. That is the job of the
owner-run variant in ``test_repository_contract.py`` (needs ``TEST_DATABASE_URL``).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from psycopg.errors import SequenceGeneratorLimitExceeded
from psycopg.types.json import Jsonb

from app.modules.requests import repository_postgres
from app.modules.requests.domain import Draft, PurchaseRequestData, RequestIdGenerator
from app.modules.requests.events import EventStatus, OutboxEvent, new_drafted_event
from app.modules.requests.repository_postgres import (
    PostgresRequestIdGenerator,
    PostgresRequestRepository,
    make_connection_factory,
)
from app.modules.requests.service import RequestService
from app.platform.settings import STORAGE_MODE
from tests.helpers import FIXED_NOW, FakeClock

REQUEST_ID = "PR-2026-000001"
EVENT_ID = "evt-1"


# ---- a fake connection that records everything ---------------------------------------------------


class FakeCursor:
    def __init__(self, connection: FakeConnection) -> None:
        self._connection = connection
        self._rows: list[tuple[Any, ...]] = []
        self.rowcount = 1

    def __enter__(self) -> FakeCursor:
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> None:
        connection = self._connection
        connection.executed.append((sql, params))
        if connection.fail_on_statement == len(connection.executed):
            raise RuntimeError("simulated database error")
        for fragment, error in connection.raises.items():
            if fragment in sql:
                raise error
        self._rows = list(connection.rows)
        self.rowcount = connection.rowcount

    def fetchall(self) -> list[tuple[Any, ...]]:
        return list(self._rows)

    def fetchone(self) -> tuple[Any, ...] | None:
        return self._rows[0] if self._rows else None


class FakeConnection:
    """Acts like psycopg's connection in a ``with`` block: commit or roll back, then close."""

    def __init__(
        self,
        *,
        fail_on_statement: int | None = None,
        rows: list[tuple[Any, ...]] | None = None,
        rowcount: int = 1,
        raises: dict[str, Exception] | None = None,
    ) -> None:
        self.fail_on_statement = fail_on_statement
        self.rows = rows or []
        self.rowcount = rowcount
        self.raises = raises or {}
        self.executed: list[tuple[str, tuple[Any, ...] | None]] = []
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
        if exc_type is None:
            self.commits += 1
        else:
            self.rollbacks += 1
        self.closed = True
        return False  # never swallow the error


class FakeFactory:
    """A connection factory that remembers every connection it handed out."""

    def __init__(self, **settings: Any) -> None:
        self._settings = settings
        self.connections: list[FakeConnection] = []

    def __call__(self) -> FakeConnection:
        connection = FakeConnection(**self._settings)
        self.connections.append(connection)
        return connection

    @property
    def only(self) -> FakeConnection:
        assert len(self.connections) == 1
        return self.connections[0]


def make_data(**changes: Any) -> PurchaseRequestData:
    values: dict[str, Any] = {
        "description": "Synthetic chairs",
        "quantity": 2,
        "unit_price": Decimal("10.00"),
        "currency": "EUR",
        "requester_display_name": "Alex Example",
    }
    values.update(changes)
    return PurchaseRequestData(**values)


def make_draft(data: PurchaseRequestData | None = None) -> Draft:
    return Draft(
        id=REQUEST_ID,
        created_at=FIXED_NOW,
        data=data or make_data(),
        estimated_total=Decimal("20.00"),
    )


def make_event() -> OutboxEvent:
    return new_drafted_event(EVENT_ID, REQUEST_ID, FIXED_NOW)


def event_row() -> tuple[Any, ...]:
    payload = {"request_id": REQUEST_ID}
    return (EVENT_ID, "purchase_request.drafted", payload, "pending", 0, FIXED_NOW)


# ---- add(): one transaction ----------------------------------------------------------------------


def test_add_runs_both_inserts_in_one_transaction_and_commits() -> None:
    factory = FakeFactory()
    PostgresRequestRepository(factory).add(make_draft(), make_event())

    connection = factory.only
    statements = [sql for sql, _ in connection.executed]
    assert statements[0].startswith("SELECT set_config('statement_timeout'")
    assert statements[1].startswith("INSERT INTO purchase_requests")
    assert statements[2].startswith("INSERT INTO outbox_events")
    assert len(statements) == 3
    assert (connection.commits, connection.rollbacks) == (1, 0)  # one commit for both rows
    assert connection.closed


def test_add_sends_the_draft_values_as_parameters_without_floats() -> None:
    factory = FakeFactory()
    PostgresRequestRepository(factory).add(make_draft(), make_event())

    _, params = factory.only.executed[1]
    assert params == (
        REQUEST_ID,
        FIXED_NOW,
        "Synthetic chairs",
        2,
        Decimal("10.00"),
        "EUR",
        "Alex Example",
        Decimal("20.00"),
        "draft",
    )
    assert not any(isinstance(value, float) for value in params)  # money is never a float


def test_a_failing_event_insert_rolls_back_and_never_commits() -> None:
    factory = FakeFactory(fail_on_statement=3)  # 1 timeout, 2 draft insert, 3 event insert
    with pytest.raises(RuntimeError, match="simulated"):
        PostgresRequestRepository(factory).add(make_draft(), make_event())

    connection = factory.only
    assert (connection.commits, connection.rollbacks) == (0, 1)
    assert connection.closed


def test_a_failing_draft_insert_never_reaches_the_event_insert() -> None:
    factory = FakeFactory(fail_on_statement=2)
    with pytest.raises(RuntimeError):
        PostgresRequestRepository(factory).add(make_draft(), make_event())

    connection = factory.only
    assert len(connection.executed) == 2
    assert (connection.commits, connection.rollbacks) == (0, 1)


def test_hostile_text_is_a_parameter_and_never_part_of_the_sql() -> None:
    hostile = "'); DROP TABLE purchase_requests; --"
    draft = make_draft(make_data(description=hostile, requester_display_name="Robert'); --"))
    factory = FakeFactory()
    PostgresRequestRepository(factory).add(draft, make_event())

    for sql, _ in factory.only.executed:
        assert "DROP" not in sql
        assert hostile not in sql
    _, params = factory.only.executed[1]
    assert hostile in params  # it travels as data, to be escaped by the driver


def test_the_event_payload_is_the_request_id_only() -> None:
    factory = FakeFactory()
    PostgresRequestRepository(factory).add(make_draft(), make_event())

    _, params = factory.only.executed[2]
    assert params is not None
    event_id, event_type, payload, status, attempts, next_attempt_at = params
    assert (event_id, event_type, status, attempts, next_attempt_at) == (
        EVENT_ID,
        "purchase_request.drafted",
        "pending",
        0,
        FIXED_NOW,
    )
    assert isinstance(payload, Jsonb)
    assert payload.obj == {"request_id": REQUEST_ID}  # no description, no price, no name


# ---- outbox port ---------------------------------------------------------------------------------


def test_list_due_maps_rows_to_events_and_passes_parameters() -> None:
    factory = FakeFactory(rows=[event_row()])
    due = PostgresRequestRepository(factory).list_due(FIXED_NOW, 50)

    assert due == [make_event()]
    assert due[0].status is EventStatus.PENDING
    _, params = factory.only.executed[1]
    assert params == ("pending", FIXED_NOW, 50)
    assert factory.only.commits == 1


@pytest.mark.parametrize(
    ("method", "arguments", "expected"),
    [
        ("mark_dispatched", (EVENT_ID, 1), ("dispatched", 1, None, EVENT_ID)),
        ("mark_retry", (EVENT_ID, 2, FIXED_NOW + timedelta(seconds=30)), None),
        ("mark_failed", (EVENT_ID, 5), ("failed", 5, None, EVENT_ID)),
    ],
)
def test_mark_methods_send_the_expected_update(
    method: str, arguments: tuple[Any, ...], expected: tuple[Any, ...] | None
) -> None:
    factory = FakeFactory()
    getattr(PostgresRequestRepository(factory), method)(*arguments)

    sql, params = factory.only.executed[1]
    assert sql.startswith("UPDATE outbox_events")
    if expected is None:  # mark_retry puts the pending state back with a later time
        expected = ("pending", 2, FIXED_NOW + timedelta(seconds=30), EVENT_ID)
    assert params == expected
    assert factory.only.commits == 1


def test_marking_an_unknown_event_raises_key_error_and_rolls_back() -> None:
    factory = FakeFactory(rowcount=0)
    with pytest.raises(KeyError):
        PostgresRequestRepository(factory).mark_failed("no-such-event", 1)

    assert (factory.only.commits, factory.only.rollbacks) == (0, 1)


def test_readers_return_domain_objects() -> None:
    draft_row = (
        REQUEST_ID,
        FIXED_NOW,
        "Synthetic chairs",
        2,
        Decimal("10.00"),
        "EUR",
        "Alex Example",
        Decimal("20.00"),
    )
    assert PostgresRequestRepository(FakeFactory(rows=[draft_row])).drafts() == [make_draft()]
    assert PostgresRequestRepository(FakeFactory(rows=[event_row()])).events() == [make_event()]


# ---- general properties of every operation -------------------------------------------------------


def run_every_operation(repository: PostgresRequestRepository) -> int:
    repository.add(make_draft(), make_event())
    repository.list_due(FIXED_NOW, 10)
    repository.mark_dispatched(EVENT_ID, 1)
    repository.mark_retry(EVENT_ID, 2, FIXED_NOW)
    repository.mark_failed(EVENT_ID, 3)
    repository.drafts()
    repository.events()
    return 7


def test_every_operation_uses_and_closes_its_own_connection() -> None:
    factory = FakeFactory()
    operations = run_every_operation(PostgresRequestRepository(factory))

    assert len(factory.connections) == operations
    assert all(connection.closed for connection in factory.connections)


def test_every_statement_has_exactly_as_many_placeholders_as_parameters() -> None:
    factory = FakeFactory()
    run_every_operation(PostgresRequestRepository(factory))

    for connection in factory.connections:
        for sql, params in connection.executed:
            assert sql.count("%s") == len(params or ()), sql


def test_the_repository_offers_what_the_interfaces_need() -> None:
    for name in ("add", "list_due", "mark_dispatched", "mark_retry", "mark_failed"):
        assert callable(getattr(PostgresRequestRepository, name))


# ---- request IDs from the sequence ---------------------------------------------------------------


def test_the_id_generator_reads_the_sequence_and_formats_the_id() -> None:
    factory = FakeFactory(rows=[(7,)])
    request_id = PostgresRequestIdGenerator(factory).next_id(FIXED_NOW)

    assert request_id == "PR-2026-000007"
    sql, params = factory.only.executed[0]
    assert sql == "SELECT nextval('purchase_request_seq')"
    assert params is None
    assert factory.only.closed


def test_both_id_sources_spell_ids_the_same_way() -> None:
    from_memory = RequestIdGenerator().next_id(FIXED_NOW)
    from_database = PostgresRequestIdGenerator(FakeFactory(rows=[(1,)])).next_id(FIXED_NOW)
    assert from_memory == from_database == "PR-2026-000001"


def test_sequence_exhaustion_becomes_overflow_error_like_the_memory_generator() -> None:
    factory = FakeFactory(raises={"nextval": SequenceGeneratorLimitExceeded()})
    with pytest.raises(OverflowError, match="exhausted"):
        PostgresRequestIdGenerator(factory).next_id(FIXED_NOW)

    assert factory.only.rollbacks == 1


def test_an_empty_sequence_answer_is_an_error() -> None:
    with pytest.raises(RuntimeError):
        PostgresRequestIdGenerator(FakeFactory(rows=[])).next_id(FIXED_NOW)


def test_the_service_works_with_the_database_id_source_and_repository() -> None:
    factory = FakeFactory(rows=[(3,)])
    service = RequestService(
        PostgresRequestRepository(factory), PostgresRequestIdGenerator(factory), FakeClock()
    )
    draft = service.create_draft(make_data())

    assert draft.id == "PR-2026-000003"
    assert len(factory.connections) == 2  # one for the ID, one for the transaction
    assert factory.connections[1].commits == 1
    assert [sql.split(" ")[2] for sql, _ in factory.connections[1].executed[1:]] == [
        "purchase_requests",
        "outbox_events",
    ]


# ---- the connection factory ----------------------------------------------------------------------


def test_the_connection_factory_turns_off_prepared_statements_and_sets_a_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []
    sentinel = object()

    def fake_connect(conninfo: str, **options: Any) -> object:
        calls.append((conninfo, options))
        return sentinel

    monkeypatch.setattr(repository_postgres.psycopg, "connect", fake_connect)
    connect = make_connection_factory("host=127.0.0.1 dbname=dev-db user=dev-user")

    assert connect() is sentinel
    assert calls == [
        (
            "host=127.0.0.1 dbname=dev-db user=dev-user",
            {"connect_timeout": 5, "prepare_threshold": None},
        )
    ]


# ---- this step changes nothing on the wire ----------------------------------------------------


def test_the_adapter_label_is_not_the_wire_label() -> None:
    assert PostgresRequestRepository.storage_mode == "postgres"
    assert STORAGE_MODE == "in_memory_dev"  # the frozen contract value is untouched
    # (test_safety.py checks that the app itself still uses the in-memory repository.)
