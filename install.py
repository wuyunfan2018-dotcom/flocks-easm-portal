#!/usr/bin/env python3
"""Install or upgrade the ThreatBook EASM Portal into a Flocks instance.

    python install.py                 # install into ~/.flocks (idempotent; safe to re-run for upgrades)
    python install.py --dry-run       # show what would change
    python install.py --home /path    # a different Flocks home (the directory that contains .flocks/)
    python install.py --no-hub        # copy the plugins only, without the Hub scene-suite registration
    python install.py --uninstall     # remove the portal (keeps easm.db and evidence screenshots)

What it does
  * copies the six workspace pages to   <home>/.flocks/plugins/contracts/webui/easm/
  * copies the access contracts to      <home>/.flocks/plugins/contracts/access/easm/
  * copies the ingest workflow to       <home>/.flocks/plugins/workflows/easm_ingest/
  * copies the skill / tool / agent to  <home>/.flocks/plugins/{skills,tools/python,agents}/...
  * registers the scene suite with the Flocks Hub. Flocks 2026.10.13+: a Hub catalog in
    <home>/.flocks/hub-extensions/threatbook-easm plus a start-up hook in plugins/tasks that registers it,
    all inside the user directory, so Flocks upgrades no longer hide the portal. Older Flocks: the
    bundled catalog in the Flocks install directory (re-run the installer after upgrading Flocks).
  * switches the EASM workspace on (as the Flocks scene manager does after installing a suite)
  * builds the page bundles when the Flocks Python package is importable (otherwise the Flocks
    file watcher builds them within seconds while Flocks is running)
It never touches <home>/.flocks/data/easm.db, existing evidence screenshots or the inbox.
Standard library only.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGINS = HERE / "plugins"
PAGES = ["easm-overview", "easm-attack-surface", "easm-exposure-risks", "easm-data-leaks", "easm-findings", "easm-reports"]
KEEP_IN_PAGE = {"dist", "assets/screenshots"}


def log(msg: str) -> None:
    print(msg, flush=True)


def copy_tree(src: Path, dst: Path, *, dry: bool, keep: set[str] = frozenset(), label: str = "") -> int:
    """Replace dst with src, preserving the relative sub-paths listed in *keep*."""
    n = 0
    if dst.exists():
        for child in sorted(dst.rglob("*")):
            rel = child.relative_to(dst).as_posix()
            if any(rel == k or rel.startswith(k + "/") for k in keep):
                continue
            if child.is_file() and "__pycache__" not in child.parts and not (src / rel).exists():
                if not dry:
                    child.unlink()
                n += 1
    for f in sorted(src.rglob("*")):
        if not f.is_file() or "__pycache__" in f.parts:
            continue
        rel = f.relative_to(src)
        target = dst / rel
        if target.exists() and target.stat().st_size == f.stat().st_size and target.read_bytes() == f.read_bytes():
            continue
        if not dry:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, target)
        n += 1
    log(f"  {label or dst}: {n} file(s) {'would change' if dry else 'updated'}")
    return n


def install(home: Path, *, dry: bool) -> None:
    plugins = home / ".flocks" / "plugins"
    log(f"Installing ThreatBook EASM Portal into {plugins}")
    # pages
    web_src = PLUGINS / "webuis" / "easm"
    web_dst = plugins / "contracts" / "webui" / "easm"
    for f in ("workspace.json",):
        copy_tree_file(web_src / f, web_dst / f, dry=dry)
    for page in PAGES:
        copy_tree(web_src / page, web_dst / page, dry=dry, keep=KEEP_IN_PAGE, label=f"page {page}")
    # access contracts (main-process plugins)
    copy_tree(web_src / "access", plugins / "contracts" / "access" / "easm", dry=dry, label="access contracts")
    # workflow, skill, tool, agent
    copy_tree(PLUGINS / "workflows" / "easm_ingest", plugins / "workflows" / "easm_ingest", dry=dry, keep={"testdata"}, label="workflow easm_ingest")
    if (PLUGINS / "skills" / "easm-ingest").is_dir():
        copy_tree(PLUGINS / "skills" / "easm-ingest", plugins / "skills" / "easm-ingest", dry=dry, label="skill easm-ingest")
    if (PLUGINS / "tools" / "python" / "easm_workspace_query").is_dir():
        copy_tree(PLUGINS / "tools" / "python" / "easm_workspace_query", plugins / "tools" / "python" / "easm_workspace_query", dry=dry, label="tool easm_workspace_query")
    if (PLUGINS / "agents" / "easm-analyst").is_dir():
        copy_tree(PLUGINS / "agents" / "easm-analyst", plugins / "agents" / "easm-analyst", dry=dry, label="agent easm-analyst")


def copy_tree_file(src: Path, dst: Path, *, dry: bool) -> None:
    if dst.exists() and dst.read_bytes() == src.read_bytes():
        return
    if not dry:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    log(f"  {dst.name}: {'would update' if dry else 'updated'}")


def flocks_importable() -> bool:
    try:
        import flocks  # type: ignore  # noqa: F401

        return True
    except Exception:
        return False


def _imports_flocks(py: Path) -> bool:
    import subprocess

    try:
        return subprocess.run([str(py), "-c", "import flocks"], capture_output=True, timeout=120).returncode == 0
    except Exception:
        return False


def flocks_python() -> Path | None:
    """Interpreter of the Flocks virtualenv, found through the `flocks` CLI shim (~/.local/bin/flocks[.cmd]).

    Only an interpreter that can actually import flocks is returned (a python.exe that `uv python install`
    put next to flocks.cmd in ~/.local/bin is not the Flocks venv)."""
    import re
    import shutil as _sh

    def venv_python_next_to(script: Path) -> Path | None:
        for name in ("python", "python3", "python.exe"):
            sibling = script.parent / name
            if sibling.is_file() and (script.parent.parent / "pyvenv.cfg").is_file():
                return sibling
        return None

    candidates: list[Path] = []
    for cand in (Path.home() / ".local" / "bin" / "flocks.cmd", Path.home() / ".local" / "bin" / "flocks", Path(_sh.which("flocks") or "")):
        if not cand.is_file():
            continue
        real = cand.resolve()                      # macOS/Linux: ~/.local/bin/flocks -> <root>/.venv/bin/flocks
        sibling = venv_python_next_to(real)
        if sibling:
            candidates.append(sibling)
        text = real.read_text(encoding="utf-8", errors="replace")
        head = text.splitlines()[0] if text else ""
        if head.startswith("#!"):                  # console-script shebang -> the venv interpreter
            shebang = Path(head[2:].strip().split()[-1])
            if shebang.is_file():
                candidates.append(shebang)
        m = re.search(r'"?([^"\r\n]*?(?:python(?:3(?:\.\d+)?)?(?:\.exe)?))"?\s+(?:-m\s+)?flocks', text)  # Windows .cmd
        if m and Path(m.group(1)).is_file():
            candidates.append(Path(m.group(1)))
    tool_python = Path.home() / ".local" / "share" / "uv" / "tools" / "flocks" / "bin" / "python"
    if tool_python.is_file():
        candidates.append(tool_python)
    seen: set[str] = set()
    for py in candidates:
        key = str(py)
        if key in seen:
            continue
        seen.add(key)
        if _imports_flocks(py):
            return py
    return None


def build_pages(home: Path) -> None:
    try:
        from flocks.contracts.webui.builder import WebUIPageBuilder  # type: ignore
        from flocks.contracts.webui.store import WebUIPagesStore, get_webui_pages_root  # type: ignore
    except Exception:
        log("  Flocks Python package not importable from this interpreter: skipping the build step.")
        log("  If Flocks is running, its file watcher builds the pages automatically; otherwise open the workspace and click Build.")
        return
    root = home / ".flocks" / "plugins" / "contracts" / "webui"
    if root.resolve() != get_webui_pages_root():
        log(f"  build skipped: {root} is not this Flocks' page root; that Flocks builds the pages itself when it runs.")
        return
    try:
        store = WebUIPagesStore()
        builder = WebUIPageBuilder(store)
        for page in PAGES:
            meta = builder.build(page)
            status = getattr(meta, "status", "?")
            err = getattr(meta, "error", None)
            log(f"  build {page}: {status}{' — ' + str(err)[:200] if err else ''}")
    except Exception as exc:  # pragma: no cover - depends on the host
        log(f"  build step failed ({exc}); the Flocks watcher will retry while Flocks is running.")


EXT_NAME = "threatbook-easm"
SUITE_ID = "easm-portal"
# (path under plugins/ in this package and in a Hub root, Hub type, Hub id, install dir under ~/.flocks/plugins)
HUB_PLUGINS = (
    ("webuis/easm", "webui", "easm", "contracts/webui/easm"),
    ("workflows/easm_ingest", "workflow", "easm_ingest", "workflows/easm_ingest"),
    ("skills/easm-ingest", "skill", "easm-ingest", "skills/easm-ingest"),
    ("components/easm-portal", "component", SUITE_ID, "components/easm-portal"),
)
LEGACY_IDS = {"easm", "easm_ingest", "easm-ingest", "easm_workspace_query", "easm-analyst", SUITE_ID}
LEGACY_BUNDLED_DIRS = ("webuis/easm", "workflows/easm_ingest", "skills/easm-ingest", "components/easm-portal",
                       "tools/python/easm_workspace_query", "agents/easm-analyst")
# Flocks imports every .py in plugins/tasks at start-up and every .py in plugins/tools on start-up and on a
# tools refresh; the module defines no tasks or tools, it only adds our Hub catalog (see BOOTSTRAP).
BOOTSTRAPS = (("tasks", "threatbook_easm_hub.py"), ("tools/python", "threatbook_easm_hub_tools.py"))

BOOTSTRAP = '''"""ThreatBook EASM Portal: add its Hub catalog to Flocks at start-up. Written by install.py, do not edit.

