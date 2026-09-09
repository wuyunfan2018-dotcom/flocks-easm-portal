import hashlib
import os
import re
import shutil
from pathlib import Path

HOME = Path.home()
WF_DIR = HOME / ".flocks" / "plugins" / "workflows" / "easm_ingest"
WORKSPACE = HOME / ".flocks" / "workspace"

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


DEFAULT_DB = easm_db_path()
PAGE_SHOTS = HOME / ".flocks" / "plugins" / "contracts" / "webui" / "easm" / "easm-data-leaks" / "assets" / "screenshots"

period_id = (inputs.get("period_id") or "").strip()
if not period_id:
    raise RuntimeError("period_id is required")
if not re.match(r"^[A-Za-z0-9_-]+$", period_id):
    raise RuntimeError(f"period_id {period_id!r} must match ^[A-Za-z0-9_-]+$")

report_no_raw = inputs.get("report_no")
if report_no_raw is None or report_no_raw == "":
    raise RuntimeError("report_no is required")
report_no = int(report_no_raw)

report_date = (inputs.get("report_date") or "").strip()
if not report_date:
    raise RuntimeError("report_date is required")
if not re.match(r"^\d{4}-\d{2}-\d{2}$", report_date):
    raise RuntimeError(f"report_date {report_date!r} must match YYYY-MM-DD")

customer_id = (inputs.get("customer_id") or "customer").strip() or "customer"
customer_name = (inputs.get("customer_name") or "Customer Ltd").strip() or "Customer Ltd"
period_label = (inputs.get("period_label") or "").strip()
previous_period_id = (inputs.get("previous_period_id") or "").strip()
inbox_dir_raw = (inputs.get("inbox_dir") or "").strip()
datapack_path_raw = (inputs.get("datapack_path") or "").strip()
source_files = inputs.get("source_files") or []
if not isinstance(source_files, list):
    raise RuntimeError("source_files must be a list of paths")
db_path_raw = (inputs.get("db_path") or "").strip()
force = bool(inputs.get("force", False))
rebrand = (inputs.get("rebrand") or "").strip()
notify_session_id = (inputs.get("notify_session_id") or "").strip()

WORKSPACE.mkdir(parents=True, exist_ok=True)
if inbox_dir_raw:
    inbox_dir = Path(os.path.expandvars(os.path.expanduser(inbox_dir_raw)))
    if not inbox_dir.is_absolute():
        inbox_dir = (WORKSPACE / inbox_dir).resolve()
else:
    inbox_dir = (WORKSPACE / "easm" / "inbox" / period_id).resolve()
inbox_dir.mkdir(parents=True, exist_ok=True)

copied_sources = []
skipped_sources = []
for src in source_files:
    if not isinstance(src, str) or not src.strip():
        skipped_sources.append({"source": str(src), "reason": "empty path"})
        continue
    src_path = Path(os.path.expandvars(os.path.expanduser(src.strip())))
    if not src_path.is_file():
        skipped_sources.append({"source": str(src), "reason": "source not found"})
        continue
    try:
        target = inbox_dir / src_path.name
        shutil.copy2(src_path, target)
        copied_sources.append(str(target))
    except Exception as exc:
        skipped_sources.append({"source": str(src), "reason": f"copy failed: {exc}"})

mode = "convert"
datapack_path = ""
inventory_path = ""
report_path = ""
verification_path = ""
narrative_path = ""
previous_summary_path = ""

if datapack_path_raw:
    candidate = Path(os.path.expandvars(os.path.expanduser(datapack_path_raw)))
    if candidate.is_file():
        mode = "datapack"
        datapack_path = str(candidate.resolve())

if mode == "convert":
    inbox_datapack = inbox_dir / "datapack.json"
    if inbox_datapack.is_file():
        mode = "datapack"
        datapack_path = str(inbox_datapack.resolve())

