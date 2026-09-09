"""EASM Portal — Findings Tracker customer-status access contract.

Contract  : easm.findings.operations   (page easm-findings)
Operations: set_status / set_owner / set_note — mutations on entityType "finding".
Store     : SQLite overlay table `findings_overlay` in ~/.flocks/data/easm.db (keyed by finding id, so a
            status set in one period carries over to the next). Analyst data is never modified.
Rules     : caller must be authenticated (route-level); the finding must exist; members may only edit
            findings of published periods; optimistic locking via expectedOverlayVersion (409 on mismatch).
"""
from __future__ import annotations

import datetime as _dt
import os
import sqlite3
from pathlib import Path
from typing import Any

from flocks.contracts.access.models import (
    Binding,
    Contract,
    ContractOperation,
    ContractRuntimeError,
    DriverResult,
    InternalDataRow,
    MutationPlan,
    RuntimeContext,
    WebUIContractPlugin,
)
from flocks.contracts.access.pipeline import OverlayEntry

PAGE_ID = "easm-findings"
CONTRACT_ID = "easm.findings.operations"
CONTRACT_VERSION = "1.0"
DB_PATH = Path(os.environ.get("EASM_DB_PATH") or (Path.home() / ".flocks" / "data" / "easm.db"))
CUSTOMER_STATUSES = ("open", "acknowledged", "in_progress", "resolved", "false_positive", "risk_accepted")
FIELDS_BY_OP = {"set_status": "customer_status", "set_owner": "owner", "set_note": "customer_note"}
MAX_OWNER = 120
MAX_NOTE = 2000


def _current_user() -> tuple[str, str]:
    try:
        from flocks.auth.context import get_current_auth_user

        u = get_current_auth_user()
        if u is not None:
            return str(u.username or u.id), str(u.role or "member")
    except Exception:
        pass
    return "", "member"


def _op(name: str) -> ContractOperation:
    return ContractOperation(
        name=name,
        operation_type="mutation",
        adapter_required_fields=frozenset({"id"}),
        identity_fields=frozenset({"id"}),
        public_fields=frozenset({"ok", "entityType", "entityId", "overlayVersion"}),
        mutation_entity_types=frozenset({"finding"}),
        requires_idempotency_key=True,
        requires_expected_overlay_version=False,
    )


def _contract() -> Contract:
    return Contract(contract_id=CONTRACT_ID, version=CONTRACT_VERSION, page_id=PAGE_ID, operations={n: _op(n) for n in FIELDS_BY_OP})


class _BindingResolver:
    def resolve(self, *, page_id: str, slot_id: str, contract_id: str, contract_version: str) -> Binding:
        return Binding(
            binding_id="easm-findings-overlay-sqlite",
            binding_version=1,
            page_id=page_id,
            slot_id=slot_id,
            contract_id=contract_id,
            contract_version=contract_version,
            adapter_kind="builtin-sqlite-json",
            source_page_id=PAGE_ID,
            source_root=DB_PATH,
            driver_available_fields=frozenset({"id"}),
            driver_allowlist_roots=(DB_PATH.parent,),
            driver_options={"table": "findings", "recordColumn": "record_json"},
            capabilities=frozenset({"mutation"}),
        )


class _Adapter:
    def normalize(self, driver_result: DriverResult) -> list[InternalDataRow]:
        return [InternalDataRow(raw=r, identity={"entityType": "finding", "entityId": str(r.get("id"))}) for r in driver_result.rows]


class _ResponsePipeline:
    def run_query(self, **kwargs) -> dict[str, Any]:  # queries are served by the page API, not by this contract
        raise ContractRuntimeError("operation_not_supported", status_code=400, user_message="Use the page API for reads.")


class SqliteOverlayStore:
    """Overlay store backed by findings_overlay; replaces the in-memory default so edits survive restarts."""

    def merge(self, rows: list[InternalDataRow], context: RuntimeContext) -> list[InternalDataRow]:
        return rows

    def transaction(self, plan: MutationPlan) -> OverlayEntry:
        field = FIELDS_BY_OP.get(plan.operation.name)
        if not field or field not in plan.params:
            raise ContractRuntimeError("invalid_request", user_message=f"{plan.operation.name} requires the field '{field}'.", request_id=plan.context.request_id)
        value = plan.params.get(field)
        if field == "customer_status":
            if value not in CUSTOMER_STATUSES:
                raise ContractRuntimeError("invalid_request", user_message="Unknown customer status.", request_id=plan.context.request_id)
        else:
            value = "" if value is None else str(value)
            limit = MAX_OWNER if field == "owner" else MAX_NOTE
            if len(value) > limit:
                raise ContractRuntimeError("invalid_request", user_message=f"{field} is too long (max {limit} characters).", request_id=plan.context.request_id)
        username, role = _current_user()
        now = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        with sqlite3.connect(DB_PATH) as db:
            db.row_factory = sqlite3.Row
            rows = db.execute(
                "SELECT f.period_id, p.status, p.report_date FROM findings f JOIN periods p ON p.period_id = f.period_id WHERE f.entity_id=? ORDER BY p.report_date DESC",
                (plan.entity_id,),
            ).fetchall()
            if not rows:
                raise ContractRuntimeError("not_found", status_code=404, user_message="Finding not found.", request_id=plan.context.request_id)
            if role != "admin" and not any(r["status"] == "published" for r in rows):
                raise ContractRuntimeError("forbidden", status_code=403, user_message="This finding belongs to an unpublished period.", request_id=plan.context.request_id)
            latest_period = rows[0]["period_id"]
            cur = db.execute("SELECT customer_status, owner, customer_note, overlay_version FROM findings_overlay WHERE entity_id=?", (plan.entity_id,)).fetchone()
            current_version = int(cur["overlay_version"]) if cur else 0
            expected = plan.expected_overlay_version
            if expected is not None and expected != current_version:
                raise ContractRuntimeError("conflict", status_code=409, user_message="This finding was changed by someone else. Reload and try again.", request_id=plan.context.request_id)
            fields = {"customer_status": cur["customer_status"] if cur else None, "owner": cur["owner"] if cur else None, "customer_note": cur["customer_note"] if cur else None}
            fields[field] = value
            new_version = current_version + 1
            db.execute(
                "INSERT INTO findings_overlay(entity_id, period_id, customer_status, owner, customer_note, overlay_version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(entity_id) DO UPDATE SET period_id=excluded.period_id, customer_status=excluded.customer_status, owner=excluded.owner, customer_note=excluded.customer_note, overlay_version=excluded.overlay_version, updated_by=excluded.updated_by, updated_at=excluded.updated_at",
                (plan.entity_id, latest_period, fields["customer_status"], fields["owner"], fields["customer_note"], new_version, username or plan.context.principal_ref, now),
            )
            db.commit()
        return OverlayEntry(version=new_version, fields={k: v for k, v in fields.items() if v is not None})


_STORE = SqliteOverlayStore()

CONTRACTS = (
    WebUIContractPlugin(
        plugin_id="easm-findings-operations",
        contracts=(_contract(),),
        binding_resolver=_BindingResolver(),
        adapter=_Adapter(),
        response_pipeline=_ResponsePipeline(),
        overlay_store=_STORE,
        version=CONTRACT_VERSION,
    ),
)
