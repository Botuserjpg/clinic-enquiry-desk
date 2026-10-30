"""Generate the browser's embedded rules and clinic config from the shared JSON files."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

rules = json.loads((ROOT / "rules.json").read_text(encoding="utf-8"))
rules_payload = json.dumps(rules, ensure_ascii=False, separators=(",", ":"))
(ROOT / "rules.js").write_text(f"window.CLINIC_RULES = {rules_payload};\n", encoding="utf-8")

config = json.loads((ROOT / "config" / "clinic.json").read_text(encoding="utf-8"))
config_payload = json.dumps(config, ensure_ascii=False, separators=(",", ":"))
(ROOT / "config" / "clinic.js").write_text(f"window.CLINIC_CONFIG = {config_payload};\n", encoding="utf-8")

print("Generated rules.js from rules.json and config/clinic.js from config/clinic.json.")
