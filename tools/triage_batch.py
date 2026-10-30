"""Triage a JSON list of synthetic messages with the shared rules."""

import argparse
import json
import sys
from pathlib import Path

from triage import classify, load_rules, route


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", help="JSON file with {id, message} rows; defaults to stdin")
    parser.add_argument("--rules", default=str(Path(__file__).resolve().parents[1] / "rules.json"))
    args = parser.parse_args()
    rows = json.loads(Path(args.input).read_text(encoding="utf-8") if args.input else sys.stdin.read())
    rules = load_rules(args.rules)
    output = []
    for row in rows:
        result = classify(row["message"], rules)
        output.append({"id": row.get("id"), **result, **route(result, rules)})
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
