"""Write deterministic fictional enquiries without embedding their labels."""

import argparse
import json
from pathlib import Path

MESSAGES = [
    "Could I book an appointment next week?",
    "Please call me today about a repeat prescription.",
    "Could someone explain how I pay this invoice?",
    "I would like to reschedule my appointment soon.",
    "Can a staff member call about my blood test results?",
    "I have chest pain and feel short of breath.",
    "Can I cancel my appointment?",
    "My medication repeat is due for review.",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="data/generated_enquiries.json")
    parser.add_argument("--count", type=int, default=len(MESSAGES))
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be at least 1")
    rows = [{"id": f"GENERATED-{index + 1:03d}", "message": MESSAGES[index % len(MESSAGES)]}
            for index in range(args.count)]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} fictional enquiries to {output} (labels are stored separately).")


if __name__ == "__main__":
    main()
