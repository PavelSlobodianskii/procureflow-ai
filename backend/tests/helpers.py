"""Plain test helpers. The frozen contract files are READ here, never edited."""

from __future__ import annotations

import copy
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

BACKEND_DIR = Path(__file__).resolve().parents[1]
CONTRACT_DIR = BACKEND_DIR.parent / "contracts" / "purchase-request-v1"
EXAMPLES_DIR = CONTRACT_DIR / "examples"
SCHEMAS_DIR = CONTRACT_DIR / "schemas"

# Contract v1.1 (additive draft): the same files plus the storage_mode value "postgres".
# Like v1, it is only ever read here, never edited.
CONTRACT_V11_DIR = BACKEND_DIR.parent / "contracts" / "purchase-request-v1.1"
EXAMPLES_V11_DIR = CONTRACT_V11_DIR / "examples"
SCHEMAS_V11_DIR = CONTRACT_V11_DIR / "schemas"

JSON_HEADERS = {"content-type": "application/json"}
FIXED_NOW = datetime(2026, 11, 8, 10, 15, 30, tzinfo=UTC)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def example(name: str) -> Any:
    return load_json(EXAMPLES_DIR / name)


def validator(schema_file: str) -> Draft202012Validator:
    schema = load_json(SCHEMAS_DIR / schema_file)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validator_v11(schema_file: str) -> Draft202012Validator:
    schema = load_json(SCHEMAS_V11_DIR / schema_file)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def valid_body() -> dict[str, Any]:
    return copy.deepcopy(example("create-request.valid.json"))


def build_case_body(case: dict[str, Any]) -> Any:
    """Build a request body exactly as cases.json describes."""
    if "body" in case:
        return copy.deepcopy(case["body"])
    body = valid_body()
    for key in case.get("remove", []):
        body.pop(key, None)
    body.update(copy.deepcopy(case.get("override", {})))
    return body


class FakeClock:
    """A settable clock so time-dependent code is deterministic."""

    def __init__(self, now: datetime = FIXED_NOW) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


def post_json(client: TestClient, body: Any) -> Any:
    return client.post("/api/v1/requests", content=json.dumps(body), headers=JSON_HEADERS)