Flocks shows a scene workspace only when a Hub scene suite declares it. The suite's catalog lives in
~/.flocks/hub-extensions/threatbook-easm, outside the Flocks install directory, so it survives Flocks
upgrades; this module registers it (flocks.extensions.register_hub_root, Flocks 2026.10.13+). Flocks
imports it from plugins/tasks at every start and from plugins/tools on a tools refresh. It defines no
tasks or tools.
"""
import logging
from pathlib import Path

TASKS = []


def _root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if parent.name == "plugins":
            return parent.parent / "hub-extensions" / "threatbook-easm"
    return Path.home() / ".flocks" / "hub-extensions" / "threatbook-easm"


def _register() -> None:
    try:
        from flocks.extensions import register_hub_root
    except Exception:
        logging.getLogger("threatbook_easm_hub").warning("flocks.extensions.register_hub_root is not available; re-run the EASM install.py")
        return
    root = _root()
    try:
        from flocks.hub.paths import extension_hub_roots

        if root.resolve() in [p.resolve() for p in extension_hub_roots()]:
            return  # already registered in this process; registering again would only clear the Hub caches
    except Exception:
        pass
    register_hub_root("threatbook-easm", root)


try:
    _register()
except Exception as exc:  # never break Flocks start-up
    logging.getLogger("threatbook_easm_hub").warning("EASM hub registration failed: %s", exc)
'''


def flocks_supports_extension_roots() -> bool | None:
    """True on Flocks 2026.10.13+, False on older Flocks, None when Flocks is not importable here."""
    if not flocks_importable():
        return None
    try:
        from flocks.extensions import register_hub_root  # type: ignore  # noqa: F401

        return True
    except Exception:
        return False


def _replace_with_retry(tmp: Path, path: Path) -> None:
    """os.replace, retried: on Windows a reader holding the target open makes the swap fail for a moment."""
    import time

    for attempt in range(40):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == 39:
                raise
            time.sleep(0.05)


def write_text_if_changed(path: Path, text: str, *, dry: bool, label: str) -> None:
    if path.is_file() and path.read_text(encoding="utf-8") == text:
        return
    if not dry:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        tmp.write_text(text, encoding="utf-8")
        try:
            _replace_with_retry(tmp, path)
        finally:
            if tmp.exists():
                tmp.unlink()
    log(f"  {label}: {'would write' if dry else 'written'}")


def index_entries() -> list[dict]:
    entries = []
    for rel, _ptype, _pid, _dst in HUB_PLUGINS:
        mpath = PLUGINS / rel / "manifest.json"
        if not mpath.is_file():
            continue
        m = json.loads(mpath.read_text(encoding="utf-8"))
        entry = {k: m.get(k) for k in ("id", "type", "name", "nameCn", "description", "descriptionCn", "version", "category", "tags", "useCases", "trust")}
        entry |= {"riskLevel": (m.get("risk") or {}).get("level", "low"), "edition": "oss", "manifestPath": f"plugins/{rel}/manifest.json"}
        entries.append({k: v for k, v in entry.items() if v is not None})
    return entries


def _flocks_home_matches(home: Path) -> bool:
    """True when <home> is the Flocks home this interpreter's Flocks uses (records/state belong to that Flocks)."""
    try:
        from flocks.hub import local  # type: ignore

        return local.install_root("webui").resolve() == (home / ".flocks" / "plugins" / "contracts" / "webui").resolve()
    except Exception:
        return False


