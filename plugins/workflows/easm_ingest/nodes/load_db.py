import datetime as _dt
import json
import os
import shutil
import sqlite3
from pathlib import Path

HOME = Path.home()
WF_DIR = HOME / ".flocks" / "plugins" / "workflows" / "easm_ingest"
PAGE_SHOTS = HOME / ".flocks" / "plugins" / "contracts" / "webui" / "easm" / "easm-data-leaks" / "assets" / "screenshots"

MODULE_MAP = [
    ("domains",            ["assets", "domains"],                    False),
    ("ips",                ["assets", "ips"],                        False),
    ("websites",           ["assets", "websites"],                   False),
    ("services",           ["assets", "services"],                   False),
    ("components",         ["assets", "components"],                 False),
    ("certificates",       ["assets", "certificates"],               False),
    ("http_configs",       ["assets", "http_configs"],               False),
    ("mobile_apps",        ["assets", "mobile_apps"],                False),
    ("wechat_accounts",    ["assets", "wechat_official_accounts"],  False),
    ("wechat_mini_programs", ["assets", "wechat_mini_programs"],     False),
    ("login_portals",      ["risks", "login_portals"],               False),
    ("risky_services",     ["risks", "risky_services"],              False),
    ("certificate_risks",  ["risks", "certificates"],                False),
    ("malicious_ip_tags",  ["risks", "malicious_ip_tags"],           False),
    ("vulnerabilities",    ["risks", "vulnerabilities"],             False),
    ("dark_web",           ["leaks", "dark_web"],                    False),
    ("files",              ["leaks", "files"],                       False),
    ("code",               ["leaks", "code"],                        False),
    ("credentials",        ["leaks", "credentials"],                 False),
    ("emails",             ["leaks", "emails"],                      False),
    ("findings",           ["findings"],                             True),
]

params = inputs.get("params") or {}
period_id = params.get("period_id")
if not period_id:
    raise RuntimeError("params.period_id is required")

db_path_raw = params.get("db_path") or ""
if not db_path_raw:
    raise RuntimeError("params.db_path is required")
db_path = Path(db_path_raw)
db_path.parent.mkdir(parents=True, exist_ok=True)

force = bool(params.get("force", False))
datapack_path = inputs.get("datapack_path") or ""
if not datapack_path:
    raise RuntimeError("datapack_path is required for load_db")
dp_path = Path(datapack_path)
if not dp_path.is_file():
    raise RuntimeError(f"datapack file not found: {datapack_path}")

with open(dp_path, "r", encoding="utf-8") as fp:
    datapack = json.load(fp)

narrative_path = inputs.get("narrative_path") or ""
warnings = list(inputs.get("warnings") or [])
counts = dict(inputs.get("counts") or {})
unique_counts = dict(inputs.get("unique_counts") or {})
lifecycle_counts = dict(inputs.get("lifecycle_counts") or {})
needs_review = bool(inputs.get("needs_review", False))

if narrative_path and Path(narrative_path).is_file():
    try:
        with open(narrative_path, "r", encoding="utf-8") as nf:
            narrative_obj = json.load(nf)
        datapack["narrative"] = narrative_obj
        warnings.append("narrative overridden by narrative.json")
    except Exception as exc:
        warnings.append(f"failed to load narrative.json: {exc}")


# ---- derived fields + per-period aggregates (pages read these from summary; handlers never re-aggregate) ----
def _dark_web_status(r):
    if r.get("taken_down"):
        return "taken_down"
    if r.get("lifecycle") in ("closed", "inactive"):
        return "invalid"
    note = str(r.get("analyst_note") or "").lower()
    if "to be confirmed" in note or "to confirm" in note:
        return "to_confirm"
    if "confirmed" in note:
        return "confirmed"
    return "open"


_SEV_RANK = {"critical": 0, "high": 0, "medium": 1, "low": 2, "info": 3}


