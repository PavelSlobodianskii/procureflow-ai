"""Order of checks (415 -> 413 -> 400 -> 422), size limit, JSON parsing edge cases."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from tests.helpers import JSON_HEADERS, post_json, valid_body

URL = "/api/v1/requests"


def problem_status(response) -> int:
    assert response.headers["content-type"] == "application/problem+json"
    return response.json()["status"]


def padded_valid_body(total_bytes: int) -> bytes:
    raw = json.dumps(valid_body()).encode()
    return raw + b" " * (total_bytes - len(raw))


# ---- content type ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "content_type",
    ["application/json", "application/json; charset=utf-8", "Application/JSON; charset=UTF-8"],
)
def test_json_content_types_are_accepted(client: TestClient, content_type: str) -> None:
    response = client.post(
        URL, content=json.dumps(valid_body()), headers={"content-type": content_type}
    )
    assert response.status_code == 201


@pytest.mark.parametrize(
    "content_type",
    [
        None,
        "text/plain",
        "application/xml",
        "application/json; charset=latin-1",
        "application/jsonx",
    ],
)
def test_other_content_types_are_415(client: TestClient, content_type: str | None) -> None:
    headers = {} if content_type is None else {"content-type": content_type}
    response = client.post(URL, content=json.dumps(valid_body()), headers=headers)
    assert response.status_code == 415
    assert problem_status(response) == 415


# ---- size limit --------------------------------------------------------------------------------


def test_exactly_16384_bytes_is_allowed(client: TestClient) -> None:
    response = client.post(URL, content=padded_valid_body(16384), headers=JSON_HEADERS)
    assert response.status_code == 201


def test_16385_bytes_is_413(client: TestClient) -> None:
    response = client.post(URL, content=padded_valid_body(16385), headers=JSON_HEADERS)
    assert response.status_code == 413


def test_size_limit_applies_to_chunked_bodies_without_content_length(client: TestClient) -> None:
    def chunks():
        for _ in range(20):  # 20 x 1000 bytes, no Content-Length header
            yield b" " * 1000

    response = client.post(URL, content=chunks(), headers=JSON_HEADERS)
    assert response.status_code == 413


def test_content_type_is_checked_before_size(client: TestClient) -> None:
    response = client.post(URL, content=b" " * 20000, headers={"content-type": "text/plain"})
    assert response.status_code == 415


def test_size_is_checked_before_json_parsing(client: TestClient) -> None:
    response = client.post(URL, content=b"{" * 20000, headers=JSON_HEADERS)
    assert response.status_code == 413


def test_json_parsing_is_checked_before_validation(client: TestClient) -> None:
    response = client.post(URL, content=b'{"description": ', headers=JSON_HEADERS)
    assert response.status_code == 400


# ---- invalid JSON edge cases -------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        b"",
        b"   ",
        b"{not json",
        b'{"a": NaN}',
        b'{"a": Infinity}',
        b"\xef\xbb\xbf{}",  # UTF-8 byte order mark
        b"\xff\xfe{\x00}\x00",  # UTF-16
        b"\xc3\x28",  # invalid UTF-8
        b"1" * 6000,  # over-long integer literal
    ],
)
def test_unparseable_bodies_are_400(client: TestClient, raw: bytes) -> None:
    response = client.post(URL, content=raw, headers=JSON_HEADERS)
    assert response.status_code == 400
    assert problem_status(response) == 400


def test_deeply_nested_body_never_becomes_a_500(client: TestClient) -> None:
    # Fits inside the 16 KB limit. Python 3.14 parses it (valid JSON, not an object -> 422);
    # an interpreter with a lower recursion limit would raise RecursionError, which the API
    # maps to 400. Either is correct. The property that matters: never an unhandled 500.
    raw = b"[" * 8000 + b"]" * 8000
    response = client.post(URL, content=raw, headers=JSON_HEADERS)
    assert response.status_code in (400, 422)
    assert response.headers["content-type"] == "application/problem+json"


def test_recursion_error_while_parsing_is_a_400(client: TestClient, monkeypatch) -> None:
    import app.modules.requests.api as api_module

    def exploding_loads(*args, **kwargs):
        raise RecursionError

    monkeypatch.setattr(api_module.json, "loads", exploding_loads)
    response = client.post(URL, content=b"{}", headers=JSON_HEADERS)
    assert response.status_code == 400


def test_json_scalar_bodies_are_422_not_400(client: TestClient) -> None:
    for body in (1, True, "text", None, [], [{}]):
        response = post_json(client, body)
        assert response.status_code == 422
        assert response.json()["errors"][0]["field"] == "$"


# ---- text that cannot be encoded as UTF-8 (lone UTF-16 surrogates) --------------------------


# Lone surrogates are built with chr() so that no literal surrogate sits in this source file
# (pytest cannot compile one). json.dumps then writes each as a JSON escape such as "\\ud800".
HIGH = chr(0xD800)
LOW = chr(0xDFFF)


def _with_surrogate(**changes):
    return valid_body() | changes


SURROGATE_BODIES = {
    "description": _with_surrogate(description=HIGH * 3),
    "currency": _with_surrogate(currency=HIGH),
    "unit_price": _with_surrogate(unit_price="1." + LOW),
    "requester_display_name": _with_surrogate(requester_display_name="A" + LOW),
    "unknown-field-name": _with_surrogate(**{HIGH: 1}),
    "nested-value": _with_surrogate(description=[LOW]),
    "top-level-array": [LOW],
}


@pytest.mark.parametrize("name", SURROGATE_BODIES)
def test_lone_surrogate_text_is_a_400_and_stores_nothing(
    client: TestClient, repo, name: str
) -> None:
    response = client.post(URL, content=json.dumps(SURROGATE_BODIES[name]), headers=JSON_HEADERS)
    assert response.status_code == 400
    assert problem_status(response) == 400
    assert repo.drafts() == []
    assert repo.events() == []


def test_valid_surrogate_pair_is_accepted_and_echoed(client: TestClient) -> None:
    # An emoji is written in JSON as a valid surrogate PAIR (two escapes): that must be fine.
    text = "\U0001f600\U0001f600\U0001f600"
    response = client.post(
        URL, content=json.dumps(valid_body() | {"description": text}), headers=JSON_HEADERS
    )
    assert response.status_code == 201
    assert response.json()["data"]["description"] == text
