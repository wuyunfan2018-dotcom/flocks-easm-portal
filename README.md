# ThreatBook EASM Portal for Flocks

A customer-facing External Attack Surface Management portal that runs as a **Flocks scene workspace**: six React pages, a read-only page API, an ingest workflow that turns quarterly EASM deliverables into a versioned SQLite snapshot, and audited access contracts for the sensitive operations (password reveal, customer status, period publishing).

This repository contains **code only**. It ships no customer data, no database, no evidence screenshots and no keys. A freshly installed portal is empty until an administrator ingests a reporting period.

## What you get

| Piece | Where it lands | Purpose |
| --- | --- | --- |
| Workspace `easm` (6 pages) | `~/.flocks/plugins/contracts/webui/easm/` | Overview, Attack Surface, Exposure Risks, Data Leaks, Findings Tracker, Reports |
| Access contracts | `~/.flocks/plugins/contracts/access/easm/` | `reveal` (Fernet decrypt + audit), findings `set_status/set_owner/set_note` (SQLite overlay), `publish/unpublish` (admin) |
| Workflow `easm_ingest` | `~/.flocks/plugins/workflows/easm_ingest/` | converter → schema validation → SQLite load (draft) → period diff → summary |
| Skill `easm-ingest` | `~/.flocks/plugins/skills/easm-ingest/` | lets Rex run the ingest from a chat with attached deliverables |
| Data contract | `schema/easm-data-pack.schema.json` | the JSON data pack the workflow accepts (hand it to whoever produces the reports) |

Requirements: Flocks **2026.8.17** (the scene-workspace page runtime this was built against), Python 3.12 in the Flocks virtualenv, Node/esbuild as bundled with the Flocks WebUI. Flocks Pro is only needed if customers should log in with their own member accounts.

## Install

### From a Flocks chat (Rex)

Paste this into a Rex session on the target Flocks instance:

```
Install the ThreatBook EASM Portal: clone https://github.com/wuyunfan2018-dotcom/flocks-easm-portal into ~/.flocks/workspace/tmp/flocks-easm-portal (git pull if it already exists), then run `python install.py` inside that directory using the Python that runs Flocks, and show me the output.
```

### By hand

```bash
git clone https://github.com/wuyunfan2018-dotcom/flocks-easm-portal
cd flocks-easm-portal
python install.py            # add --hub to also list it in the Flocks Hub page, --dry-run to preview
```

`install.py` is idempotent: run it again to upgrade. It never touches `~/.flocks/data/easm.db`, existing evidence screenshots or the inbox. `python install.py --uninstall` removes the portal and keeps the data.

### After installing

1. Generate a Fernet key and put it in the environment of the Flocks service as `EASM_SECRET_KEY`, then restart Flocks. Passwords in leaked-credential records are encrypted with this key at ingest and decrypted only by the audited *Reveal* action. One key per instance; never rotate it casually (old periods would become unreadable).

   ```bash
   python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"
   ```

2. Open **Scene Workspaces → ThreatBook EASM Portal**. Every page shows *No period is available yet*.
3. Load a period: upload the deliverables (asset inventory `.xls/.xlsx`, the report `.docx`, optionally the login-verification `.docx`) to `workspace/easm/inbox/<period_id>/`, then run the `easm_ingest` workflow (Workflows page, the *Run ingest* form on the Reports page, or ask Rex). A ready-made `datapack.json` that follows the schema can be ingested directly with `datapack_path`.
4. Review the draft on the **Reports** page (cross-checks, warnings, row counts) and click **Publish**. Customers only ever see published periods.

## Security model in one paragraph

Customers get Flocks *member* accounts: they see published periods only, drafts are invisible at the API level, and the Findings Tracker edits go through an access contract that writes an overlay table (analyst data is never modified). Leaked passwords are stored as Fernet ciphertext; *Reveal* asks for confirmation, decrypts once inside the Flocks main process, writes an `audit_reveal` row (who, when, which record) and the page re-masks after 10 seconds. Evidence screenshots are served through the page asset route behind the Flocks login. The portal reads a single SQLite file, `~/.flocks/data/easm.db`, that only the ingest workflow writes.

## Layout

```
plugins/
  webuis/easm/            workspace.json, six pages (src/, api/, assets/), access/ (contract plugins)
  workflows/easm_ingest/  workflow.json + workflow.md, nodes/*.py (source of the node code), bin/ (converter + schema)
  skills/easm-ingest/     SKILL.md
  components/easm-portal/ Flocks Hub component manifest (one-click install when registered with --hub)
schema/                   the EASM data pack contract
install.py                installer / upgrader / uninstaller
```

Pages share one library (`src/lib/*`) and one API module (`api/easm_common.py`) that are intentionally duplicated per page: Flocks bundles and exports every page on its own.

## License

Copyright © 2026 ThreatBook. See `LICENSE`. Fonts are redistributed under the SIL Open Font License, see `NOTICE-fonts.txt`.
