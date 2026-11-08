-- Migration 0001: purchase-request drafts, their outbox events and the request ID sequence.
--
-- Task 0002, phase 3. SYNTHETIC DATA ONLY.
--
-- How this file is used:
--   * The OWNER applies it by hand (for example in the Neon SQL editor). No code applies it.
--   * Once it has been applied anywhere, NEVER edit it. Add 0002_... for any further change.
--
-- The constraints below repeat the rules of app/modules/requests/domain.py as defence in depth.
-- Validation stays in the application. A test (test_migration_sql.py) fails if the two drift apart.

-- The numeric part of a request ID (PR-<year>-<6 digits>). It cannot pass 999999 and never wraps,
-- so the ID format of the frozen API contract always holds. At the limit, nextval() raises an error.
CREATE SEQUENCE purchase_request_seq
    AS bigint
    MINVALUE 1
    MAXVALUE 999999
    NO CYCLE;

CREATE TABLE purchase_requests (
    id text PRIMARY KEY CHECK (id ~ '^PR-[0-9]{4}-[0-9]{6}$'),
    created_at timestamptz NOT NULL,
    description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 500),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
    unit_price numeric(12, 2) NOT NULL CHECK (unit_price > 0 AND unit_price <= 10000000.00),
    currency text NOT NULL CHECK (currency IN ('EUR', 'USD', 'GBP', 'CHF')),
    requester_display_name text NOT NULL
        CHECK (char_length(requester_display_name) BETWEEN 2 AND 80),
    estimated_total numeric(16, 2) NOT NULL CHECK (estimated_total > 0),
    status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft')
);

-- One row per event. The payload holds the request ID only, never request content.
CREATE TABLE outbox_events (
    event_id text PRIMARY KEY,
    type text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'dispatched', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Serves the "which events are due" lookup without scanning finished events.
CREATE INDEX outbox_events_due_idx ON outbox_events (next_attempt_at) WHERE status = 'pending';
