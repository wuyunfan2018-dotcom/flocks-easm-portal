"""EASM Portal — leaked-credential `reveal` access contract.

Runs inside the Flocks main process (plugins under ~/.flocks/plugins/contracts/access/ are loaded
by PluginLoader without the page-handler import guard), so it can use `cryptography`.

Contract  : easm.credentials.operations   (page easm-data-leaks)
Operation : reveal  — query op filtered by credential id + period id.
            Decrypts `password_enc` with EASM_SECRET_KEY (Fernet), writes one audit_reveal row
            (who / when / which record) and returns the clear text ONCE. The page re-masks after 10 s.
Rules     : caller must be authenticated (route-level); members only for published periods;
            missing key / undecryptable ciphertext -> 503 reveal_unavailable; ciphertext never leaves.
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
    RuntimeContext,
    WebUIContractPlugin,
)

PAGE_ID = "easm-data-leaks"
CONTRACT_ID = "easm.credentials.operations"
CONTRACT_VERSION = "1.0"

def easm_db_path() -> Path:
    """easm.db lives in the Flocks data directory: EASM_DB_PATH > FLOCKS_DATA_DIR > XDG_DATA_HOME/flocks > FLOCKS_ROOT/data > ~/.flocks/data."""
    explicit = os.environ.get("EASM_DB_PATH")
    if explicit:
        return Path(explicit).expanduser()
    data_dir = os.environ.get("FLOCKS_DATA_DIR")
    if data_dir:
        return Path(data_dir).expanduser() / "easm.db"
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg).expanduser() / "flocks" / "easm.db"
    root = os.environ.get("FLOCKS_ROOT")
    base = Path(root).expanduser() if root else Path.home() / ".flocks"
    return base / "data" / "easm.db"


DB_PATH = easm_db_path()
SECRET_ENV = "EASM_SECRET_KEY"
REVEAL_TTL_S = 10
DRIVER_FIELDS = frozenset({"id", "period_id", "username", "host", "password_enc", "password_masked"})


def _current_user() -> tuple[str, str]:
    """(username, role) of the caller from the request-scoped auth context."""
    try:
        from flocks.auth.context import get_current_auth_user

        u = get_current_auth_user()
        if u is not None:
            return str(u.username or u.id), str(u.role or "member")
    except Exception:
        pass
    return "", "member"


def _contract() -> Contract:
    return Contract(
        contract_id=CONTRACT_ID,
        version=CONTRACT_VERSION,
        page_id=PAGE_ID,
        operations={
            "reveal": ContractOperation(
                name="reveal",
                operation_type="query",
                adapter_required_fields=DRIVER_FIELDS,
                identity_fields=frozenset({"id"}),
                public_fields=frozenset({"entity_id", "password", "expires_in", "audit_id"}),
                filter_fields=frozenset({"id", "period_id"}),
                filter_param_fields={"id": "id", "period_id": "period_id"},
                default_limit=1,
                max_limit=1,
            ),
        },
    )


class _BindingResolver:
    def resolve(self, *, page_id: str, slot_id: str, contract_id: str, contract_version: str) -> Binding:
        return Binding(
            binding_id="easm-credentials-sqlite",
            binding_version=1,
            page_id=page_id,
            slot_id=slot_id,
            contract_id=contract_id,
            contract_version=contract_version,
            adapter_kind="builtin-sqlite-json",
            source_page_id=PAGE_ID,
            source_root=DB_PATH,
            driver_available_fields=DRIVER_FIELDS,
            driver_allowlist_roots=(DB_PATH.parent,),
            driver_options={"table": "credentials", "recordColumn": "record_json"},
            capabilities=frozenset({"query"}),
        )


class _Adapter:
    def normalize(self, driver_result: DriverResult) -> list[InternalDataRow]:
        return [InternalDataRow(raw=r, identity={"entityType": "credential", "entityId": str(r.get("id"))}) for r in driver_result.rows]


class _ResponsePipeline:
    def run_query(self, *, context: RuntimeContext, binding_source_page_id: str, driver_result: DriverResult, rows: list[InternalDataRow], filter_stages_applied: list[dict[str, str]]) -> dict[str, Any]:
        username, role = _current_user()
        if not rows:
            raise ContractRuntimeError("not_found", status_code=404, user_message="Credential record not found.", request_id=context.request_id)
        rec = rows[0].raw
        period_id = str(rec.get("period_id") or "")
        entity_id = str(rec.get("id") or "")
        # members may only reveal from published periods
        with sqlite3.connect(DB_PATH) as db:
            row = db.execute("SELECT status FROM periods WHERE period_id=?", (period_id,)).fetchone()
        status = row[0] if row else None
        if status != "published" and role != "admin":
            raise ContractRuntimeError("forbidden", status_code=403, user_message="This period is not published.", request_id=context.request_id)
        key = os.environ.get(SECRET_ENV) or ""
        token = rec.get("password_enc")
        if not key or not token:
            raise ContractRuntimeError("reveal_unavailable", status_code=503, user_message="Password reveal is not available on this instance (encryption key not configured).", request_id=context.request_id)
        try:
            from cryptography.fernet import Fernet

            clear = Fernet(key.encode() if isinstance(key, str) else key).decrypt(str(token).encode()).decode("utf-8")
        except Exception:
            raise ContractRuntimeError("reveal_unavailable", status_code=503, user_message="Password cannot be decrypted with the key configured on this instance.", request_id=context.request_id)
        now = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        with sqlite3.connect(DB_PATH) as db:
            cur = db.execute(
                "INSERT INTO audit_reveal(period_id, entity_id, user, at, ip, note) VALUES (?, ?, ?, ?, NULL, ?)",
                (period_id, entity_id, username or context.principal_ref, now, f"reveal via portal ({context.request_id})"),
            )
            audit_id = cur.lastrowid
            db.commit()
        return {"entity_id": entity_id, "password": clear, "expires_in": REVEAL_TTL_S, "audit_id": audit_id, "revealed_at": now, "user": username}


CONTRACTS = (
    WebUIContractPlugin(
        plugin_id="easm-credentials-operations",
        contracts=(_contract(),),
        binding_resolver=_BindingResolver(),
        adapter=_Adapter(),
        response_pipeline=_ResponsePipeline(),
        overlay_store=None,
        version=CONTRACT_VERSION,
    ),
)