if mode == "convert":
    files_in_inbox = sorted(p.name for p in inbox_dir.iterdir() if p.is_file())

    inv_matches = [n for n in files_in_inbox if re.search(r"asset inventory", n, re.IGNORECASE) and n.lower().endswith((".xls", ".xlsx"))]
    if not inv_matches:
        xlsx_files = [n for n in files_in_inbox if n.lower().endswith((".xls", ".xlsx"))]
        if len(xlsx_files) == 1:
            inv_matches = xlsx_files

    rpt_matches = [n for n in files_in_inbox if re.search(r"easm report", n, re.IGNORECASE) and n.lower().endswith(".docx")]
    if not rpt_matches:
        non_verif_docx = [n for n in files_in_inbox if n.lower().endswith(".docx") and "verification" not in n.lower()]
        if len(non_verif_docx) == 1:
            rpt_matches = non_verif_docx

    ver_matches = [n for n in files_in_inbox if "verification" in n.lower() and n.lower().endswith(".docx")]

    if not inv_matches:
        raise RuntimeError(f"convert mode requires asset inventory xls/xlsx in {inbox_dir}; found: {files_in_inbox}")
    if not rpt_matches:
        raise RuntimeError(f"convert mode requires EASM Report docx in {inbox_dir}; found: {files_in_inbox}")

    inventory_path = str((inbox_dir / inv_matches[0]).resolve())
    report_path = str((inbox_dir / rpt_matches[0]).resolve())
    if ver_matches:
        verification_path = str((inbox_dir / ver_matches[0]).resolve())

    narr_candidate = inbox_dir / "narrative.json"
    if narr_candidate.is_file():
        narrative_path = str(narr_candidate.resolve())
    prev_candidate = inbox_dir / "previous-summary.json"
    if prev_candidate.is_file():
        previous_summary_path = str(prev_candidate.resolve())

if not previous_period_id and previous_summary_path:
    try:
        import json as _json
        with open(previous_summary_path, "r", encoding="utf-8") as _pf:
            _prev = _json.load(_pf)
        candidate_prev = (_prev.get("period_id") or "").strip()
        if candidate_prev and re.match(r"^[A-Za-z0-9_-]+$", candidate_prev):
            previous_period_id = candidate_prev
    except Exception as exc:
        skipped_sources.append({"source": previous_summary_path, "reason": f"previous-summary.json unreadable: {exc}"})


def _sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fp:
        for chunk in iter(lambda: fp.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _file_entry(role: str, p: str) -> dict:
    pp = Path(p)
    try:
        return {"role": role, "path": p, "sha256": _sha256_of(pp), "bytes": pp.stat().st_size}
    except Exception as exc:
        return {"role": role, "path": p, "sha256": "", "bytes": 0, "error": str(exc)}


files = []
if datapack_path:
    files.append(_file_entry("datapack", datapack_path))
if inventory_path:
    files.append(_file_entry("inventory", inventory_path))
if report_path:
    files.append(_file_entry("report", report_path))
if verification_path:
    files.append(_file_entry("verification", verification_path))
if narrative_path:
    files.append(_file_entry("narrative", narrative_path))
if previous_summary_path:
    files.append(_file_entry("previous_summary", previous_summary_path))

if db_path_raw:
    db_path = Path(os.path.expandvars(os.path.expanduser(db_path_raw)))
    if not db_path.is_absolute():
        db_path = (WORKSPACE / db_path).resolve()
else:
    db_path = DEFAULT_DB
db_path = db_path.resolve()

params = {
    "period_id": period_id,
    "report_no": report_no,
    "report_date": report_date,
    "customer_id": customer_id,
    "customer_name": customer_name,
    "period_label": period_label,
    "previous_period_id": previous_period_id,
    "inbox_dir": str(inbox_dir),
    "datapack_path": datapack_path,
    "source_files": source_files,
    "db_path": str(db_path),
    "force": force,
    "rebrand": rebrand,
    "notify_session_id": notify_session_id,
    "mode": mode,
}

outputs["params"] = params
outputs["mode"] = mode
outputs["datapack_path"] = datapack_path
outputs["inventory_path"] = inventory_path
outputs["report_path"] = report_path
outputs["verification_path"] = verification_path
outputs["narrative_path"] = narrative_path
outputs["previous_summary_path"] = previous_summary_path
outputs["files"] = files
outputs["copied_sources"] = copied_sources
outputs["skipped_sources"] = skipped_sources
outputs["inbox_dir"] = str(inbox_dir)
outputs["_edge_context"] = True
