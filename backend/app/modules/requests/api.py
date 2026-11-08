"""HTTP routes. These are the only two routes of the slice."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.concurrency import run_in_threadpool

from app.modules.requests.schemas import (
    DraftResponse,
    HealthResponse,
    InvalidRequestBodyError,
    validate_create_request,
)
from app.modules.requests.service import RequestService
from app.platform.problems import NO_STORE, ProblemError

router = APIRouter()
logger = logging.getLogger("procureflow.api")


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


def _require_encodable_text(value: object) -> None:
    """Raise ``UnicodeEncodeError`` if any string or key cannot be written out as UTF-8.

    JSON allows an escape such as ``"\\ud800"`` (half of a UTF-16 pair). Python turns it into a
    string that cannot be encoded, which would later break validation messages and the response.
    An explicit loop (not recursion) keeps this safe for deeply nested bodies.
    """
    pending = [value]
    while pending:
        item = pending.pop()
        if isinstance(item, str):
            item.encode("utf-8")
        elif isinstance(item, dict):
            pending.extend(item.keys())
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)


def _parse_json(raw: bytes) -> object:
    try:
        parsed = json.loads(raw.decode("utf-8"), parse_constant=_reject_json_constant)
        _require_encodable_text(parsed)
    except (ValueError, RecursionError):
        # ValueError covers bad syntax, bad UTF-8, NaN/Infinity, over-long integer literals and
        # text that cannot be encoded as UTF-8 (UnicodeEncodeError is a ValueError).
        # RecursionError covers absurdly deep nesting that still fits inside the size limit.
        raise ProblemError(400) from None
    return parsed


@router.get("/health", response_model=HealthResponse)
async def health(request: Request, response: Response) -> HealthResponse:
    response.headers.update(NO_STORE)
    return HealthResponse(storage_mode=request.app.state.storage_mode)


@router.post("/api/v1/requests", response_model=DraftResponse, status_code=201)
async def create_purchase_request(
    request: Request,
    response: Response,
    service: RequestService = Depends(get_service),  # noqa: B008
) -> DraftResponse:
    # Writes can be switched off (task 0002, decision D9). A closed gate is the contract's own 404
    # problem, exactly what an unknown route returns. It is checked before anything else, so a
    # closed gate reads no body and stores nothing.
    if not request.app.state.writes_enabled:
        logger.warning("POST /api/v1/requests rejected: writes are disabled")
        raise ProblemError(404)

    # Order required by the contract: (404/405 by routing) -> 415 -> 413 -> 400 -> 422.
    if not _is_json_content_type(request.headers.get("content-type")):
        raise ProblemError(415)
    raw = await _read_body_limited(request, request.app.state.settings.max_body_bytes)
    body = _parse_json(raw)
    try:
        data = validate_create_request(body)
    except InvalidRequestBodyError as exc:
        raise ProblemError(422, exc.errors) from None

    # create_draft is synchronous and may talk to a database. Run it in a worker thread so the
    # event loop (and every other request, /health included) is never blocked while it waits.
    draft = await run_in_threadpool(service.create_draft, data)
    response.headers.update(NO_STORE)
    return DraftResponse.from_draft(draft, request.app.state.storage_mode)