def _with_hub_lock(fn) -> None:
    """Run fn() under Flocks' Hub mutation lock (data/hub/install.lock) when this Flocks has one."""
    try:
        from flocks.hub.update_protection import mutation_lock  # type: ignore
    except Exception:
        fn()
        return
    import asyncio

    async def run() -> None:
        async with mutation_lock():
            fn()

    asyncio.run(run())


def register_extension(home: Path, *, dry: bool) -> bool:
    """Flocks 2026.10.13+: keep the Hub catalog under ~/.flocks and register it at every Flocks start.

    Flocks shows a scene workspace only when a Hub scene suite (component) declares it, and an upgrade
    replaces the Flocks install directory. So the catalog goes to <home>/.flocks/hub-extensions/threatbook-easm
    and a small bootstrap module in plugins/tasks (and plugins/tools) registers it with
    flocks.extensions.register_hub_root. Nothing here lives inside the Flocks install directory.
    """
    dot = home / ".flocks"
    ext = dot / "hub-extensions" / EXT_NAME
    log(f"  Hub extension catalog: {ext}")
    for rel, _ptype, _pid, _dst in HUB_PLUGINS:
        if (PLUGINS / rel).is_dir():
            copy_tree(PLUGINS / rel, ext / "plugins" / rel, dry=dry, label=f"hub {rel}")
    index = {"schemaVersion": "hub.index.v1", "plugins": index_entries()}
    write_text_if_changed(ext / "index.json", json.dumps(index, ensure_ascii=False, indent=2) + "\n", dry=dry, label="hub index.json")
    for sub, name in BOOTSTRAPS:
        write_text_if_changed(dot / "plugins" / sub / name, BOOTSTRAP, dry=dry, label=f"start-up hook plugins/{sub}/{name}")
    # suite shell, the same file the Hub installer leaves in plugins/components/<id>/
    copy_tree_file(PLUGINS / "components" / SUITE_ID / "component.json", dot / "plugins" / "components" / SUITE_ID / "component.json", dry=dry)
    after_registration(home, dry=dry)
    return True


