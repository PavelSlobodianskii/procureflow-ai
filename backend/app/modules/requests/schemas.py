"""Pydantic schemas: strict request validation and the typed response bodies."""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Annotated, Any, Final, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationError,
    field_validator,
)
from pydantic_core import PydanticCustomError

from app.modules.requests import domain
from app.modules.requests.domain import Draft, PurchaseRequestData
from app.modules.requests.messages import FIELD_MESSAGES, UNKNOWN_FIELD_MESSAGE
from app.platform.settings import SERVICE_NAME, SERVICE_VERSION, STORAGE_MODE

# [0-9] and fullmatch on purpose: "\d" accepts non-ASCII digits and "$" accepts a trailing newline.
_PRICE_PATTERN: Final = re.compile(r"(0|[1-9][0-9]*)(\.[0-9]{1,2})?")

FIELD_ORDER: Final = (
    "description",
    "quantity",
    "unit_price",
    "currency",
    "requester_display_name",
)

# Pydantic error type -> contract error code.
_CODE_BY_ERROR_TYPE: Final = {
    "missing": "required",
    "string_type": "invalid_type",
    "int_type": "invalid_type",
    "string_too_short": "too_short",
    "string_too_long": "too_long",
    "greater_than_equal": "out_of_range",
    "less_than_equal": "out_of_range",
    "extra_forbidden": "unknown_field",
    # Custom errors raised below already use the contract code as their type.
    "invalid_format": "invalid_format",
    "out_of_range": "out_of_range",
    "invalid_choice": "invalid_choice",
}


class CreatePurchaseRequest(BaseModel):
    """Body of ``POST /api/v1/requests``. Strict types, unknown fields rejected."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    # Whitespace is stripped BEFORE the length rules, so " ab " is too short.
    description: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=domain.DESCRIPTION_LENGTH[0],
            max_length=domain.DESCRIPTION_LENGTH[1],
        ),
    ]
    quantity: Annotated[int, Field(ge=domain.QUANTITY_MIN, le=domain.QUANTITY_MAX)]
    unit_price: str
    currency: str
    requester_display_name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=domain.REQUESTER_NAME_LENGTH[0],
            max_length=domain.REQUESTER_NAME_LENGTH[1],
        ),
    ]

    @field_validator("unit_price", mode="after")
    @classmethod
    def _check_unit_price(cls, value: str) -> str:
        if _PRICE_PATTERN.fullmatch(value) is None:
            raise PydanticCustomError("invalid_format", "invalid unit price format")
        amount = Decimal(value)
        if amount <= 0 or amount > domain.UNIT_PRICE_MAX:
            raise PydanticCustomError("out_of_range", "unit price out of range")
        return value

    @field_validator("currency", mode="after")
    @classmethod
    def _check_currency(cls, value: str) -> str:
        if value not in domain.CURRENCIES:
            raise PydanticCustomError("invalid_choice", "unsupported currency")
        return value

    def to_domain(self) -> PurchaseRequestData:
        return PurchaseRequestData(
            description=self.description,
            quantity=self.quantity,
            unit_price=domain.normalise_price(Decimal(self.unit_price)),
            currency=self.currency,
            requester_display_name=self.requester_display_name,
        )


def _error(field: str, code: str) -> dict[str, str]:
    message = UNKNOWN_FIELD_MESSAGE if code == "unknown_field" else FIELD_MESSAGES[field][code]
    return {"field": field, "code": code, "message": message}


def not_an_object_errors() -> list[dict[str, str]]:
    return [_error("$", "invalid_type")]


def translate_errors(exc: ValidationError, body: dict[str, Any]) -> list[dict[str, str]]:
    """Turn Pydantic errors into contract errors.

    One error per field (the first failing rule), in schema field order, followed by unknown
    fields in the order they appear in the body. The order is built here explicitly, not
    taken from Pydantic.
    """
    per_field: dict[str, str] = {}
    unknown: dict[str, str] = {}
    for item in exc.errors():
        field = str(item["loc"][0])
        # A missing code mapping is a programming error: fail loudly (becomes the generic 500).
        code = _CODE_BY_ERROR_TYPE[item["type"]]
        if code == "unknown_field":
            unknown.setdefault(field, code)
        else:
            per_field.setdefault(field, code)

    errors = [_error(field, per_field[field]) for field in FIELD_ORDER if field in per_field]
    errors.extend(_error(key, "unknown_field") for key in body if key in unknown)
    return errors


class InvalidRequestBodyError(Exception):
    """The body failed validation. ``errors`` is ready for the 422 problem."""

    def __init__(self, errors: list[dict[str, str]]) -> None:
        super().__init__("invalid request body")
        self.errors = errors


def validate_create_request(body: object) -> PurchaseRequestData:
    if not isinstance(body, dict):
        raise InvalidRequestBodyError(not_an_object_errors())
    try:
        model = CreatePurchaseRequest.model_validate(body)
    except ValidationError as exc:
        raise InvalidRequestBodyError(translate_errors(exc, body)) from None
    return model.to_domain()


# ---- Responses ---------------------------------------------------------------------------------


class DraftDataResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str
    quantity: int
    unit_price: str
    currency: str
    requester_display_name: str


class EstimatedTotalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: str
    currency: str


class DraftResponse(BaseModel):
    """201 body. Deliberately has no approval, purchase-order or supplier field."""

    model_config = ConfigDict(extra="forbid")

    id: str
    status: Literal["draft"]
    created_at: str
    storage_mode: Literal["in_memory_dev"]
    data: DraftDataResponse
    estimated_total: EstimatedTotalResponse

    @classmethod
    def from_draft(cls, draft: Draft) -> DraftResponse:
        data = draft.data
        return cls(
            id=draft.id,
            status=draft.status,
            created_at=domain.format_timestamp(draft.created_at),
            storage_mode=STORAGE_MODE,
            data=DraftDataResponse(
                description=data.description,
                quantity=data.quantity,
                unit_price=domain.format_money(data.unit_price),
                currency=data.currency,
                requester_display_name=data.requester_display_name,
            ),
            estimated_total=EstimatedTotalResponse(
                amount=domain.format_money(draft.estimated_total),
                currency=data.currency,
            ),
        )


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    service: Literal["procureflow-api"] = SERVICE_NAME
    version: str = SERVICE_VERSION
    storage_mode: Literal["in_memory_dev"] = STORAGE_MODE
