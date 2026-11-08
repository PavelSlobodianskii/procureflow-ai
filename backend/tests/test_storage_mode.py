"""storage_mode: the API says where drafts are kept, and stays valid for contract v1 and v1.1.

No database is used. ``LabelledRepository`` is in-memory storage that only CLAIMS another
storage mode, to test how the label is passed on to the responses.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import get_args

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.modules.requests.repository_memory import InMemoryRequestRepository
from app.modules.requests.schemas import StorageMode
from app.platform.settings import STORAGE_MODE, STORAGE_MODES
from tests.helpers import (
    EXAMPLES_V11_DIR,
    FakeClock,
    example,
    load_json,
    post_json,
    valid_body,
    validator,
    validator_v11,
)

DRAFT_SCHEMA = "purchase-request-draft.response.schema.json"
HEALTH_SCHEMA = "health.response.schema.json"


class LabelledRepository(InMemoryRequestRepository):
    def __init__(self, label: str) -> None:
        super().__init__()
        self.storage_mode = label  # type: ignore[misc]


def make_client(label: str | None = None) -> TestClient:
    repository = InMemoryRequestRepository() if label is None else LabelledRepository(label)
    app = create_app(repository=repository, clock=FakeClock(), start_dispatcher=False)
    return TestClient(app, raise_server_exceptions=False)


# ---- the allowed values -------------------------------------------------------------------------


def test_the_allowed_values_are_exactly_the_two_contract_values() -> None:
    assert STORAGE_MODES == ("in_memory_dev", "postgres")
    assert get_args(StorageMode) == STORAGE_MODES  # the response schema type and the setting agree
    assert STORAGE_MODE == "in_memory_dev"  # the default, and the only value contract v1 knows


# ---- in memory: byte-identical to before, valid under both contract versions --------------------


def test_in_memory_app_reports_in_memory_dev() -> None:
    client = make_client()
    assert client.get("/health").json()["storage_mode"] == "in_memory_dev"
    assert post_json(client, valid_body()).json()["storage_mode"] == "in_memory_dev"


def test_in_memory_responses_equal_the_v1_examples_exactly() -> None:
    client = make_client()
    assert client.get("/health").json() == example("health.200.json")
    assert post_json(client, valid_body()).json() == example("create-response.201.json")


def test_in_memory_responses_are_valid_under_v1_and_under_v1_1() -> None:
    client = make_client()
    health, created = client.get("/health").json(), post_json(client, valid_body()).json()
    for check in (validator, validator_v11):
        assert check(HEALTH_SCHEMA).is_valid(health)
        assert check(DRAFT_SCHEMA).is_valid(created)


# ---- postgres: valid under v1.1 only (this is the documented incompatibility) -------------------


def test_a_postgres_app_reports_postgres() -> None:
    client = make_client("postgres")
    assert client.get("/health").json()["storage_mode"] == "postgres"
    assert post_json(client, valid_body()).json()["storage_mode"] == "postgres"


def test_postgres_responses_equal_the_v1_1_examples_exactly() -> None:
    client = make_client("postgres")
    assert client.get("/health").json() == load_json(EXAMPLES_V11_DIR / "health.200.postgres.json")
    assert post_json(client, valid_body()).json() == load_json(
        EXAMPLES_V11_DIR / "create-response.201.postgres.json"
    )


def test_postgres_responses_are_valid_under_v1_1_and_invalid_under_v1() -> None:
    client = make_client("postgres")
    health, created = client.get("/health").json(), post_json(client, valid_body()).json()
    assert validator_v11(HEALTH_SCHEMA).is_valid(health)
    assert validator_v11(DRAFT_SCHEMA).is_valid(created)
    assert not validator(HEALTH_SCHEMA).is_valid(health)  # a v1 client would reject it,
    assert not validator(DRAFT_SCHEMA).is_valid(created)  # which is why the frontend ships first


def test_a_postgres_draft_is_still_only_a_draft_with_no_extra_field() -> None:
    body = post_json(make_client("postgres"), valid_body()).json()
    assert set(body) == {"id", "status", "created_at", "storage_mode", "data", "estimated_total"}
    assert body["status"] == "draft"


# ---- nothing else can be reported ---------------------------------------------------------------


@pytest.mark.parametrize("label", ["sqlite", "Postgres", "POSTGRES", "postgres ", "", "memory"])
def test_an_unknown_storage_mode_stops_the_app_from_starting(label: str) -> None:
    with pytest.raises(ValueError, match="unknown storage_mode"):
        create_app(repository=LabelledRepository(label), start_dispatcher=False)


def test_a_repository_without_any_label_falls_back_to_the_v1_value() -> None:
    class Unlabelled:
        """Delegates to an in-memory repository but has NO storage_mode attribute at all."""

        def __init__(self) -> None:
            self._inner = InMemoryRequestRepository()

        def __getattr__(self, name: str) -> object:
            if name == "storage_mode":
                raise AttributeError(name)
            return getattr(self._inner, name)

    repository = Unlabelled()
    assert not hasattr(repository, "storage_mode")
    app = create_app(repository=repository, start_dispatcher=False)  # type: ignore[arg-type]
    assert app.state.storage_mode == "in_memory_dev"  # never an invented value
    assert TestClient(app).get("/health").json()["storage_mode"] == "in_memory_dev"


# ---- the in-process dispatcher is for memory only ------------------------------------------------


def test_the_dispatcher_cannot_be_combined_with_a_non_memory_repository() -> None:
    with pytest.raises(ValueError, match="in-memory repository only"):
        create_app(repository=LabelledRepository("postgres"), start_dispatcher=True)
    create_app(repository=LabelledRepository("postgres"), start_dispatcher=False)  # allowed
    create_app(repository=InMemoryRequestRepository(), start_dispatcher=True)  # allowed, as before


# ---- startup log ---------------------------------------------------------------------------------


def test_the_dev_only_warning_is_shown_for_memory_and_not_for_postgres(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="procureflow.api")

    with TestClient(create_app(start_dispatcher=False)):
        pass
    memory_messages = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("DEV ONLY" in m and "in_memory_dev" in m for m in memory_messages)

    caplog.clear()
    with TestClient(create_app(repository=LabelledRepository("postgres"), start_dispatcher=False)):
        pass
    assert not [r for r in caplog.records if "DEV ONLY" in r.getMessage()]
    assert any("storage_mode=postgres" in r.getMessage() for r in caplog.records)


# ---- request IDs come from the injected source ---------------------------------------------------


def test_the_id_source_can_be_injected() -> None:
    class FixedIds:
        def next_id(self, moment: datetime) -> str:
            return f"PR-{moment.year:04d}-000042"

    app = create_app(ids=FixedIds(), clock=FakeClock(), start_dispatcher=False)
    assert post_json(TestClient(app), valid_body()).json()["id"] == "PR-2026-000042"
