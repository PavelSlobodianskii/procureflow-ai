"""Repository interface for purchase-request drafts."""

from __future__ import annotations

from typing import Protocol

from app.modules.requests.domain import Draft
from app.modules.requests.events import OutboxEvent


class RequestRepository(Protocol):
    def add(self, draft: Draft, event: OutboxEvent) -> None:
        """Store the draft and its outbox event together, all or nothing.

        In a real database this is one transaction. It is the only write method.
        """
        ...
