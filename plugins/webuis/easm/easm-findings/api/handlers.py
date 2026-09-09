"""EASM Portal page API handlers (identical for all six pages; synced by sync.py).

Stdlib only. Shared logic lives in easm_common.py next to this file and is loaded by path so
each page gets its own module instance (no cross-page sys.modules sharing).
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_PAGE = _HERE.parent.name


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"easm_{_PAGE}_{name}".replace("-", "_"), _HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


C = _load("easm_common")


def _empty(ctx, kind: str):
    base = {"is_admin": C.is_admin(ctx), "user": C.user_name(ctx), "database": "missing"}
    if kind == "rows":
        return {"rows": [], "total": 0, "page": 1, "size": 25, "period_id": None}
    if kind == "stats":
        return {"by_status": {}, "total": 0, "open": 0}
    if kind == "periods":
        return {"periods": [], **base}
    if kind == "entity":
        return {"record": None}
    if kind == "csv":
        return {"filename": "easm-findings.csv", "csv": "", "rows": 0}
    return {**C.EMPTY_SUMMARY, **base}


async def get_summary(ctx, request):
    if C.db_missing():
        return _empty(ctx, "summary")
    with C.conn() as c:
        return C.summary_payload(c, request, ctx)


async def get_periods(ctx, request):
    if C.db_missing():
        return _empty(ctx, "periods")
    with C.conn() as c:
        return {"periods": C.list_periods(c, ctx), "is_admin": C.is_admin(ctx), "user": C.user_name(ctx)}


async def get_rows(ctx, request):
    if C.db_missing():
        return _empty(ctx, "rows")
    with C.conn() as c:
        return C.rows_payload(c, request, ctx)


async def get_entity(ctx, request):
    if C.db_missing():
        return _empty(ctx, "entity")
    with C.conn() as c:
        return C.entity_payload(c, request, ctx)


async def get_findings_stats(ctx, request):
    if C.db_missing():
        return _empty(ctx, "stats")
    with C.conn() as c:
        return C.findings_stats(c, request, ctx)


async def get_findings_export(ctx, request):
    if C.db_missing():
        return _empty(ctx, "csv")
    with C.conn() as c:
        return C.findings_csv(c, request, ctx)


async def get_report(ctx, request):
    if C.db_missing():
        return _empty(ctx, "summary")
    with C.conn() as c:
        return C.report_payload(c, request, ctx)
