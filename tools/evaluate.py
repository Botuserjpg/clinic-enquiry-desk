"""Compare deterministic triage output with a separate synthetic label file."""

import argparse
import json
from pathlib import Path

from triage import classify, load_rules

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enquiries", default=str(ROOT / "data/enquiries.json"))
    parser.add_argument("--labels", default=str(ROOT / "data/labels.json"))
    parser.add_argument("--report", help="Optional path for a Markdown report")
    args = parser.parse_args()
    enquiries = json.loads(Path(args.enquiries).read_text(encoding="utf-8"))
    labels = {row["id"]: row for row in json.loads(Path(args.labels).read_text(encoding="utf-8"))}
    rules = load_rules()
    category_ok = priority_ok = flags_ok = all_ok = 0
    emergency_expected = []
    emergency_recalled = []
    for enquiry in enquiries:
        expected = labels[enquiry["id"]]
        actual = classify(enquiry["message"], rules)
        checks = [actual[key] == expected[key] for key in ("category", "priority", "redFlags")]
        category_ok += checks[0]
        priority_ok += checks[1]
        flags_ok += checks[2]
        all_ok += all(checks)
        if expected["category"] == "Emergency":
            emergency_expected.append(enquiry["id"])
            if actual["category"] == "Emergency":
                emergency_recalled.append(enquiry["id"])
    count = len(enquiries)
    emergency_total = len(emergency_expected)
    recall = (len(emergency_recalled) / emergency_total) if emergency_total else 1.0
    result = {
        "rows": count,
        "category_matches": category_ok,
        "priority_matches": priority_ok,
        "red_flag_matches": flags_ok,
        "all_fields_match": all_ok,
        "emergency_rows": emergency_total,
        "emergency_recalled": len(emergency_recalled),
        "emergency_recall": f"{len(emergency_recalled)}/{emergency_total} ({recall:.0%})",
        "emergency_missed": sorted(set(emergency_expected) - set(emergency_recalled)),
        "scope": "Synthetic rule-consistency check only; not clinical validation.",
    }
    print(json.dumps(result, indent=2))
    if args.report:
        report = ("# Evaluation report\n\n"
                  "This is a deterministic comparison against fictional labels, not a clinical validation.\n\n"
                  f"- Synthetic rows evaluated: {count}\n"
                  f"- Category matches: {category_ok}/{count}\n"
                  f"- Priority matches: {priority_ok}/{count}\n"
                  f"- Red-flag matches: {flags_ok}/{count}\n"
                  f"- Rows matching every field: {all_ok}/{count}\n"
                  f"- Emergency recall: {len(emergency_recalled)}/{emergency_total} ({recall:.0%})\n"
                  f"- Emergency rows missed: {len(set(emergency_expected) - set(emergency_recalled))}\n")
        Path(args.report).write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
