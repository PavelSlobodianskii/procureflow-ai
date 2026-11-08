"""Write gate (task 0002, decision D9): a closed gate answers the contract's existing 404 problem.

No new status code and no new problem type exist. Nothing is stored while the gate is closed.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.modules.requests.repository_memory import InMemoryRequestRepository
from tests.helpers import JSON_HEADERS, FakeClock, example, post_json, valid_body, validator

URL = "/api/v1/requests"


def make(writes_enabled: bool) -> tuple[TestClient, InMemoryRequestRepository]:
    repository = InMemoryRequestRepository()
    app = create_app(
        repository=repository,
        clock=FakeClock(),
        start_dispatcher=False,
        writes_enabled=writes_enabled,
    )
    return TestClient(app, raise_server_exceptions=False), repository


def closed() -> tuple[TestClient, InMemoryRequestRepository]:
    return make(False)


def test_a_closed_gate_answers_the_contracts_404_problem() -> None:
    client, _ = closed()
    response = post_json(client, valid_body())

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body == {**example("error.404.not-found.json"), "instance": URL}
    assert validator("problem.schema.json").is_valid(body)


def test_a_closed_gate_is_indistinguishable_from_an_unknown_route() -> None:
    client, _ = closed()
    gate = post_json(client, valid_body())
    unknown = client.post("/api/v1/other", content=b"{}", headers=JSON_HEADERS)

    assert unknown.status_code == gate.status_code == 404
    assert gate.json() == {**unknown.json(), "instance": URL}
    assert gate.headers["content-type"] == unknown.headers["content-type"]


def test_a_closed_gate_stores_nothing() -> None:
    client, repository = closed()
    post_json(client, valid_body())
    assert repository.drafts() == [] and repository.events() == []


@pytest.mark.parametrize(
    "request_kwargs",
    [
        {"content": json.dumps({"description": "ab"}), "headers": JSON_HEADERS},  # would be a 422
        {"content": b"{not json", "headers": JSON_HEADERS},  # would be a 400
        {"content": b"text", "headers": {"content-type": "text/plain"}},  # would be a 415
        {"content": b"x" * 20000, "headers": JSON_HEADERS},  # would be a 413
        {"content": b"", "headers": JSON_HEADERS},  # empty
    ],
)
def test_a_closed_gate_answers_404_before_it_looks_at_the_request(
    request_kwargs: dict[str, Any],
) -> None:
    client, repository = closed()
    response = client.post(URL, **request_kwargs)

    assert response.status_code == 404
    assert response.json()["type"] == "urn:procureflow:problem:not-found"
    assert repository.drafts() == [] and repository.events() == []


def test_a_request_cannot_open_a_closed_gate() -> None:
    client, repository = closed()
    for headers in (
        {**JSON_HEADERS, "x-writes-enabled": "1"},
        {**JSON_HEADERS, "authorization": "Bearer anything"},
        {**JSON_HEADERS, "x-forwarded-for": "127.0.0.1"},
    ):
        response = client.post(
            f"{URL}?writes_enabled=1", content=json.dumps(valid_body()), headers=headers
        )
        assert response.status_code == 404
    assert repository.drafts() == []


def test_a_closed_gate_leaves_health_and_the_other_answers_alone() -> None:
    client, _ = closed()

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json() == example("health.200.json")

    wrong_method = client.get(URL)
    assert wrong_method.status_code == 405
    assert wrong_method.headers["allow"] == "POST"

    unknown = client.get("/api/v1/unknown")
    assert unknown.status_code == 404
    assert unknown.json()["instance"] == "/api/v1/unknown"


def test_a_closed_gate_says_so_in_the_server_log_only(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="procureflow.api")
    client, _ = closed()
    response = post_json(client, valid_body())

    assert any("writes are disabled" in r.getMessage() for r in caplog.records)
    assert "disabled" not in response.text.lower()  # the answer itself reveals nothing


def test_an_open_gate_is_the_old_behaviour() -> None:
    client, repository = make(True)
    response = post_json(client, valid_body())

    assert response.status_code == 201
    assert response.json() == example("create-response.201.json")
    assert len(repository.drafts()) == 1 and len(repository.events()) == 1


def test_the_gate_is_open_by_default() -> None:
    app = create_app(
        repository=InMemoryRequestRepository(), clock=FakeClock(), start_dispatcher=False
    )
    assert app.state.writes_enabled is True
    assert post_json(TestClient(app), valid_body()).status_code == 201
