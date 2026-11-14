"""The gateway gate (task 0002, phase 2b): without the token, every path is the contract's 404."""

from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import create_app
from app.modules.requests.repository_memory import InMemoryRequestRepository
from app.platform.gateway import GATEWAY_HEADER, GatewayGate
from index import MIN_GATEWAY_TOKEN_LENGTH, build_app
from tests.helpers import (
    DEV_GATEWAY_TOKEN,
    JSON_HEADERS,
    OTHER_GATEWAY_TOKEN,
    example,
    post_json,
    valid_body,
    validator,
)

DEV_TOKEN = DEV_GATEWAY_TOKEN
OTHER_TOKEN = OTHER_GATEWAY_TOKEN
assert len(DEV_TOKEN) >= MIN_GATEWAY_TOKEN_LENGTH and len(DEV_TOKEN) == len(OTHER_TOKEN)

PATHS = ["/health", "/api/v1/requests", "/", "/docs", "/api/v1/unknown"]
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]


def gated(repo: InMemoryRequestRepository | None = None, **kwargs: object) -> TestClient:
    app = create_app(repository=repo, start_dispatcher=False, gateway_token=DEV_TOKEN, **kwargs)
    return TestClient(app, raise_server_exceptions=False)


def assert_is_the_contract_404(response, path: str, method: str = "GET") -> None:
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.headers["cache-control"] == "no-store"
    assert "allow" not in response.headers
    if method == "HEAD":
        return  # no body on HEAD
    body = response.json()
    assert validator("problem.schema.json").is_valid(body)
    assert body == {**example("error.404.not-found.json"), "instance": path}


# ---- the gate is off by default ------------------------------------------------------------------


def test_the_gate_is_off_by_default(client: TestClient) -> None:
    assert client.get("/health").status_code == 200
    assert post_json(client, valid_body()).status_code == 201
    # A stray header changes nothing when no gate is configured.
    assert client.get("/health", headers={GATEWAY_HEADER: "anything"}).status_code == 200


def test_the_default_app_has_no_gate_installed() -> None:
    app = create_app(start_dispatcher=False)
    assert not [m for m in app.user_middleware if m.cls is GatewayGate]


def test_an_empty_token_is_refused_at_startup() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        create_app(start_dispatcher=False, gateway_token="")
    with pytest.raises(ValueError, match="must not be empty"):
        GatewayGate(create_app(start_dispatcher=False), token="")


# ---- with a token --------------------------------------------------------------------------------


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("method", METHODS)
def test_without_the_token_every_path_and_method_is_the_contract_404(
    path: str, method: str
) -> None:
    repo = InMemoryRequestRepository()
    response = gated(repo).request(method, path, content=b"{}", headers=JSON_HEADERS)
    assert_is_the_contract_404(response, path, method)
    assert repo.drafts() == []


@pytest.mark.parametrize(
    "presented",
    [
        "",
        " ",
        "wrong",
        OTHER_TOKEN,  # same length, last character differs
        DEV_TOKEN[:-1],
        DEV_TOKEN + "x",
        " " + DEV_TOKEN + "x",
        DEV_TOKEN.upper(),
        f"Bearer {DEV_TOKEN}",
    ],
)
def test_a_wrong_token_is_the_same_404_and_stores_nothing(presented: str) -> None:
    repo = InMemoryRequestRepository()
    client = gated(repo)
    headers = {**JSON_HEADERS, GATEWAY_HEADER: presented}

    assert_is_the_contract_404(client.get("/health", headers=headers), "/health")
    response = client.post("/api/v1/requests", content=b"{}", headers=headers)
    assert_is_the_contract_404(response, "/api/v1/requests")
    assert repo.drafts() == []


def test_two_token_headers_are_refused_even_if_one_is_right() -> None:
    client = gated()
    headers = [(GATEWAY_HEADER, DEV_TOKEN), (GATEWAY_HEADER, "wrong")]
    assert_is_the_contract_404(client.get("/health", headers=headers), "/health")
    headers = [(GATEWAY_HEADER, DEV_TOKEN), (GATEWAY_HEADER, DEV_TOKEN)]
    assert_is_the_contract_404(client.get("/health", headers=headers), "/health")


def test_the_token_in_another_place_does_not_count() -> None:
    client = gated()
    for response in (
        client.get(f"/health?{GATEWAY_HEADER}={DEV_TOKEN}"),
        client.get("/health", headers={"authorization": f"Bearer {DEV_TOKEN}"}),
        client.get("/health", headers={"cookie": f"{GATEWAY_HEADER}={DEV_TOKEN}"}),
        client.get("/health", headers={"x-procureflow-gateway-token": DEV_TOKEN}),
    ):
        assert_is_the_contract_404(response, "/health")


