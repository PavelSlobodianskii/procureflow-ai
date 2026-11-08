"""Run every case in the frozen cases.json, exactly as described there."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.modules.requests import messages as backend_messages
from tests.helpers import (
    CONTRACT_DIR,
    EXAMPLES_DIR,
    build_case_body,
    load_json,
    post_json,
    validator,
)

CASES = load_json(EXAMPLES_DIR / "cases.json")
MESSAGES = load_json(CONTRACT_DIR / "messages.json")
REQUEST_SCHEMA = validator("create-purchase-request.request.schema.json")
DRAFT_SCHEMA = validator("purchase-request-draft.response.schema.json")
PROBLEM_SCHEMA = validator("problem.schema.json")


def expected_message(field: str, code: str) -> str:
    if code == "unknown_field":
        return MESSAGES["unknown_field_message"]
    return MESSAGES["fields"][field][code]


@pytest.mark.parametrize("case", CASES["accepted"], ids=lambda c: c["name"])
def test_accepted_case(client: TestClient, case: dict) -> None:
    body = build_case_body(case)
    REQUEST_SCHEMA.validate(body)  # accepted inputs are also valid for the JSON Schema

    response = post_json(client, body)

    assert response.status_code == 201, response.text
    result = response.json()
    DRAFT_SCHEMA.validate(result)
    expect = case["expect"]
    for key in ("description", "requester_display_name", "unit_price"):
        if key in expect:
            assert result["data"][key] == expect[key]
    if "estimated_total_amount" in expect:
        assert result["estimated_total"]["amount"] == expect["estimated_total_amount"]
    if "estimated_total_currency" in expect:
        assert result["estimated_total"]["currency"] == expect["estimated_total_currency"]
        assert result["data"]["currency"] == expect["estimated_total_currency"]
    assert result["status"] == "draft"


@pytest.mark.parametrize("case", CASES["rejected"], ids=lambda c: c["name"])
def test_rejected_case(client: TestClient, case: dict) -> None:
    response = post_json(client, build_case_body(case))

    assert response.status_code == 422, response.text
    assert response.headers["content-type"] == "application/problem+json"
    problem = response.json()
    PROBLEM_SCHEMA.validate(problem)
    expected = [
        {
            "field": item["field"],
            "code": item["code"],
            "message": expected_message(item["field"], item["code"]),
        }
        for item in case["expected_errors"]
    ]
    # Same fields, codes, messages AND order.
    assert problem["errors"] == expected


def test_backend_message_table_equals_contract_messages() -> None:
    assert backend_messages.FIELD_MESSAGES == MESSAGES["fields"]
    assert backend_messages.UNKNOWN_FIELD_MESSAGE == MESSAGES["unknown_field_message"]


def test_rejected_requests_store_nothing(client: TestClient, repo) -> None:
    for case in CASES["rejected"]:
        post_json(client, build_case_body(case))
    assert repo.drafts() == []
    assert repo.events() == []