def after_registration(home: Path, *, dry: bool) -> None:
    record_installs(home, dry=dry)
    enable_workspace(home, dry=dry)


def record_installs(home: Path, *, dry: bool = False) -> None:
    """Record the payloads in Flocks' installed.json (through Flocks' own code, under its Hub lock) so the
    scene manager shows the suite as installed instead of offering a repair that re-copies the pages."""
    try:
        from flocks.hub import local  # type: ignore
    except Exception:
        log("  Flocks Hub records skipped (Flocks is not importable from this interpreter).")
        return
    if not _flocks_home_matches(home):
        log("  Flocks Hub records skipped (--home is not the Flocks home of this interpreter).")
        return
    versions = {e["id"]: e.get("version", "0") for e in index_entries()}
    wanted = []
    for rel, ptype, pid, dst in HUB_PLUGINS:
        path = home / ".flocks" / "plugins" / dst
        if pid in versions and (path.exists() or dry):
            wanted.append((ptype, pid, versions[pid], f"bundled:plugins/{rel}", path, None if ptype == "component" else f"component:{SUITE_ID}"))

    def apply() -> None:
        current = local.load_installed_records()
        for ptype, pid, version, source, path, by in wanted:
            rec = current.get(f"{ptype}:{pid}")
            if rec is not None and rec.version == version and rec.source == source and rec.installedBy == by and Path(rec.installPath or "") == path:
                continue
            if dry:
                log(f"  Hub record {ptype}:{pid} {version}: would write")
                continue
            local.save_installed_record(local.make_record(plugin_type=ptype, plugin_id=pid, version=version, source=source, install_path=path, installed_by=by))
            log(f"  Hub record {ptype}:{pid} {version}: written")

    try:
        if dry:
            apply()
        else:
            _with_hub_lock(apply)
    except Exception as exc:
        log(f"  Flocks Hub records not written ({exc}); the scene manager may offer Update/Repair for the suite.")