def test_with_the_right_token_the_api_answers_normally() -> None:
    repo = InMemoryRequestRepository()
    client = gated(repo)
    client.headers[GATEWAY_HEADER] = DEV_TOKEN

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json() == example("health.200.json")

    created = post_json(client, valid_body())
    assert created.status_code == 201
    assert validator("purchase-request-draft.response.schema.json").is_valid(created.json())
    assert len(repo.drafts()) == 1

    # The normal problems still come from the app itself, unchanged.
    assert client.get("/nope").status_code == 404
    wrong_method = client.get("/api/v1/requests")
    assert wrong_method.status_code == 405 and wrong_method.headers["allow"] == "POST"
    assert post_json(client, {}).status_code == 422


def test_the_header_name_is_case_insensitive_like_every_http_header() -> None:
    client = gated()
    assert client.get("/health", headers={"X-ProcureFlow-Gateway": DEV_TOKEN}).status_code == 200


def test_a_refusal_never_reads_the_body_and_ignores_content_type_and_size() -> None:
    repo = InMemoryRequestRepository()
    client = gated(repo)
    for content, content_type in ((b"x" * 100_000, "application/json"), (b"<a/>", "text/xml")):
        response = client.post(
            "/api/v1/requests", content=content, headers={"content-type": content_type}
        )
        assert_is_the_contract_404(response, "/api/v1/requests")  # not 413, not 415
    assert repo.drafts() == []


def test_a_refusal_sends_no_cors_headers_and_does_not_reveal_the_token(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    client = gated()
    response = client.get("/health", headers={"origin": "http://evil.example"})

    assert not [h for h in response.headers if h.lower().startswith("access-control-")]
    assert DEV_TOKEN not in response.text
    assert all(DEV_TOKEN not in str(value) for value in response.headers.values())

    client.get("/health", headers={GATEWAY_HEADER: OTHER_TOKEN})
    messages = [record.getMessage() for record in caplog.records]
    assert any("refused by the gateway gate" in message for message in messages)
    assert all(DEV_TOKEN not in m and OTHER_TOKEN not in m for m in messages)


def test_the_gate_and_the_write_gate_work_together() -> None:
    client = gated(writes_enabled=False)
    client.headers[GATEWAY_HEADER] = DEV_TOKEN
    assert client.get("/health").status_code == 200
    assert_is_the_contract_404(post_json(client, valid_body()), "/api/v1/requests")


def test_a_closed_gate_refuses_even_the_right_token() -> None:
    app = create_app(start_dispatcher=False, gateway_token=DEV_TOKEN, gateway_closed=True)
    client = TestClient(app, headers={GATEWAY_HEADER: DEV_TOKEN})
    for path in PATHS:
        assert_is_the_contract_404(client.get(path), path)


# ---- the Vercel entry point: fail closed ---------------------------------------------------------


def vercel_client(environ: dict[str, str]) -> tuple[FastAPI, TestClient]:
    app = build_app({"VERCEL": "1", **environ})
    return app, TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    "environ",
    [
        {},
        {"GATEWAY_TOKEN": ""},
        {"GATEWAY_TOKEN": "dev-tiny"},
        {"GATEWAY_TOKEN": "x" * (MIN_GATEWAY_TOKEN_LENGTH - 1)},
    ],
    ids=["unset", "empty", "short", "one-character-too-short"],
)
def test_on_vercel_without_a_usable_token_everything_is_refused(
    environ: dict[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.ERROR, logger="procureflow.entrypoint")
    _, client = vercel_client(environ)
    presented = environ.get("GATEWAY_TOKEN", "")

    for headers in ({}, {GATEWAY_HEADER: presented}):
        assert_is_the_contract_404(client.get("/health", headers=headers), "/health")
        response = client.post(
            "/api/v1/requests", content=b"{}", headers={**JSON_HEADERS, **headers}
        )
        assert_is_the_contract_404(response, "/api/v1/requests")
    messages = [record.getMessage() for record in caplog.records]
    assert any("GATEWAY_TOKEN is missing or shorter than 32" in m for m in messages)
    assert not presented or all(presented not in m for m in messages)


def test_on_vercel_with_a_token_the_gate_is_on() -> None:
    _, client = vercel_client({"GATEWAY_TOKEN": DEV_TOKEN})

    assert_is_the_contract_404(client.get("/health"), "/health")
    assert_is_the_contract_404(
        client.get("/health", headers={GATEWAY_HEADER: OTHER_TOKEN}), "/health"
    )
    health = client.get("/health", headers={GATEWAY_HEADER: DEV_TOKEN})
    assert health.status_code == 200
    assert health.json() == example("health.200.json")


def test_a_token_of_exactly_the_minimum_length_is_accepted() -> None:
    token = "d" * MIN_GATEWAY_TOKEN_LENGTH
    _, client = vercel_client({"GATEWAY_TOKEN": token})
    assert client.get("/health", headers={GATEWAY_HEADER: token}).status_code == 200


def test_outside_vercel_the_token_setting_is_ignored() -> None:
    app = build_app({"GATEWAY_TOKEN": DEV_TOKEN})
    assert TestClient(app).get("/health").status_code == 200
