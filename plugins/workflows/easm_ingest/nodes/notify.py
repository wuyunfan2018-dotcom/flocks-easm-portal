import datetime as _dt
import json
from pathlib import Path

HOME = Path.home()
WORKSPACE = HOME / ".flocks" / "workspace"

params = inputs.get("params") or {}
period_id = inputs.get("period_id") or params.get("period_id") or ""
db_path = inputs.get("db_path") or params.get("db_path") or ""
needs_review = bool(inputs.get("needs_review", False))
rows_inserted = inputs.get("rows_inserted") or {}
diff_mode = inputs.get("diff_mode") or "none"
diff_summary = inputs.get("diff_summary") or {}
mismatches = inputs.get("mismatches") or []
warnings = inputs.get("warnings") or []
screenshots_copied = int(inputs.get("screenshots_copied") or 0)
mode = inputs.get("mode") or params.get("mode") or ""

customer_name = params.get("customer_name") or "Customer"
report_no = params.get("report_no") or "-"
report_date = params.get("report_date") or "-"

if not period_id:
    raise RuntimeError("period_id is required for notify")

today = _dt.date.today().isoformat()
now = _dt.datetime.now()
ts = now.strftime("%H%M%S")

lines = []
lines.append(f"# EASM ingest — {customer_name} — {period_id} (Report No.{report_no}, {report_date})")
lines.append("")
lines.append(f"- status: draft")
lines.append(f"- needs_review: {'yes' if needs_review else 'no'}")
lines.append(f"- mode: {mode or 'unknown'}")
lines.append(f"- db_path: {db_path}")
lines.append("")

lines.append("## Module row counts")
lines.append("")
lines.append("| Module | Rows |")
lines.append("| --- | ---: |")
for table, n in rows_inserted.items():
    lines.append(f"| {table} | {n} |")
lines.append("")

if mismatches:
    lines.append("## Cross-check mismatches")
    lines.append("")
    for m in mismatches:
        item = m.get("item") if isinstance(m, dict) else str(m)
        dp_v = m.get("datapack") if isinstance(m, dict) else "?"
        rp_v = m.get("report") if isinstance(m, dict) else "?"
        lines.append(f"- {item}: datapack={dp_v} report={rp_v}")
    lines.append("")

if warnings:
    lines.append("## Warnings")
    lines.append("")
    for w in warnings:
        lines.append(f"- {w}")
    lines.append("")

lines.append("## Diff")
lines.append("")
lines.append(f"- mode: {diff_mode}")
for module, info in diff_summary.items():
    if not isinstance(info, dict):
        continue
    mode_v = info.get("mode", "?")
    new_v = info.get("new", 0)
    gone_v = info.get("gone", 0)
    kept_v = info.get("kept", 0)
    lines.append(f"- {module}: mode={mode_v} new={new_v} gone={gone_v} kept={kept_v}")
lines.append("")

lines.append("## Screenshots")
lines.append("")
lines.append(f"- copied: {screenshots_copied}")
lines.append("")

lines.append("---")
lines.append("")
lines.append("Open the Reports page to review this draft, then Publish.")

summary_markdown = "\n".join(lines)

out_dir = WORKSPACE / "outputs" / today
out_dir.mkdir(parents=True, exist_ok=True)
report_path = out_dir / f"easm_ingest_{period_id}_{ts}.md"
report_path.write_text(summary_markdown, encoding="utf-8")

notify_session_id = (params.get("notify_session_id") or "").strip()
notify_sent = False
notify_error = "no notify_session_id"

if notify_session_id:
    try:
        result = tool.run_safe("channel_message", session_id=notify_session_id, message=summary_markdown)
        if isinstance(result, dict):
            notify_sent = bool(result.get("success"))
            notify_error = result.get("error") or ""
        else:
            notify_sent = False
            notify_error = "channel_message returned non-dict"
    except Exception as exc:
        notify_sent = False
        notify_error = f"channel_message raised: {exc}"

outputs["status"] = "draft_loaded"
outputs["period_id"] = period_id
outputs["db_path"] = db_path
outputs["needs_review"] = needs_review
outputs["rows_inserted"] = rows_inserted
outputs["diff_mode"] = diff_mode
outputs["diff_summary"] = diff_summary
outputs["summary_markdown"] = summary_markdown
outputs["report_path"] = str(report_path)
outputs["notify_sent"] = notify_sent
outputs["notify_error"] = notify_error
