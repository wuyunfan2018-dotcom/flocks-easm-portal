---
name: easm-ingest
description: Load one ThreatBook EASM reporting period into the EASM Portal (admin only). Use when an administrator hands over EASM quarterly deliverables (asset inventory xls/xlsx, EASM report docx, optional login-verification docx, or a ready-made datapack.json) as attachments or file paths and asks to ingest / import / load a period. Runs the easm_ingest workflow; never publishes.
---

# EASM period ingest (admin only)

Use this skill when an administrator wants to load a new EASM reporting period into the ThreatBook EASM Portal. The work is done by the `easm_ingest` workflow; your job is to collect the parameters, run the workflow with the right inputs, and report the result.

## Preconditions

- Only administrators ingest data. If the current user is not an admin, say that ingestion is an administrator task and stop.
- Do not run this for a period that is already published unless the user explicitly asks for `force=true`.
- Never print, echo, or paste passwords, `password_enc`, `password_fp` or the `EASM_SECRET_KEY`. Only masked values may appear in your replies.

## Collect the parameters

Ask (one question at a time, only for what is missing):

1. `period_id` — e.g. `2026Q3`
2. `report_no` — integer, e.g. `8`
3. `report_date` — `YYYY-MM-DD`
4. Optional: `previous_period_id` (default: the latest earlier period in the database), `customer_id` (default `customer`), `customer_name` (default `Customer Ltd`).

Files can arrive in three ways; pick the first that applies:

- The user attached files in this conversation → their paths are under `~/.flocks/workspace/uploads/`. Put every attachment path into `source_files`.
- The user names local paths → put them into `source_files`.
- The user says the files are already in the inbox (`~/.flocks/workspace/easm/inbox/<period_id>/`) → leave `source_files` empty.
- The user provides a ready-made `datapack.json` → pass its absolute path as `datapack_path`.

## Run the workflow

Call the `run_workflow` tool with:

- `workflow`: the absolute path of `~/.flocks/plugins/workflows/easm_ingest/workflow.json` (expand `~` to the real home directory first).
- `inputs`: `{ "period_id", "report_no", "report_date", "customer_id", "customer_name", "previous_period_id", "source_files": [...], "datapack_path": "" }` — omit keys you do not have; the workflow fills defaults.
- `ensure_requirements`: `true`.
- `timeout_s`: `1800`.

Run it once. Do not retry automatically if it fails; show the error message to the user and ask how to proceed.

## Report

When the run finishes, reply with:

- period id, mode (`datapack` or `convert`), `needs_review`
- the per-table row counts (`rows_inserted`)
- cross-check mismatches and warnings, if any
- the diff mode and, for `detail` modules, new / gone / kept counts
- the path of the summary file (`report_path`)
- the reminder: "The period is loaded as a draft. Open the Reports page, review it, then click Publish."

Do not publish, do not modify the database yourself, and do not open or describe screenshot files.
