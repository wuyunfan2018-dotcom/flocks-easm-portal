import os
import shutil
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
WF_DIR = HOME / ".flocks" / "plugins" / "workflows" / "easm_ingest"
WORKSPACE = HOME / ".flocks" / "workspace"
CONVERTER = WF_DIR / "bin" / "easm_convert.py"

params = inputs.get("params") or {}
mode = inputs.get("mode") or "convert"

staging_dir = ""
datapack_path = ""
convert_skipped = False
convert_log = ""
convert_report_path = ""
convert_error_tail = ""

if mode == "datapack":
    datapack_path = (params.get("datapack_path") or inputs.get("datapack_path") or "").strip()
    if not datapack_path:
        raise RuntimeError("datapack mode requires datapack_path")
    dp_path = Path(datapack_path)
    if not dp_path.is_file():
        raise RuntimeError(f"datapack file not found: {datapack_path}")
    staging_dir = str(dp_path.parent.resolve())
    convert_skipped = True
    convert_log = ""
    convert_report_path = ""
else:
    secret_key = os.environ.get("EASM_SECRET_KEY") or ""
    if not secret_key:
        raise RuntimeError("EASM_SECRET_KEY is not set; passwords must be encrypted before loading")

    period_id = params.get("period_id")
    if not period_id:
        raise RuntimeError("params.period_id is required for convert mode")

    staging_dir_path = (WORKSPACE / "easm" / "staging" / period_id).resolve()
    if staging_dir_path.exists():
        shutil.rmtree(staging_dir_path)
    staging_dir_path.mkdir(parents=True, exist_ok=True)
    staging_dir = str(staging_dir_path)

    inventory_path = inputs.get("inventory_path") or ""
    report_path = inputs.get("report_path") or ""
    if not inventory_path or not report_path:
        raise RuntimeError("convert mode requires inventory_path and report_path from locate_inputs")

    cmd = [
        sys.executable,
        str(CONVERTER),
        "--inventory", inventory_path,
        "--report", report_path,
        "--out", staging_dir,
        "--customer-id", str(params.get("customer_id") or "customer"),
        "--customer-name", str(params.get("customer_name") or "Customer Ltd"),
        "--period-id", str(period_id),
        "--report-no", str(params.get("report_no")),
        "--report-date", str(params.get("report_date")),
    ]

    verification_path = inputs.get("verification_path") or ""
    if verification_path:
        cmd += ["--verification", verification_path]

    previous_summary_path = inputs.get("previous_summary_path") or ""
    if previous_summary_path:
        cmd += ["--previous-summary", previous_summary_path]

    period_label = params.get("period_label") or ""
    if period_label:
        cmd += ["--period-label", period_label]

    previous_period_id = params.get("previous_period_id") or ""
    if previous_period_id:
        cmd += ["--previous-period-id", previous_period_id]

    rebrand = params.get("rebrand") or ""
    if rebrand:
        cmd += ["--rebrand", rebrand]

    # Self-heal: a Flocks upgrade can rebuild the venv and drop the converter's packages while the workflow
    # engine's requirements marker (~/.cache/flocks-workflow/requirements/<hash>.installed) still says "installed".
    # Probe the interpreter that will run the converter; reinstall the missing ones the way Flocks does (uv pip).
    REQUIREMENTS = {"openpyxl": "openpyxl>=3.1", "xlrd": "xlrd>=2.0", "docx": "python-docx>=1.1",
                    "PIL": "pillow>=10", "cryptography": "cryptography>=42", "jsonschema": "jsonschema>=4"}
    probe_src = "import importlib.util, sys; print(' '.join(m for m in sys.argv[1:] if importlib.util.find_spec(m) is None))"
    probe = subprocess.run([sys.executable, "-c", probe_src, *REQUIREMENTS], capture_output=True, text=True, timeout=120)
    missing = [REQUIREMENTS[m] for m in (probe.stdout or "").split() if m in REQUIREMENTS]
    deps_reinstalled = []
    if missing:
        uv = shutil.which("uv")
        install_cmd = ([uv, "pip", "install", "--python", sys.executable, *missing] if uv
                       else [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-q", *missing])
        inst = subprocess.run(install_cmd, capture_output=True, text=True, timeout=600)
        if inst.returncode != 0:
            tail = (inst.stderr or inst.stdout or "")[-1500:]
            raise RuntimeError("converter dependencies missing after a Flocks upgrade and reinstall failed: "
                               + ", ".join(missing) + " -- " + tail
                               + " -- fix by hand: uv pip install --python " + sys.executable + " " + " ".join(missing))
        deps_reinstalled = missing

    try:
        completed = subprocess.run(cmd, capture_output=True, text=True, env=dict(os.environ), timeout=1500)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"easm_convert.py timed out after {exc.timeout}s")
    except Exception as exc:
        raise RuntimeError(f"easm_convert.py failed to start: {exc}")

    convert_log = (completed.stdout or "")[-4000:]
    if deps_reinstalled:
        convert_log = "[deps] reinstalled after Flocks upgrade: " + ", ".join(deps_reinstalled) + chr(10) + convert_log
    if completed.returncode != 0:
        stderr_tail = "\n".join((completed.stderr or "").splitlines()[-40:])
        convert_error_tail = stderr_tail
        raise RuntimeError(
            f"easm_convert.py exited with code {completed.returncode}\nstderr (last 40 lines):\n{stderr_tail}"
        )

    datapack_file = staging_dir_path / "datapack.json"
    if not datapack_file.is_file():
        raise RuntimeError(f"converter finished but {datapack_file} not found")

    datapack_path = str(datapack_file.resolve())

    convert_report_file = staging_dir_path / "convert-report.md"
    if convert_report_file.is_file():
        convert_report_path = str(convert_report_file.resolve())

outputs["params"] = params
outputs["mode"] = mode
outputs["datapack_path"] = datapack_path
outputs["staging_dir"] = staging_dir
outputs["convert_skipped"] = convert_skipped
outputs["convert_log"] = convert_log
outputs["convert_report_path"] = convert_report_path
outputs["convert_error_tail"] = convert_error_tail
outputs["_edge_context"] = True
