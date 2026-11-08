"""Safety: draft only, exactly two routes, no approval, no network, no CORS."""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import JSON_HEADERS, post_json, valid_body

APP_DIR = Path(__file__).resolve().parents[1] / "app"

ALLOWED_RESPONSE_KEYS = {"id", "status", "created_at", "storage_mode", "data", "estimated_total"}


def test_response_contains_only_contract_fields(client: TestClient) -> None:
    body = post_json(client, valid_body()).json()
    assert set(body) == ALLOWED_RESPONSE_KEYS
    assert set(body["data"]) == {
        "description",
        "quantity",
        "unit_price",
        "currency",
        "requester_display_name",
    }
    assert set(body["estimated_total"]) == {"amount", "currency"}
    assert body["status"] == "draft"
    assert body["storage_mode"] == "in_memory_dev"


def test_status_is_always_draft_and_ids_are_server_generated(client: TestClient) -> None:
    results = [post_json(client, valid_body()).json() for _ in range(3)]
    assert {r["status"] for r in results} == {"draft"}
    assert [r["id"] for r in results] == ["PR-2026-000001", "PR-2026-000002", "PR-2026-000003"]
    for result in results:
        assert re.fullmatch(r"PR-[0-9]{4}-[0-9]{6}", result["id"])


@pytest.mark.parametrize(
    "extra",
    [
        {"status": "approved"},
        {"status": "draft"},
        {"approved": True},
        {"approver": "x"},
        {"released": True},
        {"po_number": "PO-1"},
        {"supplier": "ACME"},
        {"id": "PR-2026-999999"},
        {"created_at": "2020-01-01T00:00:00Z"},
        {"estimated_total": {"amount": "0.01", "currency": "EUR"}},
    ],
)
def test_unknown_fields_are_rejected_and_nothing_is_stored(client: TestClient, repo, extra) -> None:
    response = post_json(client, valid_body() | extra)
    assert response.status_code == 422
    assert {e["code"] for e in response.json()["errors"]} == {"unknown_field"}
    assert repo.drafts() == []


def _all_routes(app) -> list:
    """Flatten the app's routes. This FastAPI version wraps included routers."""
    flat = []
    for route in app.routes:
        inner = getattr(route, "original_router", None)
        flat.extend(inner.routes if inner is not None else [route])
    return flat


def test_only_two_routes_exist(client: TestClient) -> None:
    routes = {(route.path, tuple(sorted(route.methods))) for route in _all_routes(client.app)}
    assert routes == {("/health", ("GET",)), ("/api/v1/requests", ("POST",))}


UNKNOWN_PATHS = [
    "/",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api",
    "/api/v1",
    "/api/v1/",
    "/api/v1/requests/",  # no slash redirects either
    "/api/v1/requests/PR-2026-000001",
    "/api/v1/requests/PR-2026-000001/approve",
    "/api/v1/requests/PR-2026-000001/release",
    "/api/v1/approvals",
    "/api/v1/purchase-orders",
    "/api/v1/suppliers",
    "/api/v2/requests",
    "/health/",
    "/healthz",
]


@pytest.mark.parametrize("path", UNKNOWN_PATHS)
@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE"])
def test_every_other_route_is_the_404_problem(client: TestClient, path: str, method: str) -> None:
    response = client.request(
        method, path, content=b"{}", headers=JSON_HEADERS, follow_redirects=False
    )
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["type"] == "urn:procureflow:problem:not-found"
    assert response.json()["instance"] == path


