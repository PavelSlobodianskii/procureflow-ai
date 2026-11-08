"""RFC 9457 problem responses, the only error format this API uses."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("procureflow.api")

PROBLEM_MEDIA_TYPE = "application/problem+json"
NO_STORE = {"Cache-Control": "no-store"}

# (type URN, title, default detail) per status code, taken from the frozen contract.
_PROBLEMS: dict[int, tuple[str, str, str]] = {
    400: (
        "urn:procureflow:problem:invalid-json",
        "Invalid JSON",
        "The request body is not valid JSON.",
    ),
    404: ("urn:procureflow:problem:not-found", "Not found", "No such route."),
    405: (
        "urn:procureflow:problem:method-not-allowed",
        "Method not allowed",
        "This route does not allow that HTTP method.",
    ),
    413: (
        "urn:procureflow:problem:payload-too-large",
        "Payload too large",
        "The request body must not exceed 16384 bytes.",
    ),
    415: (
        "urn:procureflow:problem:unsupported-media-type",
        "Unsupported media type",
        "Content-Type must be application/json.",
    ),
    422: (
        "urn:procureflow:problem:validation-error",
        "Validation failed",
        "One or more fields are invalid.",
    ),
    500: (
        "urn:procureflow:problem:internal-error",
        "Internal error",
        "An unexpected error occurred.",
    ),
}


def problem_response(
    status: int,
    instance: str,
    errors: list[dict[str, str]] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    type_urn, title, detail = _PROBLEMS[status]
    body: dict[str, Any] = {
        "type": type_urn,
        "title": title,
        "status": status,
        "detail": detail,
        "instance": instance,
    }
    if errors is not None:
        body["errors"] = errors
    return JSONResponse(
        body,
        status_code=status,
        media_type=PROBLEM_MEDIA_TYPE,
        headers={**NO_STORE, **(headers or {})},
    )


class ProblemError(Exception):
    """Raised by route code to produce a specific problem response."""

    def __init__(self, status: int, errors: list[dict[str, str]] | None = None) -> None:
        super().__init__(status)
        self.status = status
        self.errors = errors


def register_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemError)
    async def _problem(request: Request, exc: ProblemError) -> JSONResponse:
        return problem_response(exc.status, request.url.path, exc.errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 405:
            allow = (exc.headers or {}).get("Allow")
            return problem_response(
                405, request.url.path, headers={"Allow": allow} if allow else None
            )
        # Everything else raised by the framework (unknown route and so on) is a 404.
        return problem_response(404, request.url.path)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Details go to the server log only. The response never carries internals.
        logger.error("Unhandled error on %s", request.url.path, exc_info=exc)
        return problem_response(500, request.url.path)
