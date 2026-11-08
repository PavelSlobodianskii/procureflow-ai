"""Shared fixtures."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.modules.requests.repository_memory import InMemoryRequestRepository
from tests.helpers import FakeClock


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def repo() -> InMemoryRequestRepository:
    return InMemoryRequestRepository()


@pytest.fixture
def client(repo: InMemoryRequestRepository, clock: FakeClock) -> TestClient:
    # No ``with``: the lifespan (and the background dispatcher) does not run in these tests.
    app = create_app(repository=repo, clock=clock, start_dispatcher=False)
    # raise_server_exceptions=False: an unexpected error must come back as the 500 problem.
    return TestClient(app, raise_server_exceptions=False)
