"""FastAPI application factory for the purchase-request slice.

Run from the ``backend`` folder (PowerShell)::

    .\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

DEV ONLY: storage is in memory and lost on restart. There is no authentication yet,
so the server must stay bound to 127.0.0.1.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import random
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI

from app.modules.requests import domain
from app.modules.requests.api import router
from app.modules.requests.dispatcher import Dispatcher, EventHandler, log_event_handler
from app.modules.requests.domain import RequestIdGenerator, RequestIdSource
from app.modules.requests.repository import OutboxRepository
from app.modules.requests.repository_memory import InMemoryRequestRepository
from app.modules.requests.service import RequestService
from app.platform.problems import register_problem_handlers
from app.platform.settings import SERVICE_VERSION, STORAGE_MODE, STORAGE_MODES, Settings

logger = logging.getLogger("procureflow.api")


def create_app(
    *,
    settings: Settings | None = None,
    repository: OutboxRepository | None = None,
    ids: RequestIdSource | None = None,
    writes_enabled: bool = True,
    clock: Callable[[], datetime] = domain.utc_now_seconds,  # created_at and event times
    dispatcher_clock: Callable[[], datetime] = domain.utc_now,  # full precision for retries
    handler: EventHandler = log_event_handler,
    rand: Callable[[], float] = random.random,
    start_dispatcher: bool = True,
) -> FastAPI:
    """Build the app. The keyword arguments exist so tests can inject fakes.

    ``ids`` is where request IDs come from (default: the in-memory counter). ``writes_enabled``
    switches ``POST /api/v1/requests`` off: a closed gate answers with the contract's 404 problem,
    exactly like an unknown route (task 0002, decision D9). Both default to the old behaviour.
    """
    settings = settings or Settings()
    repo = repository if repository is not None else InMemoryRequestRepository()

    # The repository says where drafts are kept. The API reports exactly that, and only values
    # that a contract version knows (v1: "in_memory_dev", v1.1 adds "postgres").
    storage_mode = getattr(repo, "storage_mode", STORAGE_MODE)
    if storage_mode not in STORAGE_MODES:
        raise ValueError(
            f"unknown storage_mode {storage_mode!r}; the contract allows {STORAGE_MODES}"
        )
    if start_dispatcher and storage_mode != STORAGE_MODE:
        # The dispatcher polls on the event loop with blocking calls. That is fine in memory and
        # wrong for a database. A real worker process is a separate, later task.
        raise ValueError("the in-process dispatcher is for the in-memory repository only")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if storage_mode == STORAGE_MODE:
            logger.warning(
                "DEV ONLY: purchase requests are kept in process memory "
                "(storage_mode=in_memory_dev). "
                "They are NOT durable and are lost when this process stops."
            )
        else:
            logger.info("Purchase requests are stored with storage_mode=%s.", storage_mode)
        task: asyncio.Task[None] | None = None
        if start_dispatcher:
            dispatcher = Dispatcher(
                repo, handler, settings=settings, clock=dispatcher_clock, rand=rand
            )
            task = asyncio.create_task(dispatcher.run_forever())
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    # No /docs, /redoc or /openapi.json, and no slash redirects: the contract says that
    # exactly two routes exist and everything else is the 404 problem.
    app = FastAPI(
        title="ProcureFlow API",
        version=SERVICE_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        redirect_slashes=False,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.storage_mode = storage_mode
    app.state.writes_enabled = writes_enabled
    id_source = ids if ids is not None else RequestIdGenerator()
    app.state.service = RequestService(repo, id_source, clock)
    app.include_router(router)
    register_problem_handlers(app)
    return app


app = create_app()
