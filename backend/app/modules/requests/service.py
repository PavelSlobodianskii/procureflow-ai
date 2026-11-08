"""Application service: creates a purchase-request DRAFT. It approves nothing."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime

from app.modules.requests import domain
from app.modules.requests.domain import Draft, PurchaseRequestData, RequestIdGenerator
from app.modules.requests.events import new_drafted_event
from app.modules.requests.repository import RequestRepository


def _new_event_id() -> str:
    return str(uuid.uuid4())


class RequestService:
    def __init__(
        self,
        repository: RequestRepository,
        ids: RequestIdGenerator,
        clock: Callable[[], datetime] = domain.utc_now_seconds,
        event_id_factory: Callable[[], str] = _new_event_id,
    ) -> None:
        self._repository = repository
        self._ids = ids
        self._clock = clock
        self._event_id_factory = event_id_factory

    def create_draft(self, data: PurchaseRequestData) -> Draft:
        now = self._clock()
        draft = Draft(
            id=self._ids.next_id(now),
            created_at=now,
            data=data,
            estimated_total=domain.estimate_total(data.quantity, data.unit_price),
        )
        event = new_drafted_event(self._event_id_factory(), draft.id, now)
        self._repository.add(draft, event)
        return draft