def enable_workspace(home: Path, *, dry: bool = False) -> None:
    """Switch the EASM workspace on, as the scene manager does after installing or updating a suite.

    The operator override lives in plugins/contracts/webui/.workspace-state.json ({"enabled": {id: bool}}) and is
    read by Flocks on every navigation request; other workspaces' keys are kept as they are."""
    path = home / ".flocks" / "plugins" / "contracts" / "webui" / ".workspace-state.json"
    try:
        state = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    except Exception:
        state = {}
    if not isinstance(state, dict):
        state = {}
    enabled = state.get("enabled") if isinstance(state.get("enabled"), dict) else {}
    if enabled.get("easm") is not False:
        return  # on by default (workspace.json "enabled": true) unless an operator override turned it off
    if dry:
        log("  workspace easm: would switch on (.workspace-state.json)")
        return
    if _flocks_home_matches(home):
        try:
            from flocks.contracts.webui.store import WebUIPagesStore  # type: ignore

            WebUIPagesStore().set_workspace_enabled("easm", True)
            log("  workspace easm: switched on")
            return
        except Exception as exc:
            log(f"  Flocks could not switch the workspace on ({exc}); writing the override directly.")
    enabled["easm"] = True
    state["enabled"] = enabled
    write_text_if_changed(path, json.dumps(state, ensure_ascii=False, indent=2), dry=False, label="workspace easm switched on (.workspace-state.json)")


def hub_root() -> Path | None:
    """The bundled Flocks Hub catalog (<flocks source>/.flocks/flockshub), if reachable from this interpreter."""
    root = os.environ.get("FLOCKS_HUB_ROOT")
    candidates = [Path(root)] if root else []
    try:
        import flocks  # type: ignore

        pkg = Path(flocks.__file__).resolve().parent
        candidates += [pkg / ".flocks" / "flockshub", pkg.parent / ".flocks" / "flockshub"]
    except Exception:
        pass
    return next((c for c in candidates if (c / "index.json").is_file()), None)


