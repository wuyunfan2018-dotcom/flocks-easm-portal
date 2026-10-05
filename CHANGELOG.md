# Changelog

## 0.9.2 — 2026-10-05

- New module **Unauthenticated file exposure** (`leaks.exposed_files`, table `exposed_files`): the analysts' Risk sheet gained a `Risk Type / Associated Information / URL / Threat level / Describe / Repair Suggestions` layout; rows of type *File* (documents reachable without login on the organisation's own websites, report section "Unauthenticated File Exposure on the Internet") are now parsed, summarised (by website / file type / severity), cross-checked against the report heading, enriched with the report's per-file findings, tracked as findings and shown on **Data leaks → Exposed files**, the Overview tiles and the coverage table. Other risk types still go to `risks.vulnerabilities`, which now renders a table when rows exist.
- Exposure index moves to **rules-v2**: exposed files 5 pts (saturates at 20), vulnerabilities 10 → 5 pts; weights still sum to 100. Threat level "Middle" maps to medium.
- Previous-period KPI deltas on the Overview are derived from the previous period's snapshot in the DB when no `previous-summary.json` backfill was supplied.
- Convert node self-heals its Python dependencies: a Flocks upgrade can rebuild the venv while the workflow engine's requirements marker still says installed; the node now probes the interpreter and reinstalls missing packages with `uv pip install --python <venv>`.
- Ingest inherits `customer_id` / `customer_name` from the previous (or latest) period in the DB when the run does not pass them, instead of falling back to placeholders.
- Period switcher: a draft period is no longer labelled "latest, published".
- Page API tolerates a module table that does not exist yet (DB created by an older version): empty rows instead of a 500.

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
