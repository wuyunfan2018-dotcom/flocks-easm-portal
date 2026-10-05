"""Shared read-only data access for the EASM Portal page APIs.

Loaded by each page's handlers.py via importlib (page-local module, stdlib only).
Rules that every page relies on:
  * default period = latest *published*; admins may also see drafts (?period=<id> or when no published period exists)
  * members never see draft periods
  * nothing here ever returns password_enc / password_fp
  * table rows are always paged (size <= 100); aggregates come from summary.aggregates (computed at ingest)
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sqlite3
from pathlib import Path


def easm_db_path() -> Path:
    """easm.db lives in the Flocks data directory: EASM_DB_PATH > FLOCKS_DATA_DIR > XDG_DATA_HOME/flocks > FLOCKS_ROOT/data > ~/.flocks/data."""
    explicit = os.environ.get("EASM_DB_PATH")
    if explicit:
        return Path(explicit).expanduser()
    data_dir = os.environ.get("FLOCKS_DATA_DIR")
    if data_dir:
        return Path(data_dir).expanduser() / "easm.db"
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg).expanduser() / "flocks" / "easm.db"
    root = os.environ.get("FLOCKS_ROOT")
    base = Path(root).expanduser() if root else Path.home() / ".flocks"
    return base / "data" / "easm.db"


DB = easm_db_path()
PAGE_SIZE_MAX = 100
CSV_CHUNK = 5000  # rows per /findings/export slice (~0.7 MB), under the 2 MB page-API response cap
SECRET_FIELDS = ("password_enc", "password_fp")
MODULES = {
    "domains", "ips", "websites", "services", "components", "certificates", "http_configs",
    "mobile_apps", "wechat_accounts", "wechat_mini_programs",
    "login_portals", "risky_services", "certificate_risks", "malicious_ip_tags", "vulnerabilities",
    "dark_web", "files", "exposed_files", "code", "credentials", "emails", "findings",
}
FIELD_RE = re.compile(r"^_?[A-Za-z][A-Za-z0-9_]*$")
FINDING_MODULE = {"certificate_risks": "certificates"}
CUSTOMER_STATUSES = ["open", "acknowledged", "in_progress", "resolved", "false_positive", "risk_accepted"]


def db_missing() -> bool:
    return not DB.is_file()


EMPTY_SUMMARY = {"period": None, "periods": [], "latest": None, "summary": None, "aggregates": {}, "previous_summary": None, "previous_period": None, "exposure_index": None, "narrative": None, "coverage": None, "diff": None}


def conn():
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=10)
    c.row_factory = sqlite3.Row
    return c


def is_admin(ctx) -> bool:
    user = getattr(ctx, "user", None)
    return getattr(user, "role", None) == "admin"


def user_name(ctx) -> str:
    user = getattr(ctx, "user", None)
    return str(getattr(user, "username", None) or getattr(user, "id", None) or "")


def qp(request, key, default=""):
    try:
        v = request.query_params.get(key)
    except Exception:
        v = None
    return default if v is None else v


def _period_row(r) -> dict:
    d = dict(r)
    d["needs_review"] = bool(d.get("needs_review"))
    return d


def list_periods(c, ctx) -> list[dict]:
    rows = c.execute("SELECT period_id, customer_id, customer_name, report_no, report_date, label, status, previous_period_id, loaded_at, published_at, published_by, needs_review FROM periods ORDER BY report_date DESC, period_id DESC").fetchall()
    out = [_period_row(r) for r in rows]
    if not is_admin(ctx):
        out = [p for p in out if p["status"] == "published"]
    return out


def resolve_period(c, request, ctx) -> dict | None:
    """?period=<id> (must be visible to the caller) else latest published, else (admin only) latest draft."""
    periods = list_periods(c, ctx)
    want = qp(request, "period")
    if want:
        for p in periods:
            if p["period_id"] == want:
                return p
        return None
    published = [p for p in periods if p["status"] == "published"]
    if published:
        return published[0]
    if is_admin(ctx) and periods:
        return periods[0]
    return None


def kpi_backfill(summary: dict) -> dict | None:
    """previous_summary block as stored at ingest (period_id, report_no, report_date, source, kpis)."""
    prev = (summary or {}).get("previous_summary")
    return prev if isinstance(prev, dict) else None


def _dig(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def derive_kpis(summ: dict) -> dict:
    """Same KPI keys as a previous-summary.json backfill, computed from a period snapshot stored in the DB
    (so the Overview tiles get period-over-period deltas without a hand-written backfill file)."""
    a, r, l = summ.get("assets") or {}, summ.get("risks") or {}, summ.get("leaks") or {}
    return {
        "domains_current": _dig(a, "domains", "current"), "ips_total": _dig(a, "ips", "total_rows"), "websites": _dig(a, "websites", "total_rows"),
        "ips_with_open_services": _dig(a, "services", "ips_with_current_services"), "wechat_official_accounts": _dig(a, "wechat_official_accounts", "total_rows"),
        "wechat_mini_programs": _dig(a, "wechat_mini_programs", "total_rows"), "mobile_apps": _dig(a, "mobile_apps", "current"),
        "login_portals": _dig(r, "login_portals", "current"), "risky_services": _dig(r, "risky_services", "current"), "certificate_risks": _dig(r, "certificates", "current"),
        "malicious_ip_tags": _dig(r, "malicious_ip_tags", "current"), "vulnerabilities": _dig(r, "vulnerabilities", "current"),
        "dark_web_open": _dig(l, "dark_web", "open"), "files_open": _dig(l, "files", "open"), "exposed_files_current": _dig(l, "exposed_files", "current"),
        "code_current": _dig(l, "code", "current"), "emails": _dig(l, "emails", "total"),
        "credentials": _dig(l, "credentials", "total"), "credentials_verified": _dig(l, "credentials", "verified_login"),
    }


def table_exists(c, name: str) -> bool:
    return c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def load_summary(c, period_id: str) -> dict:
    row = c.execute("SELECT summary_json, exposure_json, narrative_json, coverage_json, diff_json FROM summary WHERE period_id=?", (period_id,)).fetchone()
    if not row:
        return {"summary": None, "exposure_index": None, "narrative": None, "coverage": None, "diff": None}
    def j(v):
        try:
            return json.loads(v) if v else None
        except Exception:
            return None
    return {"summary": j(row["summary_json"]), "exposure_index": j(row["exposure_json"]), "narrative": j(row["narrative_json"]), "coverage": j(row["coverage_json"]), "diff": j(row["diff_json"])}


def summary_payload(c, request, ctx) -> dict:
    periods = list_periods(c, ctx)
    period = resolve_period(c, request, ctx)
    latest_published = next((p for p in periods if p["status"] == "published"), None)
    if not period:
        return {"period": None, "periods": periods, "latest": None, "is_admin": is_admin(ctx), "user": user_name(ctx), "summary": None}
    s = load_summary(c, period["period_id"])
    summ = s["summary"] or {}
    prev = kpi_backfill(summ)
    # previous period visible in the DB (detail-level) if any
    prev_row = None
    if period.get("previous_period_id"):
        prev_row = next((p for p in periods if p["period_id"] == period["previous_period_id"]), None)
    if prev is None and prev_row:
        prev_summ = load_summary(c, prev_row["period_id"])["summary"]
        if isinstance(prev_summ, dict):
            prev = {"period_id": prev_row["period_id"], "report_no": prev_row.get("report_no"), "report_date": prev_row.get("report_date"),
                    "source": f"KPIs derived from the {prev_row.get('label') or prev_row['period_id']} snapshot", "kpis": derive_kpis(prev_summ)}
    agg = summ.pop("aggregates", None) if isinstance(summ, dict) else None
    # KPI-only backfill periods (previous-summary.json at ingest) that have no snapshot of their own: list all of
    # them, with the period whose payload carries the numbers, so the switcher can reach them from any period.
    kpi_periods = []
    db_ids = {p["period_id"] for p in periods}
    for p in periods:
        row = c.execute("SELECT json_extract(summary_json, '$.previous_summary') FROM summary WHERE period_id=?", (p["period_id"],)).fetchone()
        try:
            ps = json.loads(row[0]) if row and row[0] else None
        except Exception:
            ps = None
        if isinstance(ps, dict) and ps.get("period_id") and ps["period_id"] not in db_ids and isinstance(ps.get("kpis"), dict):
            if not any(k["period_id"] == ps["period_id"] for k in kpi_periods):
                kpi_periods.append({**ps, "carrier": p["period_id"]})
    return {
        "period": period,
        "periods": periods,
        "kpi_periods": kpi_periods,
        "latest": (latest_published or period)["period_id"],
        "is_admin": is_admin(ctx),
        "user": user_name(ctx),
        "previous_period": prev_row,
        "previous_summary": prev,
        "summary": summ,
        "aggregates": agg or {},
        "exposure_index": s["exposure_index"],
        "narrative": s["narrative"],
        "coverage": s["coverage"],
        "diff": s["diff"],
    }


def _sort_expr(sort: str) -> str | None:
    if not sort or not FIELD_RE.match(sort):
        return None
    if sort in ("entity_id", "lifecycle", "severity"):
        return f"t.{sort}"
    return f"json_extract(t.record_json, '$.{sort}')"


def _filters(request) -> list[tuple[str, str]]:
    out = []
    try:
        items = request.query_params.multi_items()
    except Exception:
        items = []
    for k, v in items:
        if k.endswith("[]"):  # axios-style array keys (f.key[]=a&f.key[]=b)
            k = k[:-2]
        if k.startswith("f.") and FIELD_RE.match(k[2:]) and v != "":
            out.append((k[2:], v))
    return out


def rows_payload(c, request, ctx) -> dict:
    module = qp(request, "module")
    if module not in MODULES:
        return {"error": "unknown module", "rows": [], "total": 0}
    period = resolve_period(c, request, ctx)
    if not period or not table_exists(c, module):  # a module added after this DB was created has no table until the next ingest
        return {"rows": [], "total": 0, "page": 1, "size": 25, "period_id": period["period_id"] if period else None}
    try:
        page = max(1, int(qp(request, "page", "1")))
        size = min(PAGE_SIZE_MAX, max(1, int(qp(request, "size", "25"))))
    except ValueError:
        page, size = 1, 25
    where, params = ["t.period_id=?"], [period["period_id"]]
    grouped: dict[str, list[str]] = {}
    for field, value in _filters(request):
        grouped.setdefault(field, []).append(value)
    for field, values in grouped.items():
        if field == "customer_status" and module == "findings":
            col = "COALESCE(o.customer_status, json_extract(t.record_json,'$.customer_status'), 'open')"
        elif field in ("lifecycle", "severity", "entity_id"):
            col = f"t.{field}"
        else:
            col = f"json_extract(t.record_json, '$.{field}')"
        bools = [v for v in values if v in ("true", "false")]
        texts = [v for v in values if v not in ("true", "false")]
        parts = []
        if bools:
            parts.append(f"{col} IN ({','.join('?' * len(bools))})"); params.extend(1 if v == "true" else 0 for v in bools)
        if texts:
            parts.append(f"CAST({col} AS TEXT) IN ({','.join('?' * len(texts))})"); params.extend(texts)
        where.append("(" + " OR ".join(parts) + ")")
    q = qp(request, "q").strip()
    if q:
        where.append("t.record_json LIKE ? ESCAPE '\\'")
        params.append("%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
    sql_where = " AND ".join(where)
    sort = _sort_expr(qp(request, "sort"))
    direction = "DESC" if qp(request, "dir", "asc").lower() == "desc" else "ASC"
    order = f"{sort} {direction}, t.entity_id ASC" if sort else "t.rowid ASC"
    with_status = qp(request, "with_status") in ("1", "true")
    if module == "findings":
        base = "FROM findings t LEFT JOIN findings_overlay o ON o.entity_id = t.entity_id"
        select = "t.record_json, o.customer_status AS o_status, o.owner AS o_owner, o.customer_note AS o_note, o.overlay_version AS o_version, o.updated_by AS o_by, o.updated_at AS o_at"
    elif with_status:
        # customer status of the finding that tracks this entity (finding id = <findings module>:<entity id>)
        fmod = FINDING_MODULE.get(module, module)
        base = (f"FROM {module} t LEFT JOIN findings f ON f.period_id = t.period_id AND f.entity_id = ('{fmod}:' || t.entity_id) "
                "LEFT JOIN findings_overlay o ON o.entity_id = f.entity_id")
        select = "t.record_json, COALESCE(o.customer_status, json_extract(f.record_json,'$.customer_status')) AS cust_status, f.entity_id AS finding_id"
    else:
        base = f"FROM {module} t"
        select = "t.record_json"
    total = c.execute(f"SELECT COUNT(*) {base} WHERE {sql_where}", params).fetchone()[0]
    rows = c.execute(f"SELECT {select} {base} WHERE {sql_where} ORDER BY {order} LIMIT ? OFFSET ?", params + [size, (page - 1) * size]).fetchall()
    out = []
    for r in rows:
        rec = json.loads(r["record_json"])
        for k in SECRET_FIELDS:
            rec.pop(k, None)
        if module != "findings" and with_status:
            rec["customer_status"] = r["cust_status"]
            rec["finding_id"] = r["finding_id"]
        if module == "findings":
            rec["customer_status"] = r["o_status"] or rec.get("customer_status") or "open"
            if r["o_owner"] is not None:
                rec["owner"] = r["o_owner"]
            if r["o_note"] is not None:
                rec["customer_note"] = r["o_note"]
            rec["overlay_version"] = r["o_version"] or 0
            rec["updated_by"] = r["o_by"]
            rec["updated_at"] = r["o_at"]
        out.append(rec)
    return {"rows": out, "total": total, "page": page, "size": size, "period_id": period["period_id"]}


def entity_payload(c, request, ctx) -> dict:
    module = qp(request, "module")
    entity_id = qp(request, "id")
    if module not in MODULES or not entity_id:
        return {"error": "module and id are required"}
    period = resolve_period(c, request, ctx)
    if not period:
        return {"error": "no period"}
    if not table_exists(c, module):
        return {"record": None}
    row = c.execute(f"SELECT record_json FROM {module} WHERE period_id=? AND entity_id=?", (period["period_id"], entity_id)).fetchone()
    if not row:
        return {"record": None}
    rec = json.loads(row["record_json"])
    for k in SECRET_FIELDS:
        rec.pop(k, None)
    return {"record": rec, "module": module, "period_id": period["period_id"]}


def findings_stats(c, request, ctx) -> dict:
    period = resolve_period(c, request, ctx)
    if not period:
        return {"by_status": {}, "total": 0, "open": 0}
    rows = c.execute(
        "SELECT COALESCE(o.customer_status, json_extract(t.record_json,'$.customer_status'), 'open') AS st, COUNT(*) AS n "
        "FROM findings t LEFT JOIN findings_overlay o ON o.entity_id = t.entity_id WHERE t.period_id=? GROUP BY st",
        (period["period_id"],),
    ).fetchall()
    by = {r["st"]: r["n"] for r in rows}
    total = sum(by.values())
    return {"by_status": {s: by.get(s, 0) for s in CUSTOMER_STATUSES}, "total": total, "open": by.get("open", 0), "period_id": period["period_id"]}


def findings_csv(c, request, ctx) -> dict:
    period = resolve_period(c, request, ctx)
    if not period:
        return {"error": "no period"}
    # Chunked: a period can hold 25k+ findings and the page API caps a response at 2 MB, so the client
    # fetches offset/limit slices and concatenates them (the header travels with the first slice only).
    try:
        offset = max(0, int(qp(request, "offset", "0")))
        limit = min(CSV_CHUNK, max(1, int(qp(request, "limit", str(CSV_CHUNK)))))
    except ValueError:
        offset, limit = 0, CSV_CHUNK
    total = c.execute("SELECT COUNT(*) FROM findings WHERE period_id=?", (period["period_id"],)).fetchone()[0]
    rows = c.execute(
        "SELECT t.record_json, o.customer_status, o.owner, o.customer_note FROM findings t LEFT JOIN findings_overlay o ON o.entity_id = t.entity_id WHERE t.period_id=? ORDER BY t.rowid LIMIT ? OFFSET ?",
        (period["period_id"], limit, offset),
    ).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    if offset == 0:
        w.writerow(["finding_id", "module", "severity", "title", "lifecycle", "first_seen_period", "analyst_status", "customer_status", "owner", "customer_note"])
    for r in rows:
        rec = json.loads(r["record_json"])
        w.writerow([rec.get("id"), rec.get("module"), rec.get("severity"), rec.get("title"), rec.get("lifecycle"), rec.get("first_seen_period") or "",
                    rec.get("analyst_status"), r["customer_status"] or rec.get("customer_status") or "open",
                    r["owner"] if r["owner"] is not None else (rec.get("owner") or ""), r["customer_note"] if r["customer_note"] is not None else (rec.get("customer_note") or "")])
    nxt = offset + len(rows)
    return {"filename": f"easm-findings-{period['period_id']}.csv", "csv": buf.getvalue(), "rows": len(rows), "total": total,
            "offset": offset, "next": nxt if nxt < total else None}


def report_payload(c, request, ctx) -> dict:
    base = summary_payload(c, request, ctx)
    period = base.get("period")
    if not period:
        return base
    summ = base.get("summary") or {}
    admin = is_admin(ctx)
    out = {
        "period": period, "periods": base["periods"], "latest": base["latest"], "is_admin": admin, "user": base["user"],
        "scope": summ.get("scope"), "sources": summ.get("sources") or [], "generator": summ.get("generator"),
        "narrative": base.get("narrative"), "coverage": base.get("coverage"), "previous_summary": base.get("previous_summary"),
        "counts": summ.get("counts"), "duplicates_collapsed": summ.get("duplicates_collapsed"),
    }
    if admin:
        out["cross_checks"] = summ.get("cross_checks") or []
        out["warnings"] = summ.get("warnings") or []
        out["lifecycle_counts"] = summ.get("lifecycle_counts")
        out["diff"] = base.get("diff")
        out["audit_reveal_count"] = c.execute("SELECT COUNT(*) FROM audit_reveal WHERE period_id=?", (period["period_id"],)).fetchone()[0]
    return out
