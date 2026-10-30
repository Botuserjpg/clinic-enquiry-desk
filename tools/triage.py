"""Python reader and implementation for the shared rules.json file."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_rules(path=ROOT / "rules.json"):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def tone_of(raw, normalized, rules):
    tone_rules = rules.get("tone", {})
    words = tone_rules.get("words", [])
    distinct = sum(1 for word in words if word in normalized)
    exclamations = min(3, normalized.count("!"))
    letters = len(re.sub(r"[^A-Za-z]", "", raw))
    upper = len(re.sub(r"[^A-Z]", "", raw))
    shouting = 1 if letters >= 20 and upper / letters > 0.6 else 0
    score = distinct + exclamations + shouting
    angry_at = tone_rules.get("angryAt", 3)
    frustrated_at = tone_rules.get("frustratedAt", 1)
    label = "angry" if score >= angry_at else ("frustrated" if score >= frustrated_at else "calm")
    return {"score": score, "label": label}


def language_of(normalized, rules):
    for entry in rules.get("languages", []):
        if any(str(greeting).lower() in normalized for greeting in entry["greetings"]):
            return {"language": entry["name"], "interpreterSuggested": True}
    return {"language": None, "interpreterSuggested": False}


def negation_of(normalized, red_flags):
    negated = []
    for phrase in red_flags:
        pattern = r"(?:^|\b)(?:no|not|without|denies|denied)\s+(?:\w+\s+){0,2}?" + re.escape(phrase)
        if re.search(pattern, normalized):
            negated.append(phrase)
    return negated


def classify(message, rules=None):
    rules = rules or load_rules()
    raw = str(message or "")
    normalized = raw.lower()
    red_flags = [phrase for phrase in rules["redFlags"] if phrase in normalized]
    category_match = next(
        ((category, term) for category in rules["categories"]
         for term in category["terms"] if term in normalized),
        None,
    )
    match = category_match[0] if category_match else None
    matched_prompt_word = next((word for word in rules["promptReviewWords"] if word in normalized), None)
    tone = tone_of(raw, normalized, rules)
    language = language_of(normalized, rules)
    injection_phrases = [phrase for phrase in rules.get("injectionPhrases", []) if phrase in normalized]
    negated_red_flags = negation_of(normalized, red_flags)

    # Emergencies override category, priority, tone and every other rule.
    category = "Emergency" if red_flags else (match["name"] if match else "General enquiry")
    if red_flags:
        priority = rules["priorities"]["emergency"]
    elif matched_prompt_word or category == "Complaint / feedback":
        priority = rules["priorities"]["promptReview"]
    else:
        priority = rules["priorities"]["routine"]
    if red_flags:
        reply = rules["replies"]["emergency"]
    elif category == "Complaint / feedback":
        reply = rules["replies"]["complaint"]
    else:
        reply = rules["replies"]["routine"]
    return {
        "category": category,
        "priority": priority,
        "redFlags": red_flags,
        "emergency": bool(red_flags),
        "reply": reply,
        "evidence": {
            "matchedCategoryTerm": category_match[1] if category_match else None,
            "matchedPromptWord": matched_prompt_word,
            "redFlagPhrases": red_flags,
            "ruleOrder": "red-flag override" if red_flags else ("category match" if category_match else "default category"),
            "negatedRedFlags": negated_red_flags,
            "toneScore": tone["score"],
            "toneLabel": tone["label"],
            "language": language["language"],
            "interpreterSuggested": language["interpreterSuggested"],
            "injectionPhrases": injection_phrases,
            "injectionDetected": bool(injection_phrases),
        },
    }


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
