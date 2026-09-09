import json
import sys
from pathlib import Path

wf_path = Path.home() / ".flocks" / "plugins" / "workflows" / "easm_ingest" / "workflow.json"
data = json.loads(wf_path.read_text(encoding="utf-8"))
print("JSON parsed OK")
print("name:", data.get("name"))
print("start:", data.get("start"))
print("nodes:", [n["id"] for n in data["nodes"]])
print("edges:", len(data["edges"]))
node_ids = {n["id"] for n in data["nodes"]}
for e in data["edges"]:
    assert e["from"] in node_ids, f"unknown from: {e['from']}"
    assert e["to"] in node_ids, f"unknown to: {e['to']}"
    assert e.get("mapping"), f"empty mapping on {e['from']}->{e['to']}"
    for k, v in e["mapping"].items():
        assert v, f"empty value for {k} on edge {e['from']}->{e['to']}"
print("all edges have non-empty mapping")
for n in data["nodes"]:
    code = n["code"]
    compile(code, f"<node {n['id']}>", "exec")
    print(f"compiled OK: {n['id']} ({len(code)} chars)")
print("triggers:", len(data.get("triggers") or []))
print("metadata keys:", list(data.get("metadata", {}).keys()))
print("requirements:", data["metadata"].get("requirements"))
print("node_timeout_s:", data["metadata"].get("node_timeout_s"))
print("sampleInputs keys:", list(data["metadata"]["sampleInputs"].keys()))
print("PASS")