def _derive(table_name, rec):
    if rec.get("severity"):
        rec["_sev"] = _SEV_RANK.get(str(rec.get("severity")).lower(), 4)
    if table_name == "domains":
        rec["_ipn"] = len(rec.get("ips") or [])
    elif table_name == "ips":
        rec["_attrs"] = ", ".join(rec.get("attributes") or [])
        rec["_ports"] = " ".join(str(p) for p in (rec.get("ports") or []))
    elif table_name == "websites":
        rec["_tech"] = ", ".join(rec.get("technologies") or [])
        rec["_techn"] = len(rec.get("technologies") or [])
    elif table_name == "http_configs":
        rec["_flags"] = sum(1 for v in (rec.get("checks") or {}).values() if v is True)
    elif table_name == "certificates":
        rec["_weak"] = len(rec.get("weak_algorithms") or [])
    elif table_name == "certificate_risks":
        rec["_protocols"] = ", ".join(rec.get("protocols") or [])
    elif table_name == "dark_web":
        rec["_status"] = _dark_web_status(rec)
    elif table_name == "code":
        rec["_sens"] = "confirmed" if rec.get("sensitive_data_found") else ("suspected" if rec.get("sensitive_data_suspected") else "none")
    elif table_name == "emails":
        rec["_src"] = rec.get("source_host") or rec.get("source") or "unknown"
    elif table_name == "credentials":
        rec["_verified"] = "Verified" if rec.get("verified_login") else "Not verified"
    return rec


def _top(rows, get, n=None):
    from collections import Counter
    c = Counter()
    for r in rows:
        v = get(r)
        if v is None or v == "":
            v = "-"
        for x in (v if isinstance(v, list) else [v]):
            c[str(x)] += 1
    items = sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))
    if n:
        items = items[:n]
    return [{"label": k, "value": v} for k, v in items]


_CURRENT = ("new", "active", "updated")


def _aggregates(lists):
    A = {}
    g = lambda k: (lambda r: r.get(k))
    L = lambda t: lists.get(t) or []
    A["domains"] = {"root_domain": _top(L("domains"), g("root_domain"), 50), "lifecycle": _top(L("domains"), g("lifecycle"))}
    A["ips"] = {"country": _top(L("ips"), g("country"), 12), "attributes": _top(L("ips"), g("attributes"), 8), "lifecycle": _top(L("ips"), g("lifecycle"))}
    A["websites"] = {"scheme": _top(L("websites"), g("scheme")), "technologies": _top([w for w in L("websites") if w.get("technologies")], g("technologies"), 10),
                     "with_tech": sum(1 for w in L("websites") if w.get("technologies"))}
    A["services"] = {"service": _top(L("services"), g("service"), 8), "lifecycle": _top(L("services"), g("lifecycle")),
                     "port_current": _top([s for s in L("services") if s.get("lifecycle", "active") in _CURRENT], lambda r: str(r.get("port")), 15)}
    A["components"] = {"component_type": _top(L("components"), lambda r: r.get("component_type") or "unknown"), "component": _top(L("components"), g("component"), 10), "lifecycle": _top(L("components"), g("lifecycle"))}
    A["certificates"] = {"expiry_bucket": _top(L("certificates"), g("expiry_bucket")), "protocol": _top(L("certificates"), g("protocol"))}
    hdr = {}
    for h in L("http_configs"):
        for k, v in (h.get("checks") or {}).items():
            if v is True:
                hdr[k] = hdr.get(k, 0) + 1
    A["http_configs"] = {"header_true": [{"label": k, "value": v} for k, v in sorted(hdr.items(), key=lambda kv: -kv[1])]}
    A["mobile_apps"] = {"store": _top(L("mobile_apps"), lambda r: r.get("store") or "unknown"), "lifecycle": _top(L("mobile_apps"), g("lifecycle")),
                        "official": [{"label": "Official store", "value": sum(1 for a in L("mobile_apps") if a.get("official_store"))},
                                     {"label": "Third-party store", "value": sum(1 for a in L("mobile_apps") if not a.get("official_store"))}]}
    lp = L("login_portals")
    lp_cur = [p for p in lp if p.get("lifecycle", "active") in _CURRENT]
    A["login_portals"] = {"lifecycle": _top(lp, g("lifecycle")), "scheme": _top(lp, g("scheme")), "severity": _top(lp, g("severity")),
                          "scheme_current": [{"label": "Plain HTTP", "value": sum(1 for p in lp_cur if p.get("scheme") == "http")},
                                             {"label": "HTTPS", "value": sum(1 for p in lp_cur if p.get("scheme") == "https")}]}
    A["dark_web"] = {"_status": _top(L("dark_web"), g("_status")), "forum": _top(L("dark_web"), g("forum"), 5)}
    A["files"] = {"taken_down": _top(L("files"), lambda r: "Taken down" if r.get("taken_down") else "Open")}
    A["code"] = {"_sens": _top(L("code"), g("_sens")), "lifecycle": _top(L("code"), g("lifecycle")),
                 "suspected": sum(1 for c in L("code") if c.get("sensitive_data_suspected")), "expired": sum(1 for c in L("code") if c.get("lifecycle") == "closed")}
    A["credentials"] = {"_verified": _top(L("credentials"), g("_verified")), "host": _top(L("credentials"), g("host"), 4)}
    A["emails"] = {"lifecycle": _top(L("emails"), g("lifecycle")), "_src": _top(L("emails"), g("_src"), 5)}
    A["findings"] = {"severity": _top(L("findings"), g("severity")), "module": _top(L("findings"), g("module")),
                     "analyst_status": _top(L("findings"), g("analyst_status")), "lifecycle": _top(L("findings"), g("lifecycle"))}
    return A

