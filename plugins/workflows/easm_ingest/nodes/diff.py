import json
import sqlite3
from pathlib import Path

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
db_path = inputs.get("db_path") or params.get("db_path") or ""
if not db_path:
    raise RuntimeError("db_path is required for diff")
period_id = inputs.get("period_id") or params.get("period_id") or ""
if not period_id:
    raise RuntimeError("period_id is required for diff")
report_date = params.get("report_date") or ""

previous_period_id = (params.get("previous_period_id") or "").strip()

conn = sqlite3.connect(str(db_path))
try:
    cur = conn.cursor()
    if not previous_period_id:
        try:
            cur.execute(
                "SELECT period_id FROM periods WHERE report_date < ? AND status IN ('draft','published') "
                "AND period_id != ? ORDER BY report_date DESC LIMIT 1",
                (report_date, period_id),
            )
            row = cur.fetchone()
            if row:
                previous_period_id = row[0]
        except Exception as exc:
            print(f"[diff] previous_period lookup failed: {exc}")

    diff_summary = {}
    has_any_rows_in_prev = False
    diff_mode = "none"

    previous_in_db = False
    if previous_period_id:
        cur.execute("SELECT 1 FROM periods WHERE period_id = ? LIMIT 1", (previous_period_id,))
        previous_in_db = cur.fetchone() is not None

    if not previous_period_id:
        diff_mode = "none"
        for table_name, _, _ in MODULE_MAP:
            diff_summary[table_name] = {"mode": "none"}
    elif not previous_in_db:
        # previous period known (e.g. from previous-summary.json) but no detail rows in DB:
        # pages compare KPIs from summary.previous_summary
        diff_mode = "kpi_only"
        for table_name, _, _ in MODULE_MAP:
            diff_summary[table_name] = {"mode": "kpi_only"}
    else:
        all_kpi = True
        any_detail = False
        for table_name, _, _ in MODULE_MAP:
            cur.execute(
                f"SELECT entity_id FROM {table_name} WHERE period_id = ?",
                (period_id,),
            )
            cur_rows = {r[0] for r in cur.fetchall()}
            cur.execute(
                f"SELECT entity_id FROM {table_name} WHERE period_id = ?",
                (previous_period_id,),
            )
            prev_rows = {r[0] for r in cur.fetchall()}

            if prev_rows:
                has_any_rows_in_prev = True
                all_kpi = False
                any_detail = True
                new_ids = cur_rows - prev_rows
                gone_ids = prev_rows - cur_rows
                kept_ids = cur_rows & prev_rows
                cur.execute(
                    "DELETE FROM period_diff WHERE period_id = ? AND module = ?",
                    (period_id, table_name),
                )
                diff_rows = (
                    [(period_id, table_name, eid, "new") for eid in sorted(new_ids)]
                    + [(period_id, table_name, eid, "gone") for eid in sorted(gone_ids)]
                    + [(period_id, table_name, eid, "kept") for eid in sorted(kept_ids)]
                )
                if diff_rows:
                    cur.executemany(
                        "INSERT INTO period_diff(period_id, module, entity_id, change) VALUES (?, ?, ?, ?)",
                        diff_rows,
                    )
                diff_summary[table_name] = {
                    "mode": "detail",
                    "new": len(new_ids),
                    "gone": len(gone_ids),
                    "kept": len(kept_ids),
                }
            else:
                diff_summary[table_name] = {"mode": "kpi_only"}

        has_kpi = any(v.get("mode") == "kpi_only" for v in diff_summary.values())
        has_detail = any(v.get("mode") == "detail" for v in diff_summary.values())
        if has_detail and not has_kpi:
            diff_mode = "detail"
        elif has_kpi and not has_detail:
            diff_mode = "kpi_only"
        else:
            diff_mode = "mixed"

    diff_payload = {
        "previous_period_id": previous_period_id,
        "mode": diff_mode,
        "modules": diff_summary,
    }
    cur.execute(
        "UPDATE summary SET diff_json = ? WHERE period_id = ?",
        (json.dumps(diff_payload, ensure_ascii=False), period_id),
    )
    conn.commit()
finally:
    conn.close()

outputs["params"] = params
outputs["mode"] = inputs.get("mode") or params.get("mode") or ""
outputs["db_path"] = str(db_path)
outputs["period_id"] = period_id
outputs["previous_period_id"] = previous_period_id
outputs["diff_mode"] = diff_mode
outputs["diff_summary"] = diff_summary
outputs["rows_inserted"] = inputs.get("rows_inserted") or {}
outputs["screenshots_copied"] = inputs.get("screenshots_copied") or 0
outputs["needs_review"] = bool(inputs.get("needs_review", False))
outputs["mismatches"] = inputs.get("mismatches") or []
outputs["warnings"] = inputs.get("warnings") or []
outputs["_edge_context"] = True