def register_bundled(home: Path, *, dry: bool) -> bool:
    """Flocks 2026.9.23 – 2026.10.12 (no extension roots): register in the bundled Hub catalog.

    A Flocks upgrade replaces that catalog, so on these versions the installer must be re-run after upgrading."""
    hub = hub_root()
    if hub is None:
        log("  Hub catalog not found from this interpreter: run install.py with the Flocks Python (or set FLOCKS_HUB_ROOT).")
        return False
    log(f"  Hub catalog (bundled, lost on Flocks upgrades): {hub}")
    for rel, _ptype, _pid, _dst in HUB_PLUGINS:
        if (PLUGINS / rel).is_dir():
            copy_tree(PLUGINS / rel, hub / "plugins" / rel, dry=dry, label=f"hub {rel}")
    index_path = hub / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    index["plugins"] = [e for e in index.get("plugins", []) if e.get("id") not in LEGACY_IDS] + index_entries()
    write_text_if_changed(index_path, json.dumps(index, ensure_ascii=False, indent=2) + "\n", dry=dry, label="bundled index.json: EASM entries")
    try:
        after_registration(home, dry=dry)
    except Exception as exc:  # older Flocks internals may differ; the registration itself is done
        log(f"  post-registration steps skipped ({exc}).")
    log("  Click Refresh on the Flocks Hub page (or restart Flocks) so the catalog is re-read.")
    return True


def unregister_bundled(*, dry: bool) -> None:
    """Remove EASM entries and payload copies an older installer (or the fallback) put in the bundled catalog."""
    hub = hub_root()
    if hub is None:
        return
    index_path = hub / "index.json"
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except Exception:
        return
    kept = [e for e in index.get("plugins", []) if e.get("id") not in LEGACY_IDS]
    if len(kept) != len(index.get("plugins", [])):
        index["plugins"] = kept
        write_text_if_changed(index_path, json.dumps(index, ensure_ascii=False, indent=2) + "\n", dry=dry, label=f"bundled catalog {hub}: EASM entries removed")
    for rel in LEGACY_BUNDLED_DIRS:
        target = hub / "plugins" / rel
        if target.exists():
            log(f"  remove bundled {rel}")
            if not dry:
                shutil.rmtree(target)


def register(home: Path, *, dry: bool) -> bool:
    support = flocks_supports_extension_roots()
    if support is True:
        return register_extension(home, dry=dry)
    if support is False:
        return register_bundled(home, dry=dry)
    # Flocks is not importable here and no Flocks interpreter was found (main() would have switched to it).
    if os.environ.get("FLOCKS_HUB_ROOT"):
        return register_bundled(home, dry=dry)
    log("  WARNING: the Flocks interpreter was not found, so the Flocks version is unknown. Writing the user-dir")
    log("  Hub catalog (Flocks 2026.10.13+); Hub records and the page build are skipped. Re-run install.py with the")
    log("  Python of the Flocks virtualenv to complete them.")
    return register_extension(home, dry=dry)


def post_install(home: Path, *, want_hub: bool, want_build: bool) -> None:
    if want_hub:
        register(home, dry=False)
    if want_build:
        build_pages(home)