PERIOD_DDL = """
CREATE TABLE IF NOT EXISTS periods (
  period_id TEXT PRIMARY KEY,
  customer_id TEXT, customer_name TEXT,
  report_no INTEGER, report_date TEXT, label TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  previous_period_id TEXT,
  loaded_at TEXT, published_at TEXT, published_by TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  source_json TEXT
)
"""

MODULE_DDL_TEMPLATE = """
CREATE TABLE IF NOT EXISTS {table} (
  period_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  lifecycle TEXT, severity TEXT,
  record_json TEXT NOT NULL,
  PRIMARY KEY (period_id, entity_id)
)
"""

INDEX_DDL_TEMPLATE = "CREATE INDEX IF NOT EXISTS idx_{table}_pls ON {table}(period_id, lifecycle, severity)"

OTHER_DDL = [
    """CREATE TABLE IF NOT EXISTS summary (
        period_id TEXT PRIMARY KEY,
        summary_json TEXT, exposure_json TEXT, narrative_json TEXT, coverage_json TEXT, diff_json TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS period_diff (
        period_id TEXT NOT NULL, module TEXT NOT NULL, entity_id TEXT NOT NULL, change TEXT NOT NULL,
        PRIMARY KEY (period_id, module, entity_id)
    )""",
    """CREATE TABLE IF NOT EXISTS findings_overlay (
        entity_id TEXT PRIMARY KEY,
        period_id TEXT,
        customer_status TEXT, owner TEXT, customer_note TEXT,
        overlay_version INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT, updated_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS audit_reveal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_id TEXT, entity_id TEXT, user TEXT, at TEXT, ip TEXT, note TEXT
    )""",
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
]

