"""Domain logic for purchase-request drafts.

Money is computed here, by code, with ``Decimal`` only (never ``float``).
The only status that exists in this slice is ``draft``. Nothing here approves,
releases or sends anything anywhere.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Final, Literal

CURRENCIES: Final = ("EUR", "USD", "GBP", "CHF")
DRAFT_STATUS: Final = "draft"

QUANTITY_MIN: Final = 1
QUANTITY_MAX: Final = 100_000
UNIT_PRICE_MAX: Final = Decimal("10000000.00")
DESCRIPTION_LENGTH: Final = (3, 500)
REQUESTER_NAME_LENGTH: Final = (2, 80)

_CENTS: Final = Decimal("0.01")
_MAX_SEQUENCE: Final = 999_999


@dataclass(frozen=True)
class PurchaseRequestData:
    """The validated content of a request. All values are already normalised."""

    description: str
    quantity: int
    unit_price: Decimal  # exactly 2 decimal places
    currency: str
    requester_display_name: str


@dataclass(frozen=True)
class Draft:
    id: str
    created_at: datetime  # UTC, whole seconds
    data: PurchaseRequestData
    estimated_total: Decimal  # exactly 2 decimal places, same currency as the data
    status: Literal["draft"] = DRAFT_STATUS


def normalise_price(price: Decimal) -> Decimal:
    """Return the price with exactly 2 decimal places (``250`` -> ``250.00``)."""
    return price.quantize(_CENTS)


def estimate_total(quantity: int, unit_price: Decimal) -> Decimal:
    """quantity x unit price. Exact: an int times a 2-decimal Decimal needs no rounding."""
    return (Decimal(quantity) * unit_price).quantize(_CENTS)


def format_money(amount: Decimal) -> str:
    """Plain decimal string with no exponent, as used on the wire."""
    return format(amount, "f")


def utc_now_seconds() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def format_timestamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class RequestIdGenerator:
    """Per-process counter producing ``PR-<year>-<6 digits>``. Resets on restart."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._next = 1

    def next_id(self, moment: datetime) -> str:
        with self._lock:
            sequence = self._next
            if sequence > _MAX_SEQUENCE:
                raise OverflowError("request id sequence exhausted")
            self._next += 1
        return f"PR-{moment.year:04d}-{sequence:06d}"
