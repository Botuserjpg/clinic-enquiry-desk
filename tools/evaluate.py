"""Evaluate the shared triage rules against the separate synthetic label file."""

import argparse
import hashlib
import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path

from triage import classify, load_rules

ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP_SEED = 20261030
BOOTSTRAP_ROUNDS = 2000

FIXES_ATTEMPTED = [
    "Kept the literal red-flag scan ahead of every category rule so emergency recall cannot be traded away for accuracy.",
    "Added complaint routing to Practice Manager and a tone score that can raise review priority but never lower an emergency.",
    "Added language detection and an interpreter suggestion without auto-translating clinical content.",
    "Added injection-phrase evidence so adversarial text is visible to staff instead of silently changing the route.",
    "Documented the remaining category-order and clinical-urgency errors below rather than hiding them.",
]


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return round(ordered[lower] * (1 - weight) + ordered[upper] * weight, 4)


def bootstrap(values, rounds=BOOTSTRAP_ROUNDS, seed=BOOTSTRAP_SEED):
    """Percentile bootstrap over a list of 0/1 outcomes."""
    if not values:
        return {"low": None, "high": None, "rounds": rounds}
    rng = random.Random(seed)
    estimates = []
    for _ in range(rounds):
        sample = [values[rng.randrange(len(values))] for _ in range(len(values))]
        estimates.append(sum(sample) / len(sample))
    return {
        "low": percentile(estimates, 0.025),
        "high": percentile(estimates, 0.975),
        "rounds": rounds,
    }


def ratio(numerator, denominator):
    return round(numerator / denominator, 4) if denominator else None


