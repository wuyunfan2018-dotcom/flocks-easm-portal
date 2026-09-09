# Changelog

## 0.9.0 — 2026-09-09

First public build.

- Six scene-workspace pages (Overview, Attack Surface, Exposure Risks, Data Leaks, Findings Tracker, Reports) with server-paged tables, hand-drawn SVG charts and a period switcher (latest published by default, historical banner, KPI-only backfill periods).
- Page API (`/summary`, `/periods`, `/rows`, `/entity`, `/findings/stats`, `/findings/export`, `/report`); members never see draft periods.
- Access contracts: `reveal` (Fernet decrypt + `audit_reveal`), findings `set_status/set_owner/set_note` (SQLite overlay, optimistic locking), `publish/unpublish` (admin only, needs-review acknowledgement).
- `easm_ingest` workflow: converter (xls/xlsx + docx), schema validation, SQLite load as draft, per-period aggregates, period diff, summary. Three input modes: raw deliverables, a ready `datapack.json`, or files attached in a Rex chat.
- Data pack schema v1.0 (optional fields nullable, entity `id`/`lifecycle` required, aggregate maps open).

Not yet included: the read-only `easm_workspace_query` tool and the `easm-analyst` Q&A agent (planned for 1.0).
