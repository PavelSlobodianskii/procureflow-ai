"""Contract tests: every status code against the frozen schemas and example files."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import (
    CONTRACT_DIR,
    JSON_HEADERS,
    FakeClock,
    example,
    load_json,
    post_json,
    valid_body,
    validator,
)

PROBLEM = validator("problem.schema.json")
DRAFT = validator("purchase-request-draft.response.schema.json")
HEALTH = validator("health.response.schema.json")
REQUEST = validator("create-purchase-request.request.schema.json")

PROBLEM_CT = "application/problem+json"


def assert_problem(response, status: int, example_name: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"] == PROBLEM_CT
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    PROBLEM.validate(body)
    assert body == example(example_name)


def test_201_matches_schema_and_example(client: TestClient) -> None:
    response = post_json(client, valid_body())
    assert response.status_code == 201
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    DRAFT.validate(body)
    # The fixed clock makes id and created_at identical to the example file.
    assert body == example("create-response.201.json")


def test_health_matches_schema_and_example(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "no-store"
    HEALTH.validate(response.json())
    assert response.json() == example("health.200.json")


def test_400_invalid_json(client: TestClient) -> None:
    response = client.post("/api/v1/requests", content="{not json", headers=JSON_HEADERS)
    assert_problem(response, 400, "error.400.invalid-json.json")


def test_404_unknown_route(client: TestClient) -> None:
    assert_problem(client.get("/api/v1/unknown"), 404, "error.404.not-found.json")


def test_405_wrong_method(client: TestClient) -> None:
    response = client.get("/api/v1/requests")
    assert_problem(response, 405, "error.405.method-not-allowed.json")
    assert response.headers["allow"] == "POST"


def test_413_payload_too_large(client: TestClient) -> None:
    response = client.post("/api/v1/requests", content=b" " * 16385, headers=JSON_HEADERS)
    assert_problem(response, 413, "error.413.payload-too-large.json")


def test_415_unsupported_media_type(client: TestClient) -> None:
    response = client.post(
        "/api/v1/requests", content=json.dumps(valid_body()), headers={"content-type": "text/plain"}
    )
    assert_problem(response, 415, "error.415.unsupported-media-type.json")


def test_422_validation_matches_example(client: TestClient) -> None:
    response = client.post(
        "/api/v1/requests",
        content=json.dumps(example("create-request.invalid.json")),
        headers=JSON_HEADERS,
    )
    assert_problem(response, 422, "error.422.validation.json")


def test_422_not_an_object_matches_example(client: TestClient) -> None:
    response = post_json(client, [])
    assert_problem(response, 422, "error.422.not-an-object.json")


def test_500_internal_error(clock: FakeClock) -> None:
    class ExplodingRepository:
        def add(self, draft: object, event: object) -> None:
            raise RuntimeError("secret internals C:\\Users\\someone\\x.py SELECT * FROM t")

    app = create_app(repository=ExplodingRepository(), clock=clock, start_dispatcher=False)
    client = TestClient(app, raise_server_exceptions=False)
    response = post_json(client, valid_body())
    assert_problem(response, 500, "error.500.internal-error.json")
    for leak in ("secret", "RuntimeError", "Traceback", "SELECT", ".py", "someone"):
        assert leak not in response.text


def test_request_example_files_agree_with_request_schema() -> None:
    REQUEST.validate(example("create-request.valid.json"))
    assert not REQUEST.is_valid(example("create-request.invalid.json"))


def test_every_example_file_is_a_known_contract_example() -> None:
    # Guards against a new example being added to the contract without a backend test.
    covered = {
        "cases.json",
        "create-request.valid.json",
        "create-request.invalid.json",
        "create-response.201.json",
        "error.400.invalid-json.json",
        "error.404.not-found.json",
        "error.405.method-not-allowed.json",
        "error.413.payload-too-large.json",
        "error.415.unsupported-media-type.json",
        "error.422.not-an-object.json",
        "error.422.validation.json",
        "error.500.internal-error.json",
        "health.200.json",
    }
    present = {path.name for path in (CONTRACT_DIR / "examples").glob("*.json")}
    assert present == covered
    assert load_json(CONTRACT_DIR / "messages.json")["contract"] == "purchase-request-v1"
