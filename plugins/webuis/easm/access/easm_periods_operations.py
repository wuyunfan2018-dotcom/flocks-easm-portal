"""EASM Portal — period publishing access contract (admin only).

Contract  : easm.periods.operations   (page easm-reports)
Operations: publish   — periods.status draft -> published (published_at, published_by)
            unpublish — published -> draft (admin correction)
Both are mutations on entityType "period". A period flagged needs_review can only be published with
params.acknowledge_review = true. Members always get 403.
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

PAGE_ID = "easm-reports"
CONTRACT_ID = "easm.periods.operations"
CONTRACT_VERSION = "1.0"
DB_PATH = Path(os.environ.get("EASM_DB_PATH") or (Path.home() / ".flocks" / "data" / "easm.db"))


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
        adapter_required_fields=frozenset({"period_id"}),
        identity_fields=frozenset({"period_id"}),
        public_fields=frozenset({"ok", "entityType", "entityId", "overlayVersion"}),
        mutation_entity_types=frozenset({"period"}),
        requires_idempotency_key=True,
    )


class _BindingResolver:
    def resolve(self, *, page_id: str, slot_id: str, contract_id: str, contract_version: str) -> Binding:
        return Binding(
            binding_id="easm-periods-sqlite",
            binding_version=1,
            page_id=page_id,
            slot_id=slot_id,
            contract_id=contract_id,
            contract_version=contract_version,
            adapter_kind="builtin-sqlite-json",
            source_page_id=PAGE_ID,
            source_root=DB_PATH,
            driver_available_fields=frozenset({"period_id"}),
            driver_allowlist_roots=(DB_PATH.parent,),
            driver_options={"table": "periods"},
            capabilities=frozenset({"mutation"}),
        )


class _Adapter:
    def normalize(self, driver_result: DriverResult) -> list[InternalDataRow]:
        return [InternalDataRow(raw=r, identity={"entityType": "period", "entityId": str(r.get("period_id"))}) for r in driver_result.rows]


class _ResponsePipeline:
    def run_query(self, **kwargs) -> dict[str, Any]:
        raise ContractRuntimeError("operation_not_supported", status_code=400, user_message="Use the page API for reads.")


class PeriodStatusStore:
    def merge(self, rows: list[InternalDataRow], context: RuntimeContext) -> list[InternalDataRow]:
        return rows

    def transaction(self, plan: MutationPlan) -> OverlayEntry:
        username, role = _current_user()
        rid = plan.context.request_id
        if role != "admin":
            raise ContractRuntimeError("forbidden", status_code=403, user_message="Only administrators can publish periods.", request_id=rid)
        target = "published" if plan.operation.name == "publish" else "draft"
        now = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        with sqlite3.connect(DB_PATH) as db:
            db.row_factory = sqlite3.Row
            row = db.execute("SELECT status, needs_review FROM periods WHERE period_id=?", (plan.entity_id,)).fetchone()
            if not row:
                raise ContractRuntimeError("not_found", status_code=404, user_message="Period not found.", request_id=rid)
            if row["status"] == target:
                raise ContractRuntimeError("conflict", status_code=409, user_message=f"Period is already {target}.", request_id=rid)
            if target == "published" and row["needs_review"] and not plan.params.get("acknowledge_review"):
                raise ContractRuntimeError("needs_review", status_code=409, user_message="This period has cross-check mismatches or warnings. Confirm that you reviewed them before publishing.", request_id=rid)
            if target == "published":
                db.execute("UPDATE periods SET status='published', published_at=?, published_by=? WHERE period_id=?", (now, username, plan.entity_id))
            else:
                db.execute("UPDATE periods SET status='draft', published_at=NULL, published_by=NULL WHERE period_id=?", (plan.entity_id,))
            db.commit()
        return OverlayEntry(version=1, fields={"status": target, "changed_at": now, "changed_by": username})


CONTRACTS = (
    WebUIContractPlugin(
        plugin_id="easm-periods-operations",
        contracts=(Contract(contract_id=CONTRACT_ID, version=CONTRACT_VERSION, page_id=PAGE_ID, operations={"publish": _op("publish"), "unpublish": _op("unpublish")}),),
        binding_resolver=_BindingResolver(),
        adapter=_Adapter(),
        response_pipeline=_ResponsePipeline(),
        overlay_store=PeriodStatusStore(),
        version=CONTRACT_VERSION,
    ),
)
