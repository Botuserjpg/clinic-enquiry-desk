"""Generate the browser's embedded rules, clinic config, FAQ and evaluation bundles."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def payload(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


rules = payload(ROOT / "rules.json")
rules_payload = json.dumps(rules, ensure_ascii=False, separators=(",", ":"))
(ROOT / "rules.js").write_text(f"window.CLINIC_RULES = {rules_payload};\n", encoding="utf-8")

config = payload(ROOT / "config" / "clinic.json")
config_payload = json.dumps(config, ensure_ascii=False, separators=(",", ":"))
(ROOT / "config" / "clinic.js").write_text(f"window.CLINIC_CONFIG = {config_payload};\n", encoding="utf-8")

faq = payload(ROOT / "data" / "faq.json")
faq_payload = json.dumps(faq, ensure_ascii=False, separators=(",", ":"))
(ROOT / "faq.js").write_text(f"window.CLINIC_FAQ = {faq_payload};\n", encoding="utf-8")

fixtures = {
    "enquiries": payload(ROOT / "data" / "enquiries.json"),
    "labels": payload(ROOT / "data" / "labels.json"),
}
fixtures_payload = json.dumps(fixtures, ensure_ascii=False, separators=(",", ":"))
(ROOT / "data" / "fixtures.js").write_text(f"window.CLINIC_FIXTURES = {fixtures_payload};\n", encoding="utf-8")

evaluation_fixtures = {
    "enquiries": payload(ROOT / "data" / "eval_enquiries.json"),
    "labels": payload(ROOT / "data" / "eval_labels.json"),
}
evaluation_payload = json.dumps(evaluation_fixtures, ensure_ascii=False, separators=(",", ":"))
(ROOT / "data" / "evaluation_fixtures.js").write_text(
    f"window.CLINIC_EVALUATION_FIXTURES = {evaluation_payload};\n", encoding="utf-8"
)

metrics_path = ROOT / "docs" / "evaluation_metrics.json"
if metrics_path.exists():
    metrics = payload(metrics_path)
    metrics_payload = json.dumps(metrics, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "docs" / "evaluation_metrics.js").write_text(
        f"window.CLINIC_EVAL_METRICS = {metrics_payload};\n", encoding="utf-8"
    )

print("Generated rules.js, config/clinic.js, faq.js, data/fixtures.js, data/evaluation_fixtures.js and docs/evaluation_metrics.js when present.")
