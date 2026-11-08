"""The Vercel entry point (backend/index.py): writes are CLOSED unless the owner opens them.

Nothing here connects to a database. ``make_factory`` is replaced by a spy that hands out the fake
connections from the adapter tests, so every test can also assert that nothing was connected.
"""

from __future__ import annotations

import logging
import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.modules.requests.repository_memory import InMemoryRequestRepository
from app.modules.requests.repository_postgres import (
    PostgresRequestIdGenerator,
    PostgresRequestRepository,
)
from index import app as module_level_app
from index import build_app
from tests.helpers import example, post_json, valid_body, validator, validator_v11
from tests.test_repository_postgres_fake import FakeFactory

# A visibly fake connection description (key/value form, no password). It is only a marker string.
DSN = "host=127.0.0.1 dbname=dev-db user=dev-user"
ON_VERCEL = {"VERCEL": "1"}


class FactorySpy:
    """Stands in for ``make_connection_factory``: records the DSNs and returns fake connections."""

    def __init__(self, **fake_settings: object) -> None:
        self.dsns: list[str] = []
        self.fake = FakeFactory(**fake_settings)

    def __call__(self, dsn: str) -> FakeFactory:
        self.dsns.append(dsn)
        return self.fake


def client_for(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def assert_writes_closed(app: FastAPI, spy: FactorySpy) -> None:
    client = client_for(app)
    response = post_json(client, valid_body())
    assert response.status_code == 404
    assert response.json()["type"] == "urn:procureflow:problem:not-found"
    assert client.get("/health").json() == example("health.200.json")  # still in_memory_dev
    assert app.state.writes_enabled is False
    assert app.state.storage_mode == "in_memory_dev"
    assert isinstance(app.state.service._repository, InMemoryRequestRepository)
    assert app.state.service._repository.drafts() == []
    assert spy.dsns == [] and spy.fake.connections == []  # no database was even prepared


# ---- not on Vercel -------------------------------------------------------------------------------


def test_outside_vercel_it_is_the_normal_in_memory_app() -> None:
    spy = FactorySpy()
    app = build_app({}, make_factory=spy)
    client = client_for(app)

    assert app.state.writes_enabled is True
    assert app.state.storage_mode == "in_memory_dev"
    assert post_json(client, valid_body()).status_code == 201
    assert spy.dsns == [] and spy.fake.connections == []


def test_even_a_database_setting_is_ignored_outside_vercel() -> None:
    spy = FactorySpy()
    app = build_app({"DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": "1"}, make_factory=spy)

    assert app.state.storage_mode == "in_memory_dev"
    assert spy.dsns == []


def test_the_module_level_app_exists() -> None:
    assert isinstance(module_level_app, FastAPI)  # what Vercel imports


# ---- on Vercel: closed by default ----------------------------------------------------------------


@pytest.mark.parametrize(
    "environ",
    [
        {**ON_VERCEL},
        {**ON_VERCEL, "DATABASE_URL": DSN},  # a database alone does not open writes
        {**ON_VERCEL, "POSTGRES_WRITES_ENABLED": "1"},  # the switch alone does not either
        {**ON_VERCEL, "DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": "0"},
        {**ON_VERCEL, "DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": ""},
        {**ON_VERCEL, "DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": "true"},
        {**ON_VERCEL, "DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": "yes"},
        {**ON_VERCEL, "DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": "01"},
        {**ON_VERCEL, "DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": " 1"},
        {**ON_VERCEL, "DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": "1 "},
        {**ON_VERCEL, "DATABASE_URL": "", "POSTGRES_WRITES_ENABLED": "1"},
    ],
    ids=lambda environ: "+".join(
        sorted(f"{k}={'set' if v else 'empty'}:{v[:4]}" for k, v in environ.items())
    ),
)
def test_on_vercel_writes_are_closed_unless_both_settings_are_exactly_right(
    environ: dict[str, str],
) -> None:
    spy = FactorySpy()
    assert_writes_closed(build_app(environ, make_factory=spy), spy)


def test_the_switch_without_a_database_is_logged_and_stays_closed(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.ERROR, logger="procureflow.entrypoint")
    spy = FactorySpy()
    app = build_app({**ON_VERCEL, "POSTGRES_WRITES_ENABLED": "1"}, make_factory=spy)

    assert_writes_closed(app, spy)
    assert any("DATABASE_URL is not set" in r.getMessage() for r in caplog.records)


# ---- on Vercel: both settings -> PostgreSQL ------------------------------------------------------


def open_app(spy: FactorySpy) -> FastAPI:
    return build_app(
        {**ON_VERCEL, "DATABASE_URL": DSN, "POSTGRES_WRITES_ENABLED": "1"}, make_factory=spy
    )


def test_with_both_settings_drafts_go_to_postgres() -> None:
    spy = FactorySpy(rows=[(7,)])
    app = open_app(spy)

    assert app.state.storage_mode == "postgres"
    assert app.state.writes_enabled is True
    service = app.state.service
    assert isinstance(service._repository, PostgresRequestRepository)
    assert isinstance(service._ids, PostgresRequestIdGenerator)
    assert spy.dsns == [DSN]  # the DSN was handed to the factory builder exactly once


def test_building_the_app_and_asking_health_open_no_database_connection() -> None:
    spy = FactorySpy()
    app = open_app(spy)
    assert spy.fake.connections == []

    response = client_for(app).get("/health")
    assert response.status_code == 200
    assert response.json()["storage_mode"] == "postgres"
    assert spy.fake.connections == []  # health never touches the database


def test_a_write_is_stored_through_the_postgres_adapter_in_one_transaction() -> None:
    spy = FactorySpy(rows=[(7,)])
    client = client_for(open_app(spy))
    response = post_json(client, valid_body())

    assert response.status_code == 201
    body = response.json()
    assert body["storage_mode"] == "postgres"
    assert re.fullmatch(r"PR-[0-9]{4}-000007", body["id"])  # the number came from the "sequence"
    assert validator_v11("purchase-request-draft.response.schema.json").is_valid(body)
    assert not validator("purchase-request-draft.response.schema.json").is_valid(body)  # v1 only

    id_connection, write_connection = spy.fake.connections
    assert [sql for sql, _ in id_connection.executed] == ["SELECT nextval('purchase_request_seq')"]
    inserts = [sql.split(" ")[2] for sql, _ in write_connection.executed[1:]]
    assert inserts == ["purchase_requests", "outbox_events"]
    assert (write_connection.commits, write_connection.rollbacks) == (1, 0)
    assert id_connection.closed and write_connection.closed


def test_a_database_failure_is_the_generic_500_and_leaks_nothing() -> None:
    spy = FactorySpy(rows=[(7,)], fail_on_statement=2)  # the draft insert fails
    client = client_for(open_app(spy))
    response = post_json(client, valid_body())

    assert response.status_code == 500
    assert response.json()["type"] == "urn:procureflow:problem:internal-error"
    assert "simulated" not in response.text and DSN not in response.text
    write_connection = spy.fake.connections[1]
    assert (write_connection.commits, write_connection.rollbacks) == (0, 1)


def test_the_connection_description_never_reaches_a_response_or_a_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    spy = FactorySpy(rows=[(7,)])
    client = client_for(open_app(spy))
    texts = [
        client.get("/health").text,
        post_json(client, valid_body()).text,
        client.get("/api/v1/unknown").text,
    ]
    texts += [record.getMessage() for record in caplog.records]
    assert all("dev-db" not in text and "dev-user" not in text for text in texts)