def content_sha256(rows):
    canonical = json.dumps(rows, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def evaluate(enquiries, labels):
    rules = load_rules()
    label_by_id = {row["id"]: row for row in labels}
    rows = []
    started = time.perf_counter()
    for enquiry in enquiries:
        expected = label_by_id[enquiry["id"]]
        actual = classify(enquiry["message"], rules)
        rows.append({
            "id": enquiry["id"],
            "message": enquiry["message"],
            "group": expected.get("group", "unlabelled"),
            "expected_category": expected["category"],
            "actual_category": actual["category"],
            "expected_priority": expected["priority"],
            "actual_priority": actual["priority"],
            "expected_emergency": expected["category"] == "Emergency",
            "actual_emergency": bool(actual["emergency"]),
            "category_ok": actual["category"] == expected["category"],
            "priority_ok": actual["priority"] == expected["priority"],
            "emergency_ok": (actual["category"] == "Emergency") == (expected["category"] == "Emergency"),
            "tone": actual["evidence"].get("toneLabel"),
            "language": actual["evidence"].get("language"),
        })
    elapsed = time.perf_counter() - started

    total = len(rows)
    category_ok = sum(row["category_ok"] for row in rows)
    priority_ok = sum(row["priority_ok"] for row in rows)
    exact_ok = sum(row["category_ok"] and row["priority_ok"] for row in rows)
    expected_emergency = [row for row in rows if row["expected_emergency"]]
    recalled = [row for row in expected_emergency if row["actual_emergency"]]
    false_positives = [row for row in rows if row["actual_emergency"] and not row["expected_emergency"]]
    review = [row for row in rows if row["actual_priority"] != "Routine"]

    categories = sorted({row["expected_category"] for row in rows} | {row["actual_category"] for row in rows})
    per_category = {}
    for category in categories:
        expected_rows = [row for row in rows if row["expected_category"] == category]
        predicted_rows = [row for row in rows if row["actual_category"] == category]
        true_positive = sum(row["category_ok"] for row in expected_rows)
        per_category[category] = {
            "expected": len(expected_rows),
            "predicted": len(predicted_rows),
            "true_positive": true_positive,
            "precision": ratio(true_positive, len(predicted_rows)),
            "recall": ratio(true_positive, len(expected_rows)),
            "f1": round(
                2 * (ratio(true_positive, len(predicted_rows)) or 0) * (ratio(true_positive, len(expected_rows)) or 0)
                / max(1e-9, (ratio(true_positive, len(predicted_rows)) or 0) + (ratio(true_positive, len(expected_rows)) or 0)),
                4,
            ),
        }

    confusion = defaultdict(Counter)
    for row in rows:
        confusion[row["expected_category"]][row["actual_category"]] += 1

    groups = {}
    for group in sorted({row["group"] for row in rows}):
        group_rows = [row for row in rows if row["group"] == group]
        group_emergency = [row for row in group_rows if row["expected_emergency"]]
        groups[group] = {
            "count": len(group_rows),
            "accuracy": ratio(sum(row["category_ok"] and row["priority_ok"] for row in group_rows), len(group_rows)),
            "category_accuracy": ratio(sum(row["category_ok"] for row in group_rows), len(group_rows)),
            "priority_accuracy": ratio(sum(row["priority_ok"] for row in group_rows), len(group_rows)),
            "emergency_recall": ratio(sum(row["actual_emergency"] for row in group_emergency), len(group_emergency)),
            "false_positives": sum(row["actual_emergency"] and not row["expected_emergency"] for row in group_rows),
        }

    errors = [row for row in rows if not (row["category_ok"] and row["priority_ok"])]
    severity = {"Emergency": 0, "Complaint / feedback": 1, "Prescription refill": 2, "Test results": 3, "Billing": 4, "Appointments": 5, "General enquiry": 6}
    errors.sort(key=lambda row: (severity.get(row["expected_category"], 9), row["id"]))

    def base_message(message):
        for suffix in (" Thanks.", " Please reply when you can.", " (synthetic example)", " Thank you."):
            message = message.replace(suffix, "")
        return message.strip()

    unique_errors = []
    seen = set()
    for row in errors:
        key = (base_message(row["message"]), row["expected_category"], row["actual_category"])
        if key in seen:
            continue
        seen.add(key)
        if row["expected_emergency"] and not row["actual_emergency"]:
            reason = "Missed emergency. This would be a safety defect and must be fixed before use."
        elif row["actual_emergency"] and not row["expected_emergency"]:
            reason = "Look-alike flagged as emergency. Accepted over-triage: extra human work is preferred to a missed emergency."
        elif row["expected_category"] != row["actual_category"]:
            reason = "Category order or a missing synonym. The first configured category term wins."
        else:
            reason = "Priority word missing from the configured prompt-review list. A human still reviews the message."
        unique_errors.append({
            "id": row["id"],
            "message": base_message(row["message"]),
            "group": row["group"],
            "expected": f"{row['expected_category']} · {row['expected_priority']}",
            "actual": f"{row['actual_category']} · {row['actual_priority']}",
            "reason": reason,
        })
    worst = unique_errors[:10]

    return {
        "dataset": {
            "rows": total,
            "seed": BOOTSTRAP_SEED,
            "labels_file": "data/eval_labels.json",
            "enquiries_file": "data/eval_enquiries.json",
            "sha256_enquiries": content_sha256(enquiries),
            "sha256_labels": content_sha256(labels),
        },
        "accuracy": {
            "exact_category_and_priority": ratio(exact_ok, total),
            "category": ratio(category_ok, total),
            "priority": ratio(priority_ok, total),
            "bootstrap_95_ci": bootstrap([1 if row["category_ok"] and row["priority_ok"] else 0 for row in rows]),
        },
        "emergency": {
            "expected": len(expected_emergency),
            "recalled": len(recalled),
            "recall": ratio(len(recalled), len(expected_emergency)),
            "false_positives": len(false_positives),
            "false_positive_rate": ratio(len(false_positives), total - len(expected_emergency)),
            "bootstrap_95_ci": bootstrap([1 if row["actual_emergency"] else 0 for row in expected_emergency]),
            "note": "Recall is measured only on rows labelled Emergency. Negated emergencies are labelled Emergency on purpose: over-triage is accepted, a miss is not.",
        },
        "human_review_rate": ratio(len(review), total),
        "per_category": per_category,
        "per_group": groups,
        "confusion_matrix": {expected: dict(counts) for expected, counts in sorted(confusion.items())},
        "latency": {
            "total_ms": round(elapsed * 1000, 2),
            "mean_ms": round((elapsed * 1000) / total, 4),
            "per_1000_ms": round((elapsed * 1000) / total * 1000, 2),
            "note": "Single local Python process, no network or model call. Timings vary by machine.",
        },
        "worst_errors": worst,
        "error_count": len(errors),
        "fixes_attempted": FIXES_ATTEMPTED,
        "false_positive_examples": [row["message"] for row in false_positives[:8]],
    }


def write_report(metrics, path):
    lines = [
        "# Evaluation report",
        "",
        "Generated from the synthetic evaluation set. All messages are fictional. Labels are kept in a separate file and are not read by the triage code.",
        "",
        f"- Rows: **{metrics['dataset']['rows']:,}**",
        f"- Seed: `{metrics['dataset']['seed']}`",
        f"- Enquiries SHA-256: `{metrics['dataset']['sha256_enquiries']}`",
        f"- Labels SHA-256: `{metrics['dataset']['sha256_labels']}`",
        f"- Exact category + priority accuracy: **{metrics['accuracy']['exact_category_and_priority']:.1%}** (95% bootstrap CI {metrics['accuracy']['bootstrap_95_ci']['low']:.1%}–{metrics['accuracy']['bootstrap_95_ci']['high']:.1%})",
        f"- Category accuracy: **{metrics['accuracy']['category']:.1%}**",
        f"- Priority accuracy: **{metrics['accuracy']['priority']:.1%}**",
        f"- Emergency recall: **{metrics['emergency']['recall']:.1%}** ({metrics['emergency']['recalled']}/{metrics['emergency']['expected']})",
        f"- Emergency false positives: **{metrics['emergency']['false_positives']}**",
        f"- Human-review rate: **{metrics['human_review_rate']:.1%}**",
        f"- Classification latency: **{metrics['latency']['total_ms']:.1f} ms** for the whole set ({metrics['latency']['mean_ms']:.4f} ms per message)",
        "",
        "## Per-category results",
        "",
        "| Category | Expected | Predicted | Precision | Recall | F1 |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for category, values in metrics["per_category"].items():
        lines.append(
            f"| {category} | {values['expected']} | {values['predicted']} | "
            f"{values['precision']:.1%} | {values['recall']:.1%} | {values['f1']:.1%} |"
        )
    lines += [
        "",
        "## Per-edge-group results",
        "",
        "| Group | Rows | Exact accuracy | Emergency recall | False positives |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for group, values in metrics["per_group"].items():
        recall = "n/a" if values["emergency_recall"] is None else f"{values['emergency_recall']:.1%}"
        lines.append(f"| {group} | {values['count']} | {values['accuracy']:.1%} | {recall} | {values['false_positives']} |")
    lines += ["", "## Confusion matrix", "", "| Expected \\ Actual | " + " | ".join(metrics["per_category"].keys()) + " |", "| --- | " + " | ".join("---:" for _ in metrics["per_category"]) + " |"]
    for expected, counts in metrics["confusion_matrix"].items():
        lines.append(f"| {expected} | " + " | ".join(str(counts.get(category, 0)) for category in metrics["per_category"]) + " |")
    lines += [
        "",
        "## Ten worst errors and what changed",
        "",
        "| # | Message | Expected | Actual | Analysis |",
        "| ---: | --- | --- | --- | --- |",
    ]
    for index, row in enumerate(metrics["worst_errors"], start=1):
        lines.append(f"| {index} | {row['message']} | {row['expected']} | {row['actual']} | {row['reason']} |")
    lines += ["", "### Fixes attempted during the build", ""]
    lines += [f"- {fix}" for fix in metrics["fixes_attempted"]]
    lines += [
        "",
        "## Limitations",
        "",
        "- The labels are synthetic and describe this prototype's intended behaviour, not clinical truth.",
        "- The rule set is deliberately small. Borderline clinical urgency and category-order conflicts remain visible in the error table.",
        "- Emergency recall is measured on messages labelled Emergency. A real deployment needs clinician-authored test cases, prospective monitoring and a clear escalation path.",
        "- Latency is a local Python benchmark, not a production service-level measurement.",
        "",
    ]
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enquiries", default=str(ROOT / "data" / "eval_enquiries.json"))
    parser.add_argument("--labels", default=str(ROOT / "data" / "eval_labels.json"))
    parser.add_argument("--json", default=str(ROOT / "docs" / "evaluation_metrics.json"))
    parser.add_argument("--report", default=str(ROOT / "docs" / "evaluation_report.md"))
    args = parser.parse_args()
    enquiries = json.loads(Path(args.enquiries).read_text(encoding="utf-8"))
    labels = json.loads(Path(args.labels).read_text(encoding="utf-8"))
    if {row["id"] for row in enquiries} != {row["id"] for row in labels}:
        raise SystemExit("Enquiry and label IDs do not match.")
    metrics = evaluate(enquiries, labels)
    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    write_report(metrics, args.report)
    print(f"Rows: {metrics['dataset']['rows']}")
    print(f"Exact accuracy: {metrics['accuracy']['exact_category_and_priority']:.1%}")
    print(f"Emergency recall: {metrics['emergency']['recall']:.1%}")
    print(f"False positives: {metrics['emergency']['false_positives']}")
    print(f"Wrote {args.json} and {args.report}")


if __name__ == "__main__":
    main()