def uninstall(home: Path, *, dry: bool) -> None:
    plugins = home / ".flocks" / "plugins"
    web = plugins / "contracts" / "webui" / "easm"
    log(f"Removing the EASM Portal from {plugins} (easm.db and evidence screenshots are kept)")
    for page in PAGES:
        for sub in ("src", "api", "dist", "manifest.json"):
            target = web / page / sub
            if target.exists():
                log(f"  remove {target.relative_to(plugins)}")
                if not dry:
                    shutil.rmtree(target) if target.is_dir() else target.unlink()
    removable = ["contracts/webui/easm/workspace.json", "contracts/access/easm", "workflows/easm_ingest", "skills/easm-ingest",
                 "tools/python/easm_workspace_query", "agents/easm-analyst", f"components/{SUITE_ID}"]
    for sub, name in BOOTSTRAPS:
        removable.append(f"{sub}/{name}")
        removable += [f"{sub}/__pycache__/{pyc.name}" for pyc in (plugins / sub / "__pycache__").glob(Path(name).stem + ".*.pyc")]
    for rel in removable:
        target = plugins / rel
        if target.exists():
            log(f"  remove {rel}")
            if not dry:
                shutil.rmtree(target) if target.is_dir() else target.unlink()
    ext = home / ".flocks" / "hub-extensions" / EXT_NAME
    if ext.exists():
        log(f"  remove {ext}")
        if not dry:
            shutil.rmtree(ext)
    unregister_bundled(dry=dry)
    if not flocks_importable():
        log("  Flocks Hub records left in place (Flocks is not importable from this interpreter).")
    elif not _flocks_home_matches(home):
        log("  Flocks Hub records left in place (--home is not the Flocks home of this interpreter).")
    elif not dry:
        try:
            from flocks.hub import local  # type: ignore

            def apply() -> None:
                for _rel, ptype, pid, _dst in HUB_PLUGINS:
                    local.remove_installed_record(ptype, pid)

            _with_hub_lock(apply)
            log("  Flocks Hub records removed.")
        except Exception as exc:
            log(f"  Flocks Hub records not removed ({exc}).")
    log("  Restart Flocks to drop the EASM catalog from the running server.")


def reexec_with_flocks_python() -> int | None:
    """Run this whole command again with the Flocks interpreter when this one cannot import flocks.

    Registration, Hub records and the page build need Flocks' own code; copying files does not, but doing
    everything in one interpreter keeps --dry-run previews and exit codes truthful. Returns the child's exit
    code, or None to continue in this interpreter."""
    if os.environ.get("EASM_INSTALL_CHILD") == "1" or flocks_importable():
        return None
    py = flocks_python()
    if py is None:
        return None
    import subprocess

    log(f"Continuing with the Flocks interpreter {py}")
    env = dict(os.environ, EASM_INSTALL_CHILD="1")
    return subprocess.run([str(py), str(Path(__file__).resolve()), *sys.argv[1:]], env=env).returncode


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--home", default=str(Path.home()), help="directory that contains .flocks/ (default: your home)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--hub", action="store_true", help="(default) register the scene suite with the Flocks Hub; required for Flocks 2026.9.23+")
    ap.add_argument("--no-hub", action="store_true", help="skip the Hub registration (the portal then stays hidden on Flocks 2026.9.23+)")
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--build-only", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--post-install", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--uninstall", action="store_true")
    args = ap.parse_args()
    rc = reexec_with_flocks_python()
    if rc is not None:
        return rc
    home = Path(args.home).expanduser().resolve()
    if not (home / ".flocks").is_dir():
        log(f"{home / '.flocks'} does not exist. Is Flocks installed for this user? Use --home to point at the right directory.")
        return 2
    if args.build_only:
        build_pages(home)
        return 0
    if args.post_install:
        if not args.no_hub:
            register(home, dry=False)
        if not args.no_build:
            build_pages(home)
        return 0
    if args.uninstall:
        uninstall(home, dry=args.dry_run)
        return 0
    install(home, dry=args.dry_run)
    if args.dry_run:
        if not args.no_hub:
            register(home, dry=True)
    else:
        post_install(home, want_hub=not args.no_hub, want_build=not args.no_build)
    log("")
    log("Next steps:")
    log("  1. Put a Fernet key in the EASM_SECRET_KEY environment variable of the Flocks service and restart Flocks")
    log("     (python -c \"from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())\").")
    log("  2. Restart Flocks once (or click Refresh on the Flocks Tools page) so it loads the EASM Hub catalog, then")
    log("     pick 'EASM Portal' in the workspace switcher at the top. The pages show 'No period is available yet'.")
    log("  3. Upload a period's deliverables to workspace/easm/inbox/<period_id>/ and run the easm_ingest workflow,")
    log("     then review and publish the period on the Reports page.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
