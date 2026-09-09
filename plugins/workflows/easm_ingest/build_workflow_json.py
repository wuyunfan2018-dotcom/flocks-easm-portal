import json
import sys
from pathlib import Path

WF_DIR = Path.home() / ".flocks" / "plugins" / "workflows" / "easm_ingest"
NODES_DIR = WF_DIR / "nodes"
OUTPUT = WF_DIR / "workflow.json"

NODE_FILES = [
    "locate_inputs",
    "convert",
    "validate",
    "load_db",
    "diff",
    "notify",
]

NODE_DESCRIPTIONS = {
    "locate_inputs": "Tool: filesystem only. Parse params, fill defaults, resolve inbox_dir (defaults to ~/.flocks/workspace/easm/inbox/<period_id>), copy source_files into the inbox, then pick the input mode: datapack_path > inbox/datapack.json > convert (locate Asset Inventory xls/xlsx + EASM Report docx). Optional: Verification docx, narrative.json, previous-summary.json. Computes sha256+size for each located file.",
    "convert": "Tool: subprocess (easm_convert.py). datapack mode: pass through datapack_path. convert mode: requires EASM_SECRET_KEY in env, rebuilds staging dir, runs bin/easm_convert.py with inventory/report/verification/customer/period args (timeout 1500s), captures stdout tail and stderr tail. Confirms datapack.json exists.",
    "validate": "Tool: filesystem + jsonschema. Load datapack.json and bin/easm-data-pack.schema.json, validate with Draft202012Validator (or Draft7 if schema has no $schema). Fail hard on schema errors. Check period.id matches params; warn on customer.id mismatch. Read cross_checks for mismatches (sets needs_review). Compute counts and lifecycle_counts for each of the 21 module tables in §4.1.",
    "load_db": "Tool: sqlite3 + shutil. Create periods / 21 module tables / summary / period_diff / findings_overlay / audit_reveal / schema_version (all CREATE IF NOT EXISTS). Refuse to overwrite a published period unless force=true. In one transaction: delete-then-insert rows for this period_id; insert periods row (status=draft, loaded_at=UTC ISO, source_json=datapack.sources); write summary row with summary_json/exposure_json/narrative_json/coverage_json (diff_json NULL). Optionally override datapack.narrative from narrative.json. Copy assets/screenshots from staging to Data Leaks page assets dir under period_id. Verify row counts match counts from validate.",
    "diff": "Tool: sqlite3 only. Resolve previous_period_id (params > previous-summary.json > latest report_date < current in DB). For each of the 21 module tables, compare current entity_id set with previous set: write period_diff rows for new/gone/kept when previous had rows; otherwise mark module as kpi_only. Compute diff_mode (detail/kpi_only/mixed/none) and UPDATE summary.diff_json.",
    "notify": "Tool: filesystem write + optional tool.run_safe('channel_message'). Build a Markdown summary (no password fields) with status, needs_review, mode, module row counts, cross-check mismatches, warnings, diff per module, screenshot count, and a Publish hint. Write to ~/.flocks/workspace/outputs/<today>/easm_ingest_<period>_<HHMMSS>.md. If params.notify_session_id is set, forward the same markdown to the bound channel.",
}

EDGES = [
    {
        "from": "locate_inputs",
        "to": "convert",
        "mapping": {
            "params": "params",
            "mode": "mode",
            "datapack_path": "datapack_path",
            "inventory_path": "inventory_path",
            "report_path": "report_path",
            "verification_path": "verification_path",
            "previous_summary_path": "previous_summary_path",
            "narrative_path": "narrative_path",
        },
    },
    {
        "from": "convert",
        "to": "validate",
        "mapping": {
            "params": "params",
            "datapack_path": "datapack_path",
            "narrative_path": "narrative_path",
        },
    },
    {
        "from": "validate",
        "to": "load_db",
        "mapping": {
            "params": "params",
            "datapack_path": "datapack_path",
            "narrative_path": "narrative_path",
            "needs_review": "needs_review",
            "mismatches": "mismatches",
            "warnings": "warnings",
            "counts": "counts",
            "unique_counts": "unique_counts",
            "lifecycle_counts": "lifecycle_counts",
        },
    },
    {
        "from": "load_db",
        "to": "diff",
        "mapping": {
            "params": "params",
            "db_path": "db_path",
            "period_id": "period_id",
            "rows_inserted": "rows_inserted",
            "screenshots_copied": "screenshots_copied",
            "needs_review": "needs_review",
            "mismatches": "mismatches",
            "warnings": "warnings",
        },
    },
    {
        "from": "diff",
        "to": "notify",
        "mapping": {
            "params": "params",
            "db_path": "db_path",
            "period_id": "period_id",
            "rows_inserted": "rows_inserted",
            "diff_mode": "diff_mode",
            "diff_summary": "diff_summary",
            "needs_review": "needs_review",
            "mismatches": "mismatches",
            "warnings": "warnings",
            "screenshots_copied": "screenshots_copied",
            "mode": "mode",
        },
    },
]

SAMPLE_INPUTS = {
    "period_id": "2026Q3",
    "report_no": 1,
    "report_date": "2026-09-30",
    "customer_id": "customer",
    "customer_name": "Customer Ltd",
    "previous_period_id": "",
    "inbox_dir": "easm/inbox/2026Q3",
    "datapack_path": "",
    "source_files": [],
    "db_path": "",
    "force": False,
    "rebrand": "",
    "notify_session_id": "",
}


def build():
    nodes = []
    for node_id in NODE_FILES:
        path = NODES_DIR / f"{node_id}.py"
        if not path.is_file():
            raise SystemExit(f"missing node source: {path}")
        code = path.read_text(encoding="utf-8")
        nodes.append({
            "id": node_id,
            "type": "python",
            "description": NODE_DESCRIPTIONS[node_id],
            "code": code,
        })

    for edge in EDGES:
        if not edge.get("mapping"):
            raise SystemExit(f"edge {edge['from']}->{edge['to']} has empty mapping")

    workflow = {
        "name": "easm_ingest",
        "nameI18n": {
            "zh-CN": "EASM 期次入库",
            "en-US": "EASM period ingest",
        },
        "description": "EASM period ingest: convert deliverables (asset inventory + EASM report + optional verification docx) or a pre-built datapack.json into SQLite ~/.flocks/data/easm.db (status=draft), copy screenshots to the Data Leaks page, compute entity-level diff vs the previous period, and write a markdown summary. Publish (draft -> published) is intentionally out of scope.",
        "start": "locate_inputs",
        "nodes": nodes,
        "edges": EDGES,
        "metadata": {
            "node_timeout_s": 1800,
            "requirements": [
                "openpyxl>=3.1",
                "xlrd>=2.0",
                "python-docx>=1.1",
                "pillow>=10",
                "cryptography>=42",
                "jsonschema>=4",
            ],
            "sampleInputs": SAMPLE_INPUTS,
        },
        "triggers": [],
    }

    OUTPUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes, {len(nodes)} nodes, {len(EDGES)} edges)")


if __name__ == "__main__":
    build()
