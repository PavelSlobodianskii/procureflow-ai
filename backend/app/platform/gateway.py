"""Gateway gate: only the frontend project may talk to this backend (task 0002, phase 2b).

The frontend adds a shared token to every request it forwards, in the header
``x-procureflow-gateway``. This gate runs before routing. A request without exactly that token
gets the contract's existing 404 problem for its path, the same answer an unknown route gives,
so a caller without the token cannot even tell which routes exist. No new status code and no new
problem type: contract v1 is unchanged.

Three modes:

* ``token=None`` and ``closed=False`` (the default): the gate is off. Local development and
  every test that does not ask for a gate behave exactly as before.
* ``token="..."``: every HTTP request must carry the token.
* ``closed=True``: every HTTP request is refused, whatever it carries. The Vercel entry point
  uses this when the token is missing or too short (fail closed).

The token is compared with ``hmac.compare_digest`` so the time taken does not reveal how many
leading characters were right. It is never logged and never part of a response.
"""

from __future__ import annotations

import hmac
import logging

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.platform.problems import problem_response

logger = logging.getLogger("procureflow.api")

GATEWAY_HEADER = "x-procureflow-gateway"
_HEADER_BYTES = GATEWAY_HEADER.encode("ascii")


class GatewayGate:
    """Pure ASGI middleware. See the module docstring for the three modes."""

    def __init__(self, app: ASGIApp, *, token: str | None = None, closed: bool = False) -> None:
        if token is not None and not token:
            # An empty token would compare equal to an empty header. Refuse to build that.
            raise ValueError("the gateway token must not be empty")
        self._app = app
        self._token = token.encode("utf-8") if token is not None else None
        self._closed = closed

    def _allows(self, scope: Scope) -> bool:
        if self._closed:
            return False
        if self._token is None:
            return True
        presented = [value for name, value in scope["headers"] if name == _HEADER_BYTES]
        # Exactly one header: two different values must not be able to "vote".
        return len(presented) == 1 and hmac.compare_digest(presented[0], self._token)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or self._allows(scope):
            await self._app(scope, receive, send)
            return
        path = Request(scope).url.path
        logger.warning("%s %s refused by the gateway gate", scope["method"], path)
        await problem_response(404, path)(scope, receive, send)
