"""The migration file must say what the domain code says. It is read here, never applied.

No database is involved: these are text checks that fail when ``0001_purchase_requests.sql`` and
``app/modules/requests/domain.py`` drift apart, or when the adapter writes a column the SQL lacks.
"""

from __future__ import annotations

import re

import pytest

from app.modules.requests import domain, repository_postgres
from app.modules.requests.events import EventStatus
from tests.helpers import BACKEND_DIR

MIGRATION = BACKEND_DIR / "migrations" / "0001_purchase_requests.sql"


def sql_without_comments() -> str:
    text = MIGRATION.read_text(encoding="utf-8")
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("--"))


def table_block(name: str) -> str:
    match = re.search(rf"CREATE TABLE {name} \((.*?)\n\);", sql_without_comments(), re.S)
    assert match, f"table {name} not found"
    return match.group(1)


def quoted_list(values: tuple[str, ...] | list[str]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def test_the_sequence_stops_where_the_id_format_stops_and_never_wraps() -> None:
    sql = sql_without_comments()
    assert f"MAXVALUE {domain._MAX_SEQUENCE}" in sql
    assert "MINVALUE 1" in sql
    assert "NO CYCLE" in sql
    assert "CREATE SEQUENCE purchase_request_seq" in sql  # the name the adapter uses
    assert "purchase_request_seq" in repository_postgres._NEXT_ID


def test_purchase_request_constraints_match_the_domain_rules() -> None:
    block = table_block("purchase_requests")
    description_min, description_max = domain.DESCRIPTION_LENGTH
    name_min, name_max = domain.REQUESTER_NAME_LENGTH
    expected = [
        r"id ~ '^PR-[0-9]{4}-[0-9]{6}$'",
        f"char_length(description) BETWEEN {description_min} AND {description_max}",
        f"quantity BETWEEN {domain.QUANTITY_MIN} AND {domain.QUANTITY_MAX}",
        f"unit_price > 0 AND unit_price <= {format(domain.UNIT_PRICE_MAX, 'f')}",
        f"currency IN ({quoted_list(domain.CURRENCIES)})",
        f"char_length(requester_display_name) BETWEEN {name_min} AND {name_max}",
        f"status = '{domain.DRAFT_STATUS}'",
    ]
    for fragment in expected:
        assert fragment in block, f"missing or different: {fragment}"


def test_money_columns_are_exact_decimals_never_floats() -> None:
    block = table_block("purchase_requests")
    assert "unit_price numeric(12, 2)" in block
    assert "estimated_total numeric(16, 2)" in block
    assert not re.search(r"\b(real|double precision|float\d*)\b", block, re.I)
    # The largest possible total (maximum quantity times maximum price) must fit.
    largest = domain.estimate_total(domain.QUANTITY_MAX, domain.UNIT_PRICE_MAX)
    assert len(str(largest).replace(".", "")) <= 16


def test_outbox_statuses_match_the_event_states() -> None:
    block = table_block("outbox_events")
    states = [state.value for state in EventStatus]
    assert f"status IN ({quoted_list(states)})" in block
    assert "payload jsonb NOT NULL" in block


def test_every_column_the_adapter_writes_exists_in_the_matching_table() -> None:
    for statement, table in (
        (repository_postgres._INSERT_DRAFT, "purchase_requests"),
        (repository_postgres._INSERT_EVENT, "outbox_events"),
    ):
        match = re.search(r"\(([^)]*)\) VALUES", statement)
        assert match
        columns = [column.strip() for column in match.group(1).split(",")]
        block = table_block(table)
        for column in columns:
            assert re.search(rf"^\s*{column}\s", block, re.M), f"{table} has no column {column}"


def test_the_migration_only_creates_things() -> None:
    sql = sql_without_comments()
    for word in ("DROP", "TRUNCATE", "DELETE", "ALTER", "GRANT", "REVOKE"):
        assert not re.search(rf"\b{word}\b", sql, re.I), f"{word} in the migration"
    created = re.findall(r"^CREATE (\w+)", sql, re.M)
    assert sorted(created) == ["INDEX", "SEQUENCE", "TABLE", "TABLE"]


def test_the_due_lookup_has_a_partial_index() -> None:
    assert "ON outbox_events (next_attempt_at) WHERE status = 'pending'" in sql_without_comments()


def test_the_migration_holds_no_secret_or_personal_text() -> None:
    text = MIGRATION.read_text(encoding="utf-8")
    for pattern in (r"postgres(ql)?://", r"password", r"@", r"C:\\", r"/Users/"):
        assert not re.search(pattern, text, re.I), pattern


@pytest.mark.parametrize("name", ["0001_purchase_requests.sql"])
def test_migration_files_are_numbered_and_listed(name: str) -> None:
    files = sorted(path.name for path in (BACKEND_DIR / "migrations").glob("*.sql"))
    assert files == [name]  # a new file here must be a deliberate, reviewed change