@pytest.mark.parametrize("method", ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"])
def test_wrong_method_on_requests_is_405_with_allow(client: TestClient, method: str) -> None:
    response = client.request(method, "/api/v1/requests")
    assert response.status_code == 405
    assert response.headers["allow"] == "POST"
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["type"] == "urn:procureflow:problem:method-not-allowed"


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_wrong_method_on_health_is_405(client: TestClient, method: str) -> None:
    response = client.request(method, "/health")
    assert response.status_code == 405
    assert response.headers["content-type"] == "application/problem+json"
    assert response.headers["allow"] == "GET"


def test_no_cors_headers_are_ever_sent(client: TestClient) -> None:
    headers = {"origin": "http://evil.example", "access-control-request-method": "POST"}
    for response in (
        client.get("/health", headers=headers),
        client.options("/api/v1/requests", headers=headers),
        post_json(client, valid_body()),
    ):
        assert not [h for h in response.headers if h.lower().startswith("access-control-")]


def test_no_store_on_every_kind_of_response(client: TestClient) -> None:
    responses = [
        client.get("/health"),
        post_json(client, valid_body()),
        post_json(client, {}),
        client.get("/nope"),
        client.get("/api/v1/requests"),
        client.post("/api/v1/requests", content=b"x", headers={"content-type": "text/plain"}),
    ]
    assert all(r.headers["cache-control"] == "no-store" for r in responses)


# ---- B4: static checks on the application source ----------------------------------------------

FORBIDDEN_IMPORTS = {
    "httpx", "requests", "urllib", "urllib3", "http", "socket", "ssl", "smtplib", "ftplib",
    "aiohttp", "websockets", "subprocess", "anthropic", "openai", "langchain", "langgraph",
}  # fmt: skip
FORBIDDEN_NAME_PARTS = ("approve", "release", "erp", "supplier", "purchase_order")


def _app_trees() -> list[tuple[Path, ast.AST]]:
    return [(p, ast.parse(p.read_text(encoding="utf-8"))) for p in APP_DIR.rglob("*.py")]


def test_app_imports_no_network_or_llm_libraries() -> None:
    for path, tree in _app_trees():
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                names = [node.module]
            for name in names:
                assert name.split(".")[0] not in FORBIDDEN_IMPORTS, f"{path.name} imports {name}"


def test_app_defines_no_approval_release_erp_or_supplier_code() -> None:
    for path, tree in _app_trees():
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
                lowered = node.name.lower()
                assert not any(part in lowered for part in FORBIDDEN_NAME_PARTS), (
                    f"{path.name}: {node.name}"
                )


def test_app_reads_no_environment_or_env_files() -> None:
    for path, tree in _app_trees():
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr in {"environ", "getenv"}:
                pytest.fail(f"{path.name} reads the environment")
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                # A path-like ".env" (start of string or after a slash), not prose in a docstring.
                assert not re.search(r"(^|[\\/])\.env\b", node.value), path.name
            if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "open":
                pytest.fail(f"{path.name} opens a file")


def test_app_factory_has_no_docs_routes() -> None:
    app = create_app(start_dispatcher=False)
    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None


# ---- Task 0002, phase 3: the PostgreSQL adapter stays contained and injection-proof --------------

POSTGRES_MODULE = "repository_postgres.py"


def test_psycopg_is_imported_only_by_the_postgres_repository() -> None:
    for path, tree in _app_trees():
        if path.name == POSTGRES_MODULE:
            continue
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                names = [node.module]
            for name in names:
                assert name.split(".")[0] != "psycopg", f"{path.name} imports {name}"


def test_postgres_repository_never_builds_sql_from_data() -> None:
    trees = {path.name: tree for path, tree in _app_trees()}
    tree = trees[POSTGRES_MODULE]

    # Module-level names that hold a plain string (adjacent literals are one constant).
    sql_constants = {
        target.id
        for node in tree.body
        if isinstance(node, ast.Assign)
        and isinstance(node.value, ast.Constant)
        and isinstance(node.value.value, str)
        for target in node.targets
        if isinstance(target, ast.Name)
    }
    assert {"_INSERT_DRAFT", "_INSERT_EVENT", "_SELECT_DUE", "_UPDATE_EVENT"} <= sql_constants

    executed = 0
    for node in ast.walk(tree):
        assert not isinstance(node, ast.JoinedStr), "f-string in the SQL module"
        if isinstance(node, ast.BinOp):
            assert not isinstance(node.op, ast.Mod | ast.Add), "string building in the SQL module"
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            assert node.func.attr != "format", ".format() in the SQL module"
            if node.func.attr == "execute":
                executed += 1
                first = node.args[0]
                assert isinstance(first, ast.Name) and first.id in sql_constants, (
                    "execute() must be given a module-level constant, never built text"
                )
    assert executed >= 8


def test_the_app_still_uses_the_in_memory_repository() -> None:
    # Step 1 of phase 3 only adds the adapter. Wiring it in is a separate, approved step.
    from app.modules.requests.repository_memory import InMemoryRequestRepository

    app = create_app(start_dispatcher=False)
    assert isinstance(app.state.service._repository, InMemoryRequestRepository)


# ---- Task 0002, phase 3: only the Vercel entry point reads the environment -----------------------

BACKEND_DIR = APP_DIR.parent
ENTRY_POINT = "index.py"


def _reads_environment(tree: ast.AST) -> bool:
    return any(
        isinstance(node, ast.Attribute) and node.attr in {"environ", "getenv"}
        for node in ast.walk(tree)
    )


def test_only_the_vercel_entry_point_reads_the_environment() -> None:
    readers = {
        path.relative_to(BACKEND_DIR).as_posix()
        for path in [*APP_DIR.rglob("*.py"), *BACKEND_DIR.glob("*.py")]
        if _reads_environment(ast.parse(path.read_text(encoding="utf-8")))
    }
    assert readers == {ENTRY_POINT}


def test_the_entry_point_never_prints_or_logs_the_database_setting() -> None:
    tree = ast.parse((BACKEND_DIR / ENTRY_POINT).read_text(encoding="utf-8"))
    log_methods = {"debug", "info", "warning", "error", "exception", "critical"}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = (
            node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", "")
        )
        if name == "print" or name in log_methods:
            for argument in node.args:
                names = {n.id for n in ast.walk(argument) if isinstance(n, ast.Name)}
                assert not names & {"database_url", "dsn", "environ"}, f"{name}() uses {names}"
            if name == "print":
                pytest.fail("index.py must not print")


def test_the_entry_point_opens_writes_only_for_the_exact_value_one() -> None:
    source = (BACKEND_DIR / ENTRY_POINT).read_text(encoding="utf-8")
    assert 'environ.get("POSTGRES_WRITES_ENABLED") == "1"' in source
    assert "start_dispatcher=False" in source  # no in-process dispatcher on Vercel
