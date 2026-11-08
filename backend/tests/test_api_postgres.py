"""API-level PostgreSQL integration tests. OWNER-RUN, against a SEPARATE Neon test branch.

These tests run the real FastAPI app against a real PostgreSQL database. They are skipped unless
the owner sets the variables below, and a skip means NOT RUN, never "passed". Task 0002 keeps
production writes closed until this file passes with 0 skipped and 0 failed.

Before the first run (owner, in the Neon console):
  1. Apply backend/migrations/0001_purchase_requests.sql to the default branch.
  2. Create a branch named "test" from it (the schema is copied).
  3. Use the connection strings of the TEST branch only. Never the default (production) branch.

How to run (PowerShell, in your own window; the values are secrets, so never put them in a file,
a chat message or a log):

    cd backend
    $env:TEST_DATABASE_URL = "<pooled connection string of the test branch>"
    $env:TEST_DATABASE_URL_DIRECT = "<direct (not pooled) connection string of the test branch>"
    .\\.venv\\Scripts\\python.exe -m pytest tests\\test_repository_contract.py `
        tests\\test_api_postgres.py -v
    Remove-Item Env:TEST_DATABASE_URL, Env:TEST_DATABASE_URL_DIRECT

Share only the summary lines (passed, failed, skipped). Each test runs twice, once per connection
string ("pooled" and "direct"). Every test deletes only the rows it created.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import httpx
import psycopg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg import errors as pg_errors

from app.main import create_app
from app.modules.requests.domain import Draft, PurchaseRequestData
from app.modules.requests.events import new_drafted_event
from app.modules.requests.repository_postgres import (
    PostgresRequestIdGenerator,
    PostgresRequestRepository,
    make_connection_factory,
)
from tests.helpers import (
    EXAMPLES_DIR,
    JSON_HEADERS,
    build_case_body,
    load_json,
    post_json,
    valid_body,
    validator_v11,
)

VARIABLES = {"pooled": "TEST_DATABASE_URL", "direct": "TEST_DATABASE_URL_DIRECT"}
FORM_TIMEOUT_SECONDS = 10  # the frontend gives up after this long

# The only statements this file runs itself, and only for rows it created.
_DELETE_EVENTS = "DELETE FROM outbox_events WHERE payload->>'request_id' = ANY(%s)"
_DELETE_DRAFTS = "DELETE FROM purchase_requests WHERE id = ANY(%s)"
_INSERT_RAW = (
    "INSERT INTO purchase_requests "
    "(id, created_at, description, quantity, unit_price, currency, "
    "requester_display_name, estimated_total, status) "
    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
)


@dataclass
class Database:
    dsn: str
    connect: Callable[[], psycopg.Connection[Any]]
    repository: PostgresRequestRepository
    ids: PostgresRequestIdGenerator
    request_ids: list[str] = field(default_factory=list)  # everything to clean up afterwards

    def app(self, *, writes_enabled: bool = True) -> FastAPI:
        return create_app(
            repository=self.repository,
            ids=self.ids,
            start_dispatcher=False,
            writes_enabled=writes_enabled,
        )

    def new_instance(self) -> tuple[FastAPI, PostgresRequestRepository]:
        """A second app with its own connections: what a restart or a second server looks like."""
        connect = make_connection_factory(self.dsn)
        repository = PostgresRequestRepository(connect)
        app = create_app(
            repository=repository,
            ids=PostgresRequestIdGenerator(connect),
            start_dispatcher=False,
        )
        return app, repository

    def track(self, response: Any) -> Any:
        if response.status_code == 201:
            self.request_ids.append(response.json()["id"])
        return response

    def drafts(self) -> dict[str, Draft]:
        return {draft.id: draft for draft in self.repository.drafts()}


@pytest.fixture(params=sorted(VARIABLES))
def database(request: pytest.FixtureRequest) -> Iterator[Database]:
    variable = VARIABLES[request.param]
    dsn = os.environ.get(variable)
    if not dsn:
        pytest.skip(f"{variable} is not set: this PostgreSQL test is owner-run (NOT RUN)")
    connect = make_connection_factory(dsn)
    db = Database(
        dsn, connect, PostgresRequestRepository(connect), PostgresRequestIdGenerator(connect)
    )
    yield db

    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(_DELETE_EVENTS, (db.request_ids,))
        cursor.execute(_DELETE_DRAFTS, (db.request_ids,))


def make_draft(request_id: str, moment: datetime) -> Draft:
    data = PurchaseRequestData("Synthetic test chairs", 2, Decimal("10.00"), "EUR", "Alex Example")
    return Draft(id=request_id, created_at=moment, data=data, estimated_total=Decimal("20.00"))


# ---- a normal write ------------------------------------------------------------------------------


def test_a_valid_post_is_stored_and_reported_as_postgres(database: Database) -> None:
    client = TestClient(database.app(), raise_server_exceptions=False)
    response = database.track(post_json(client, valid_body()))

    assert response.status_code == 201
    body = response.json()
    assert body["storage_mode"] == "postgres"
    assert re.fullmatch(r"PR-[0-9]{4}-[0-9]{6}", body["id"])
    assert validator_v11("purchase-request-draft.response.schema.json").is_valid(body)

    stored = database.drafts()[body["id"]]
    assert stored.status == "draft"
    assert stored.data.unit_price == Decimal("249.90")  # exact, never a float
    assert stored.estimated_total == Decimal("2499.00")
    assert stored.data.requester_display_name == "Alex Example"


def test_health_reports_postgres(database: Database) -> None:
    body = TestClient(database.app()).get("/health").json()
    assert body["storage_mode"] == "postgres"
    assert validator_v11("health.response.schema.json").is_valid(body)


def test_a_draft_survives_a_new_app_instance(database: Database) -> None:
    client = TestClient(database.app(), raise_server_exceptions=False)
    request_id = database.track(post_json(client, valid_body())).json()["id"]

    _, fresh = database.new_instance()  # new connections: a restart, or another server
    assert request_id in {draft.id for draft in fresh.drafts()}
    events = [e for e in fresh.events() if e.payload.get("request_id") == request_id]
    assert len(events) == 1
    assert events[0].type == "purchase_request.drafted"
    assert events[0].status.value == "pending"


def test_every_accepted_shared_case_is_stored_and_every_rejected_case_stores_nothing(
    database: Database,
) -> None:
    cases = load_json(EXAMPLES_DIR / "cases.json")
    client = TestClient(database.app(), raise_server_exceptions=False)

    for case in cases["accepted"]:
        response = database.track(post_json(client, build_case_body(case)))
        assert response.status_code == 201, case["name"]
        assert response.json()["storage_mode"] == "postgres", case["name"]

    before = set(database.drafts())
    for case in cases["rejected"]:
        assert post_json(client, build_case_body(case)).status_code == 422, case["name"]
    assert set(database.drafts()) == before  # rejected requests never reach the database


# ---- concurrency and atomicity -------------------------------------------------------------------


def test_parallel_posts_get_distinct_ids_and_one_event_each(database: Database) -> None:
    async def run() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=database.app())
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return list(
                await asyncio.gather(
                    *[
                        client.post(
                            "/api/v1/requests",
                            content=json.dumps(valid_body()),
                            headers=JSON_HEADERS,
                        )
                        for _ in range(20)
                    ]
                )
            )

    responses = asyncio.run(run())
    for response in responses:
        database.track(response)
    assert [r.status_code for r in responses] == [201] * 20

    ids = [r.json()["id"] for r in responses]
    assert len(set(ids)) == 20
    events = [e for e in database.repository.events() if e.payload.get("request_id") in set(ids)]
    assert len(events) == 20


def test_a_failed_event_insert_rolls_the_draft_back(database: Database) -> None:
    now = datetime.now(UTC).replace(microsecond=0)
    first = make_draft(database.ids.next_id(now), now)
    event = new_drafted_event(f"test-{uuid.uuid4()}", first.id, now)
    database.request_ids.append(first.id)
    database.repository.add(first, event)

    second = make_draft(database.ids.next_id(now), now)
    database.request_ids.append(second.id)
    duplicate = new_drafted_event(event.event_id, second.id, now)  # same event id: must fail
    with pytest.raises(pg_errors.UniqueViolation):
        database.repository.add(second, duplicate)

    drafts = database.drafts()
    assert first.id in drafts
    assert second.id not in drafts  # the draft insert was rolled back together with the event


# ---- the database enforces the domain rules too --------------------------------------------------

BAD_ROWS = [
    ("description", {"description": "ab"}),
    ("quantity", {"quantity": 0}),
    ("unit_price", {"unit_price": Decimal("0.00")}),
    ("currency", {"currency": "XXX"}),
    ("requester_display_name", {"requester_display_name": "A"}),
    ("status", {"status": "approved"}),
]


@pytest.mark.parametrize(("column", "change"), BAD_ROWS, ids=[column for column, _ in BAD_ROWS])
def test_the_database_rejects_a_row_that_breaks_a_domain_rule(
    database: Database, column: str, change: dict[str, Any]
) -> None:
    row: dict[str, Any] = {
        "description": "Synthetic test chairs",
        "quantity": 2,
        "unit_price": Decimal("10.00"),
        "currency": "EUR",
        "requester_display_name": "Alex Example",
        "status": "draft",
    }
    row.update(change)
    params = (
        "PR-2026-999999",  # well formed, so only the rule under test can fail
        datetime.now(UTC),
        row["description"],
        row["quantity"],
        row["unit_price"],
        row["currency"],
        row["requester_display_name"],
        Decimal("20.00"),
        row["status"],
    )
    with pytest.raises(pg_errors.CheckViolation) as raised:
        with database.connect() as connection, connection.cursor() as cursor:
            cursor.execute(_INSERT_RAW, params)
    assert column in (raised.value.diag.constraint_name or "")


# ---- the write gate and the first call -----------------------------------------------------------


def test_a_closed_write_gate_stores_nothing_in_the_database(database: Database) -> None:
    client = TestClient(database.app(writes_enabled=False), raise_server_exceptions=False)
    before = set(database.drafts())

    response = post_json(client, valid_body())

    assert response.status_code == 404
    assert response.json()["type"] == "urn:procureflow:problem:not-found"
    assert set(database.drafts()) == before


def test_the_first_database_call_stays_inside_the_forms_timeout(database: Database) -> None:
    # A database that was idle may need a moment to wake up. The form gives up after 10 seconds.
    started = time.perf_counter()
    database.ids.next_id(datetime.now(UTC))
    elapsed = time.perf_counter() - started
    assert elapsed < FORM_TIMEOUT_SECONDS, f"the first call took {elapsed:.1f} s"
