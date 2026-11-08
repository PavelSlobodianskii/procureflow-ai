"""Vercel entry point for the backend project (task 0002, phase 3).

Vercel imports ``app`` from this file (``[tool.vercel] entrypoint = "index:app"`` in
pyproject.toml). Local development does NOT use it: run ``uvicorn app.main:app`` as before.

This is the only file outside the tests that reads the environment. The application package
(``app/``) reads none, and a test enforces that.

What it builds, by environment (``build_app`` below):

* Not on Vercel (``VERCEL`` unset): the same app as ``app.main`` (in-memory, writes open).
* On Vercel, with BOTH ``DATABASE_URL`` and ``POSTGRES_WRITES_ENABLED=1``: drafts are stored in
  PostgreSQL and writes are open. Building the app does NOT open a database connection. The
  first connection happens on the first request that needs one.
* On Vercel, anything else (the default): **writes are closed**. ``POST /api/v1/requests``
  answers the contract's 404 problem, exactly like an unknown route, and stores nothing.
  ``GET /health`` still works. No database is touched.

``POSTGRES_WRITES_ENABLED`` is a switch the OWNER sets in the Vercel dashboard, and only after the
PostgreSQL integration tests have passed against a real test database (task 0002, D9). Only the
exact value ``1`` opens writes. ``DATABASE_URL`` is a secret: it is never logged or printed here.

There is no in-process dispatcher on Vercel: a serverless function cannot run one reliably, and
a dispatcher that polls a database from the event loop is not supported (see ``create_app``).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable, Mapping

from fastapi import FastAPI

from app.main import create_app
from app.modules.requests.repository_postgres import (
    ConnectionFactory,
    PostgresRequestIdGenerator,
    PostgresRequestRepository,
    make_connection_factory,
)

logger = logging.getLogger("procureflow.entrypoint")


def build_app(
    environ: Mapping[str, str],
    *,
    make_factory: Callable[[str], ConnectionFactory] = make_connection_factory,
) -> FastAPI:
    """Build the app for this environment. ``make_factory`` is injectable so tests never connect."""
    if not environ.get("VERCEL"):
        return create_app()

    database_url = environ.get("DATABASE_URL", "")
    writes_opened = environ.get("POSTGRES_WRITES_ENABLED") == "1"

    if writes_opened and database_url:
        connect = make_factory(database_url)  # builds a function; opens no connection
        return create_app(
            repository=PostgresRequestRepository(connect),
            ids=PostgresRequestIdGenerator(connect),
            start_dispatcher=False,
            writes_enabled=True,
        )

    if writes_opened:
        logger.error(
            "POSTGRES_WRITES_ENABLED is 1 but DATABASE_URL is not set: writes stay disabled"
        )
    return create_app(start_dispatcher=False, writes_enabled=False)


app = build_app(os.environ)
