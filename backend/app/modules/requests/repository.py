"""Repository interface for purchase-request drafts."""

from __future__ import annotations

from typing import Protocol

from app.modules.requests.domain import Draft
from app.modules.requests.events import OutboxEvent, OutboxPort


class RequestRepository(Protocol):
    def add(self, draft: Draft, event: OutboxEvent) -> None:
        """Store the draft and its outbox event together, all or nothing.

        In a real database this is one transaction. It is the only write method.
        """
        ...


class OutboxRepository(RequestRepository, OutboxPort, Protocol):
    """A store that can both take new drafts and feed the in-process dispatcher.

    The app needs this combination. It is kept separate from ``RequestRepository`` so that
    interface stays at exactly one write method (``add``).
    """