conn = sqlite3.connect(str(db_path))
try:
    cur = conn.cursor()
    cur.execute(PERIOD_DDL)
    for table_name, _, _ in MODULE_MAP:
        cur.execute(MODULE_DDL_TEMPLATE.format(table=table_name))
        cur.execute(INDEX_DDL_TEMPLATE.format(table=table_name))
    for stmt in OTHER_DDL:
        cur.execute(stmt)

    cur.execute("SELECT status FROM periods WHERE period_id = ?", (period_id,))
    row = cur.fetchone()
    if row and row[0] == "published" and not force:
        raise RuntimeError(
            f"period {period_id} is published; refuse to overwrite without force=true"
        )

    cur.execute("SELECT COUNT(*) FROM schema_version")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO schema_version(version) VALUES (?)", (1,))

    period_obj = datapack.get("period") or {}
    customer_obj = datapack.get("customer") or {}

    summary_payload = {
        "assets": datapack.get("summary", {}).get("assets") if isinstance(datapack.get("summary"), dict) else {},
        "risks": datapack.get("summary", {}).get("risks") if isinstance(datapack.get("summary"), dict) else {},
        "leaks": datapack.get("summary", {}).get("leaks") if isinstance(datapack.get("summary"), dict) else {},
        "counts": counts,
        "lifecycle_counts": lifecycle_counts,
        "duplicates_collapsed": (datapack.get("summary") or {}).get("duplicates_collapsed") if isinstance(datapack.get("summary"), dict) else None,
        "previous_summary": datapack.get("previous_summary"),
        "http_misconfigurations": (datapack.get("risks") or {}).get("http_misconfigurations"),
        "cross_checks": datapack.get("cross_checks") or [],
        "warnings": warnings,
        "scope": datapack.get("scope"),
        "sources": datapack.get("sources") or [],
        "generator": datapack.get("generator"),
        "schema_version": datapack.get("schema_version"),
    }

    exposure_block = datapack.get("exposure_index")
    narrative_block = datapack.get("narrative")
    coverage_block = datapack.get("coverage")

    previous_period_id = params.get("previous_period_id") or period_obj.get("previous_period_id") or ""

    loaded_at = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    module_lists = {}
    try:
        for table_name, _, _ in MODULE_MAP:
            cur.execute(f"DELETE FROM {table_name} WHERE period_id = ?", (period_id,))
        cur.execute("DELETE FROM summary WHERE period_id = ?", (period_id,))
        cur.execute("DELETE FROM period_diff WHERE period_id = ?", (period_id,))
        cur.execute("DELETE FROM periods WHERE period_id = ?", (period_id,))

        cur.execute(
            "INSERT INTO periods(period_id, customer_id, customer_name, report_no, report_date, "
            "label, status, previous_period_id, loaded_at, published_at, published_by, "
            "needs_review, source_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)",
            (
                period_id,
                customer_obj.get("id") or params.get("customer_id"),
                customer_obj.get("name") or params.get("customer_name"),
                int(params.get("report_no") or period_obj.get("report_no") or 0),
                params.get("report_date") or period_obj.get("report_date") or "",
                period_obj.get("label") or "",
                "draft",
                previous_period_id,
                loaded_at,
                1 if needs_review else 0,
                json.dumps(datapack.get("sources") or [], ensure_ascii=False),
            ),
        )

        for table_name, path_keys, _top_level in MODULE_MAP:
            cursor_obj = datapack
            try:
                for key in path_keys:
                    cursor_obj = cursor_obj[key]
                if not isinstance(cursor_obj, list):
                    cursor_obj = []
            except (KeyError, TypeError):
                cursor_obj = []
            rows = []
            module_lists[table_name] = []
            for rec in cursor_obj:
                if not isinstance(rec, dict):
                    continue
                entity_id = rec.get("id")
                if not entity_id:
                    continue
                rec = _derive(table_name, dict(rec))
                module_lists[table_name].append(rec)
                lifecycle = rec.get("lifecycle")
                severity = rec.get("severity")
                record_with_period = dict(rec)
                record_with_period["period_id"] = period_id
                rows.append(
                    (
                        period_id,
                        entity_id,
                        lifecycle,
                        severity,
                        json.dumps(record_with_period, ensure_ascii=False),
                    )
                )
            if rows:
                cur.executemany(
                    f"INSERT OR REPLACE INTO {table_name}(period_id, entity_id, lifecycle, severity, record_json) "
                    "VALUES (?, ?, ?, ?, ?)",
                    rows,
                )

        summary_payload["aggregates"] = _aggregates(module_lists)
        cur.execute(
            "INSERT OR REPLACE INTO summary(period_id, summary_json, exposure_json, narrative_json, coverage_json, diff_json) "
            "VALUES (?, ?, ?, ?, ?, NULL)",
            (
                period_id,
                json.dumps(summary_payload, ensure_ascii=False),
                json.dumps(exposure_block, ensure_ascii=False) if exposure_block is not None else None,
                json.dumps(narrative_block, ensure_ascii=False) if narrative_block is not None else None,
                json.dumps(coverage_block, ensure_ascii=False) if coverage_block is not None else None,
            ),
        )

        rows_inserted = {}
        for table_name, _, _ in MODULE_MAP:
            cur.execute(f"SELECT COUNT(*) FROM {table_name} WHERE period_id = ?", (period_id,))
            rows_inserted[table_name] = int(cur.fetchone()[0] or 0)

        mismatch_msgs = []
        for table_name, expected_total in counts.items():
            expected = unique_counts.get(table_name, expected_total)
            actual = rows_inserted.get(table_name, 0)
            if actual != expected:
                mismatch_msgs.append(f"{table_name}: expected={expected} (unique ids) actual={actual}")
        if mismatch_msgs:
            raise RuntimeError("row count mismatch between datapack and inserted rows: " + "; ".join(mismatch_msgs))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
finally:
    conn.close()

screenshots_copied = 0
screenshots_dir = ""
src_screens = dp_path.parent / "assets" / "screenshots"
if src_screens.is_dir():
    dst_screens = (PAGE_SHOTS / period_id).resolve()
    if dst_screens.exists():
        shutil.rmtree(dst_screens)
    dst_screens.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src_screens, dst_screens)
    screenshots_copied = sum(1 for _ in dst_screens.rglob("*") if _.is_file())
    screenshots_dir = str(dst_screens)

outputs["params"] = params
outputs["db_path"] = str(db_path)
outputs["period_id"] = period_id
outputs["period_status"] = "draft"
outputs["rows_inserted"] = rows_inserted
outputs["screenshots_copied"] = screenshots_copied
outputs["screenshots_dir"] = screenshots_dir
outputs["needs_review"] = needs_review
outputs["mismatches"] = inputs.get("mismatches") or []
outputs["warnings"] = warnings
outputs["counts"] = counts
outputs["_edge_context"] = True
