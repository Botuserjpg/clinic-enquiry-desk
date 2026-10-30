"""Python reader and implementation for the shared rules.json file."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_rules(path=ROOT / "rules.json"):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def classify(message, rules=None):
    rules = rules or load_rules()
    normalized = str(message or "").lower()
    red_flags = [phrase for phrase in rules["redFlags"] if phrase in normalized]
    match = next(
        (category for category in rules["categories"]
         if any(term in normalized for term in category["terms"])),
        None,
    )

    # Emergencies override both category selection and routine urgency words.
    category = "Emergency" if red_flags else (match["name"] if match else "General enquiry")
    if red_flags:
        priority = rules["priorities"]["emergency"]
    elif any(word in normalized for word in rules["promptReviewWords"]):
        priority = rules["priorities"]["promptReview"]
    else:
        priority = rules["priorities"]["routine"]
    return {"category": category, "priority": priority, "redFlags": red_flags}


def route(result, rules=None):
    """Return the fictional role assignment and service-level target."""
    rules = rules or load_rules()
    assignee = rules.get("routing", {}).get(result["category"], "Receptionist")
    configured = rules.get("serviceLevels", {}).get(result["priority"])
    sla_minutes = 0 if result.get("category") == "Emergency" else (configured if isinstance(configured, int) else 480)
    return {"assignee": assignee, "slaMinutes": sla_minutes}


def mask_sensitive(text):
    """Mask common structured identifiers before display or local storage."""
    value = str(text or "")
    value = re.sub(r"\b\d{4}\s?\d{5}\s?\d{1}\b", "[medicare redacted]", value)
    value = re.sub(r"\b\d{10}\b", "[medicare redacted]", value)
    value = re.sub(r"\b(?:\+?61[\s-]?|0)(?:\d[\s-]?){8,9}\b", "[phone redacted]", value)
    value = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email redacted]", value, flags=re.IGNORECASE)
    value = re.sub(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", "[date redacted]", value)
    return value
