import json
import re
from pathlib import Path

HOME = Path.home()
WF_DIR = HOME / ".flocks" / "plugins" / "workflows" / "easm_ingest"
SCHEMA_PATH = WF_DIR / "bin" / "easm-data-pack.schema.json"

MODULE_MAP = [
    ("domains",            ["assets", "domains"],                    False),
    ("ips",                ["assets", "ips"],                        False),
    ("websites",           ["assets", "websites"],                   False),
    ("services",           ["assets", "services"],                   False),
    ("components",         ["assets", "components"],                 False),
    ("certificates",       ["assets", "certificates"],               False),
    ("http_configs",       ["assets", "http_configs"],               False),
    ("mobile_apps",        ["assets", "mobile_apps"],                False),
    ("wechat_accounts",    ["assets", "wechat_official_accounts"],  False),
    ("wechat_mini_programs", ["assets", "wechat_mini_programs"],     False),
    ("login_portals",      ["risks", "login_portals"],               False),
    ("risky_services",     ["risks", "risky_services"],              False),
    ("certificate_risks",  ["risks", "certificates"],                False),
    ("malicious_ip_tags",  ["risks", "malicious_ip_tags"],           False),
    ("vulnerabilities",    ["risks", "vulnerabilities"],             False),
    ("dark_web",           ["leaks", "dark_web"],                    False),
    ("files",              ["leaks", "files"],                       False),
    ("code",               ["leaks", "code"],                        False),
    ("credentials",        ["leaks", "credentials"],                 False),
    ("emails",             ["leaks", "emails"],                      False),
    ("findings",           ["findings"],                             True),
]

params = inputs.get("params") or {}
period_id = params.get("period_id")
customer_id = params.get("customer_id") or "customer"

datapack_path = inputs.get("datapack_path") or ""
if not datapack_path:
    raise RuntimeError("datapack_path is required for validate")

dp_path = Path(datapack_path)
if not dp_path.is_file():
    raise RuntimeError(f"datapack file not found: {datapack_path}")

try:
    with open(dp_path, "r", encoding="utf-8") as fp:
        datapack = json.load(fp)
except Exception as exc:
    raise RuntimeError(f"failed to read datapack.json: {exc}")

if not SCHEMA_PATH.is_file():
    raise RuntimeError(f"schema file not found: {SCHEMA_PATH}")

try:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as fp:
        schema = json.load(fp)
except Exception as exc:
    raise RuntimeError(f"failed to read schema: {exc}")

schema_ok = False
schema_errors = []
try:
    import jsonschema
    schema_has_dialect = bool(schema.get("$schema"))
    if schema_has_dialect:
        validator_cls = jsonschema.Draft202012Validator
    else:
        validator_cls = jsonschema.Draft7Validator
    validator = validator_cls(schema)
    errors = sorted(validator.iter_errors(datapack), key=lambda e: list(e.absolute_path))
    if errors:
        schema_errors = [
            {"path": "/".join(str(p) for p in err.absolute_path) or "<root>", "message": err.message}
            for err in errors[:5]
        ]
    else:
        schema_ok = True
except ImportError:
    schema_errors.append({"path": "<root>", "message": "jsonschema package not installed"})
except Exception as exc:
    schema_errors.append({"path": "<root>", "message": f"validation error: {exc}"})

if not schema_ok:
    msg = "datapack failed schema validation:\n" + "\n".join(
        f"  - {e['path']}: {e['message']}" for e in schema_errors
    )
    raise RuntimeError(msg)

warnings = list(datapack.get("warnings") or [])

period_obj = datapack.get("period") or {}
if period_obj.get("id") and period_obj["id"] != period_id:
    raise RuntimeError(
        f"datapack.period.id ({period_obj['id']!r}) does not match params.period_id ({period_id!r})"
    )

customer_obj = datapack.get("customer") or {}
if customer_obj.get("id") and customer_obj["id"] != customer_id:
    warnings.append(
        f"customer.id mismatch: datapack={customer_obj['id']!r} params={customer_id!r}"
    )

cross_checks = datapack.get("cross_checks") or []
mismatches = [c for c in cross_checks if not c.get("match")]

counts = {}
lifecycle_counts = {}
unique_counts = {}
duplicate_ids = {}
for table_name, path_keys, _top_level in MODULE_MAP:
    cursor = datapack
    try:
        for key in path_keys:
            cursor = cursor[key]
        if not isinstance(cursor, list):
            cursor = []
    except (KeyError, TypeError):
        cursor = []
    counts[table_name] = len(cursor)
    lc = {}
    seen_ids = set()
    dup_count = 0
    for rec in cursor:
        if isinstance(rec, dict):
            life = rec.get("lifecycle") or "unknown"
            lc[life] = lc.get(life, 0) + 1
            rid = rec.get("id")
            if rid in seen_ids:
                dup_count += 1
            elif rid:
                seen_ids.add(rid)
    lifecycle_counts[table_name] = lc
    unique_counts[table_name] = len(seen_ids)
    if dup_count:
        duplicate_ids[table_name] = dup_count
        warnings.append(f"{table_name}: {dup_count} rows share an entity id with an earlier row and will be collapsed on load")

needs_review = bool(mismatches) or bool(duplicate_ids)

outputs["params"] = params
outputs["datapack_path"] = datapack_path
outputs["schema_ok"] = schema_ok
outputs["schema_errors"] = schema_errors
outputs["needs_review"] = needs_review
outputs["mismatches"] = mismatches
outputs["warnings"] = warnings
outputs["counts"] = counts
outputs["unique_counts"] = unique_counts
outputs["duplicate_ids"] = duplicate_ids
outputs["lifecycle_counts"] = lifecycle_counts
outputs["narrative_path"] = inputs.get("narrative_path") or ""
outputs["_edge_context"] = True
