"""HTTP routes. These are the only two routes of the slice."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from app.modules.requests.schemas import (
    DraftResponse,
    HealthResponse,
    InvalidRequestBodyError,
    validate_create_request,
)
from app.modules.requests.service import RequestService
from app.platform.problems import NO_STORE, ProblemError

router = APIRouter()


def get_service(request: Request) -> RequestService:
    return request.app.state.service  # type: ignore[no-any-return]


def _reject_json_constant(name: str) -> Any:
    raise ValueError(f"{name} is not valid JSON")


def _is_json_content_type(header: str | None) -> bool:
    """``application/json``, optionally with ``charset=utf-8``. Anything else is refused."""
    if not header:
        return False
    media_type, *parameters = (part.strip() for part in header.split(";"))
    if media_type.lower() != "application/json":
        return False
    for parameter in parameters:
        name, _, value = parameter.partition("=")
        if name.strip().lower() == "charset" and value.strip().strip('"').lower() != "utf-8":
            return False
    return True


async def _read_body_limited(request: Request, max_bytes: int) -> bytes:
    """Read the body but stop as soon as it exceeds the limit, whatever Content-Length says."""
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > max_bytes:
        raise ProblemError(413)
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise ProblemError(413)
        chunks.append(chunk)
    return b"".join(chunks)


def _parse_json(raw: bytes) -> object:
    try:
        return json.loads(raw.decode("utf-8"), parse_constant=_reject_json_constant)
    except (ValueError, RecursionError):
        # ValueError covers bad syntax, bad UTF-8, NaN/Infinity and over-long integer literals.
        # RecursionError covers absurdly deep nesting that still fits inside the size limit.
        raise ProblemError(400) from None


@router.get("/health", response_model=HealthResponse)
async def health(response: Response) -> HealthResponse:
    response.headers.update(NO_STORE)
    return HealthResponse()


@router.post("/api/v1/requests", response_model=DraftResponse, status_code=201)
async def create_purchase_request(
    request: Request,
    response: Response,
    service: RequestService = Depends(get_service),  # noqa: B008
) -> DraftResponse:
    # Order required by the contract: (404/405 by routing) -> 415 -> 413 -> 400 -> 422.
    if not _is_json_content_type(request.headers.get("content-type")):
        raise ProblemError(415)
    raw = await _read_body_limited(request, request.app.state.settings.max_body_bytes)
    body = _parse_json(raw)
    try:
        data = validate_create_request(body)
    except InvalidRequestBodyError as exc:
        raise ProblemError(422, exc.errors) from None

    draft = service.create_draft(data)
    response.headers.update(NO_STORE)
    return DraftResponse.from_draft(draft)
