#!/usr/bin/env python3
"""Install or upgrade the ThreatBook EASM Portal into a Flocks instance.

    python install.py                 # install into ~/.flocks (idempotent; safe to re-run for upgrades)
    python install.py --dry-run       # show what would change
    python install.py --home /path    # a different Flocks home (the directory that contains .flocks/)
    python install.py --hub           # also register the package in the bundled Flocks Hub catalog
    python install.py --uninstall     # remove the portal (keeps easm.db and evidence screenshots)

What it does
  * copies the six workspace pages to   <home>/.flocks/plugins/contracts/webui/easm/
  * copies the access contracts to      <home>/.flocks/plugins/contracts/access/easm/
  * copies the ingest workflow to       <home>/.flocks/plugins/workflows/easm_ingest/
  * copies the skill / tool / agent to  <home>/.flocks/plugins/{skills,tools/python,agents}/...
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
            if child.is_file() and not (src / rel).exists():
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


def build_pages(home: Path) -> None:
    try:
        from flocks.contracts.webui.builder import WebUIPageBuilder  # type: ignore
        from flocks.contracts.webui.store import WebUIPagesStore  # type: ignore
    except Exception:
        log("  Flocks Python package not importable from this interpreter: skipping the build step.")
        log("  If Flocks is running, its file watcher builds the pages automatically; otherwise open the workspace and click Build.")
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


def register_hub(dry: bool) -> None:
    """Stage the package into the bundled Flocks Hub catalog so it appears in the Hub page (optional)."""
    root = os.environ.get("FLOCKS_HUB_ROOT")
    candidates = [Path(root)] if root else []
    try:
        import flocks  # type: ignore

        pkg = Path(flocks.__file__).resolve().parent
        candidates += [pkg / ".flocks" / "flockshub", pkg.parent / ".flocks" / "flockshub"]
    except Exception:
        pass
    hub = next((c for c in candidates if (c / "index.json").is_file()), None)
    if hub is None:
        log("  Hub catalog not found (set FLOCKS_HUB_ROOT or run with the Flocks Python); skipping --hub.")
        return
    log(f"  Hub catalog: {hub}")
    for rel in ("webuis/easm", "workflows/easm_ingest", "skills/easm-ingest", "tools/python/easm_workspace_query", "agents/easm-analyst", "components/easm-portal"):
        src = PLUGINS / rel
        if src.is_dir():
            copy_tree(src, hub / "plugins" / rel, dry=dry, label=f"hub {rel}")
    index_path = hub / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    entries = [e for e in index.get("plugins", []) if not (e.get("id") in {"easm", "easm_ingest", "easm-ingest", "easm_workspace_query", "easm-analyst", "easm-portal"})]
    for rel, ptype, pid in (("webuis/easm", "webui", "easm"), ("workflows/easm_ingest", "workflow", "easm_ingest"), ("components/easm-portal", "component", "easm-portal")):
        mpath = PLUGINS / rel / "manifest.json"
        if not mpath.is_file():
            continue
        m = json.loads(mpath.read_text(encoding="utf-8"))
        entries.append({k: m.get(k) for k in ("id", "type", "name", "nameCn", "description", "descriptionCn", "version", "category", "tags", "useCases", "trust")} | {"riskLevel": (m.get("risk") or {}).get("level", "low"), "manifestPath": f"plugins/{rel}/manifest.json"})
    index["plugins"] = entries
    if not dry:
        index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log("  index.json: EASM entries registered (open Flocks Hub and click Refresh, then Install on 'ThreatBook EASM Portal').")


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
    for rel in ("contracts/webui/easm/workspace.json", "contracts/access/easm", "workflows/easm_ingest", "skills/easm-ingest", "tools/python/easm_workspace_query", "agents/easm-analyst"):
        target = plugins / rel
        if target.exists():
            log(f"  remove {rel}")
            if not dry:
                shutil.rmtree(target) if target.is_dir() else target.unlink()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--home", default=str(Path.home()), help="directory that contains .flocks/ (default: your home)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--hub", action="store_true", help="also register in the bundled Flocks Hub catalog")
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--uninstall", action="store_true")
    args = ap.parse_args()
    home = Path(args.home).expanduser().resolve()
    if not (home / ".flocks").is_dir():
        log(f"{home / '.flocks'} does not exist. Is Flocks installed for this user? Use --home to point at the right directory.")
        return 2
    if args.uninstall:
        uninstall(home, dry=args.dry_run)
        return 0
    install(home, dry=args.dry_run)
    if args.hub:
        register_hub(args.dry_run)
    if not args.dry_run and not args.no_build:
        build_pages(home)
    log("")
    log("Next steps:")
    log("  1. Put a Fernet key in the EASM_SECRET_KEY environment variable of the Flocks service and restart Flocks")
    log("     (python -c \"from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())\").")
    log("  2. Open Flocks -> Scene Workspaces -> ThreatBook EASM Portal. The pages show 'No period is available yet'.")
    log("  3. Upload a period's deliverables to workspace/easm/inbox/<period_id>/ and run the easm_ingest workflow,")
    log("     then review and publish the period on the Reports page.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
