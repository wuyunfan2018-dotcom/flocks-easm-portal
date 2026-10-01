# Changelog

## 0.9.1 — 2026-10-01

- Flocks 2026.9.23 support: the installer now registers the portal in the bundled Flocks Hub catalog by default (`--no-hub` to skip). The new Flocks hides scene workspaces that no Hub scene suite declares, which made the portal vanish from the navigation after the upgrade. Re-run `install.py` after every Flocks upgrade.
- Hub manifests: `trust` is now `verified` (`internal` is rejected by the 2026.9.23 manifest schema).
- Paths follow the Flocks data directory (`FLOCKS_DATA_DIR`, `XDG_DATA_HOME/flocks`, `FLOCKS_ROOT/data`); the installer finds the Flocks virtualenv on macOS/Linux as well as Windows.

## 0.9.0 — 2026-09-09

First public build.

- Six scene-workspace pages (Overview, Attack Surface, Exposure Risks, Data Leaks, Findings Tracker, Reports) with server-paged tables, hand-drawn SVG charts and a period switcher (latest published by default, historical banner, KPI-only backfill periods).
- Page API (`/summary`, `/periods`, `/rows`, `/entity`, `/findings/stats`, `/findings/export`, `/report`); members never see draft periods.
- Access contracts: `reveal` (Fernet decrypt + `audit_reveal`), findings `set_status/set_owner/set_note` (SQLite overlay, optimistic locking), `publish/unpublish` (admin only, needs-review acknowledgement).
- `easm_ingest` workflow: converter (xls/xlsx + docx), schema validation, SQLite load as draft, per-period aggregates, period diff, summary. Three input modes: raw deliverables, a ready `datapack.json`, or files attached in a Rex chat.
- Data pack schema v1.0 (optional fields nullable, entity `id`/`lifecycle` required, aggregate maps open).

Not yet included: the read-only `easm_workspace_query` tool and the `easm-analyst` Q&A agent (planned for 1.0).
