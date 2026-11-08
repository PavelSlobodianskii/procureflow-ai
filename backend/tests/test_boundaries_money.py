"""Length boundaries generated in code, and money handling."""

from __future__ import annotations

import ast
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.modules.requests import domain
from tests.helpers import post_json, valid_body

APP_DIR = Path(__file__).resolve().parents[1] / "app"


def errors_of(response) -> list[dict]:
    assert response.status_code == 422, response.text
    return response.json()["errors"]


@pytest.mark.parametrize(
    ("field", "length"),
    [("description", 500), ("requester_display_name", 80)],
)
def test_maximum_length_is_accepted(client: TestClient, field: str, length: int) -> None:
    body = valid_body() | {field: "a" * length}
    response = post_json(client, body)
    assert response.status_code == 201
    assert response.json()["data"][field] == "a" * length


@pytest.mark.parametrize(
    ("field", "length"),
    [("description", 501), ("requester_display_name", 81)],
)
def test_one_over_maximum_is_too_long(client: TestClient, field: str, length: int) -> None:
    response = post_json(client, valid_body() | {field: "a" * length})
    assert [(e["field"], e["code"]) for e in errors_of(response)] == [(field, "too_long")]


@pytest.mark.parametrize(
    ("field", "length"),
    [("description", 500), ("requester_display_name", 80)],
)
def test_length_is_measured_after_trimming(client: TestClient, field: str, length: int) -> None:
    padded = "  " + "a" * length + "  "
    response = post_json(client, valid_body() | {field: padded})
    assert response.status_code == 201
    assert response.json()["data"][field] == "a" * length


@pytest.mark.parametrize("price", ["12.50\n", " 12.50", "١٢.٥٠", "1e2", "+5", ".5", "5."])
def test_price_format_is_strict(client: TestClient, price: str) -> None:
    response = post_json(client, valid_body() | {"unit_price": price})
    assert [(e["field"], e["code"]) for e in errors_of(response)] == [
        ("unit_price", "invalid_format")
    ]


def test_currency_is_not_trimmed_or_case_folded(client: TestClient) -> None:
    for currency in (" EUR", "EUR ", "Eur"):
        response = post_json(client, valid_body() | {"currency": currency})
        assert [(e["field"], e["code"]) for e in errors_of(response)] == [
            ("currency", "invalid_choice")
        ]


def test_quantity_boundaries(client: TestClient) -> None:
    assert post_json(client, valid_body() | {"quantity": 1}).status_code == 201
    assert post_json(client, valid_body() | {"quantity": 100000}).status_code == 201
    assert post_json(client, valid_body() | {"quantity": 100001}).status_code == 422
    assert post_json(client, valid_body() | {"quantity": 2**70}).status_code == 422


# ---- money -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("250", "250.00"), ("249.9", "249.90"), ("0.1", "0.10"), ("0.01", "0.01"), ("7.05", "7.05")],
)
def test_price_is_normalised_to_two_decimals(raw: str, expected: str) -> None:
    assert domain.format_money(domain.normalise_price(Decimal(raw))) == expected


def test_total_for_maximum_boundary(client: TestClient) -> None:
    body = valid_body() | {"quantity": 100000, "unit_price": "10000000.00"}
    response = post_json(client, body)
    assert response.json()["estimated_total"] == {"amount": "1000000000000.00", "currency": "EUR"}


def test_total_is_exact_where_float_arithmetic_would_drift(client: TestClient) -> None:
    # 3 * 0.10 is 0.30000000000000004 as a float. As Decimal it is exactly 0.30.
    response = post_json(client, valid_body() | {"quantity": 3, "unit_price": "0.10"})
    assert response.json()["estimated_total"]["amount"] == "0.30"
    response = post_json(client, valid_body() | {"quantity": 7, "unit_price": "19.99"})
    assert response.json()["estimated_total"]["amount"] == "139.93"


def test_total_has_no_exponent_for_large_values() -> None:
    total = domain.estimate_total(100000, Decimal("10000000.00"))
    assert "E" not in domain.format_money(total).upper()


def test_no_float_in_money_code() -> None:
    """Money code must not use float literals or float()."""
    for name in ("domain.py", "schemas.py", "service.py", "api.py"):
        tree = ast.parse((APP_DIR / "modules" / "requests" / name).read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            assert not (isinstance(node, ast.Constant) and isinstance(node.value, float)), name
            assert not (isinstance(node, ast.Name) and node.id == "float"), name
