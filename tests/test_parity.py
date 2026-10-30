"""Run with python -m unittest discover -s tests -v (stdlib only)."""

import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from triage import classify, load_rules, mask_sensitive, route  # noqa: E402


class SharedRulesParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.enquiries = json.loads((ROOT / "data/enquiries.json").read_text(encoding="utf-8"))
        cls.labels = {row["id"]: row for row in json.loads((ROOT / "data/labels.json").read_text(encoding="utf-8"))}
        cls.rules = load_rules()

    def test_javascript_and_python_match_every_synthetic_row(self):
        messages = [row["message"] for row in self.enquiries]
        run = subprocess.run(
            ["node", "classifier.js"], cwd=ROOT, input=json.dumps(messages),
            text=True, capture_output=True, check=True,
        )
        javascript = json.loads(run.stdout)
        self.assertEqual(len(javascript), len(self.enquiries))
        for enquiry, js_result in zip(self.enquiries, javascript):
            py_result = classify(enquiry["message"], self.rules)
            self.assertEqual(
                {key: js_result[key] for key in ("category", "priority", "redFlags")},
                py_result,
                msg=enquiry["id"],
            )

    def test_separate_synthetic_labels_match_python_rules(self):
        for enquiry in self.enquiries:
            with self.subTest(id=enquiry["id"]):
                expected = self.labels[enquiry["id"]]
                actual = classify(enquiry["message"], self.rules)
                self.assertEqual(
                    {key: actual[key] for key in ("category", "priority", "redFlags")},
                    {key: expected[key] for key in ("category", "priority", "redFlags")},
                )

    def test_emergency_overrides_appointment_and_urgency(self):
        result = classify("Urgent appointment today: I cannot breathe.", self.rules)
        self.assertEqual(result["category"], "Emergency")
        self.assertEqual(result["priority"], self.rules["priorities"]["emergency"])
        self.assertEqual(result["redFlags"], ["cannot breathe"])

    def test_emergency_recall_is_100_percent(self):
        emergency_rows = [row for row in self.enquiries if self.labels[row["id"]]["category"] == "Emergency"]
        self.assertTrue(emergency_rows, "fixture must contain emergency-labelled rows")
        recalled = [row for row in emergency_rows if classify(row["message"], self.rules)["category"] == "Emergency"]
        self.assertEqual(len(recalled), len(emergency_rows))
        self.assertEqual(len(recalled) / len(emergency_rows), 1.0)

    def test_labels_cover_every_enquiry_and_no_extras(self):
        self.assertEqual(set(self.labels), {row["id"] for row in self.enquiries})

    def test_routing_and_service_levels(self):
        appointment = classify("Could I book an appointment next week?", self.rules)
        self.assertEqual(route(appointment, self.rules), {"assignee": "Receptionist", "slaMinutes": 480})
        refill = classify("Please call me today about a repeat prescription.", self.rules)
        self.assertEqual(route(refill, self.rules), {"assignee": "GP", "slaMinutes": 60})
        results = classify("Could someone call about my blood test results?", self.rules)
        self.assertEqual(route(results, self.rules), {"assignee": "Practice Nurse", "slaMinutes": 480})
        emergency = classify("I cannot breathe.", self.rules)
        self.assertEqual(route(emergency, self.rules), {"assignee": "Practice Nurse", "slaMinutes": 0})

    def test_masking_removes_structured_identifiers(self):
        text = "Call 0412 345 678, email person@example.com, Medicare 1234 56789 0, date 01/02/2026."
        masked = mask_sensitive(text)
        for secret in ("0412 345 678", "person@example.com", "1234 56789 0", "01/02/2026"):
            self.assertNotIn(secret, masked)
        self.assertIn("[phone redacted]", masked)
        self.assertIn("[email redacted]", masked)
        self.assertIn("[medicare redacted]", masked)
        self.assertIn("[date redacted]", masked)
        self.assertIn("000", mask_sensitive("Please call 000 now."))


class AssetConsistencyTests(unittest.TestCase):
    def test_browser_rules_bundle_matches_rules_json(self):
        source = json.loads((ROOT / "rules.json").read_text(encoding="utf-8"))
        text = (ROOT / "rules.js").read_text(encoding="utf-8")
        match = re.search(r"=\s*(\{.*\});\s*$", text, re.S)
        self.assertIsNotNone(match)
        self.assertEqual(json.loads(match.group(1)), source)

    def test_browser_config_bundle_matches_clinic_json(self):
        source = json.loads((ROOT / "config/clinic.json").read_text(encoding="utf-8"))
        text = (ROOT / "config/clinic.js").read_text(encoding="utf-8")
        match = re.search(r"=\s*(\{.*\});\s*$", text, re.S)
        self.assertIsNotNone(match)
        self.assertEqual(json.loads(match.group(1)), source)

    def test_index_uses_relative_assets_for_static_hosting(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        for asset in ("styles.css", "rules.js", "config/clinic.js", "classifier.js", "app.js"):
            self.assertIn(asset, html)
        self.assertNotIn('href="/', html)
        self.assertNotIn('src="/', html)

    def test_static_hosting_markers_exist(self):
        self.assertTrue((ROOT / ".nojekyll").exists())
        self.assertTrue((ROOT / "index.html").exists())

    def test_generator_writes_messages_without_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "generated.json"
            subprocess.run(
                [sys.executable, "tools/generate_enquiries.py", "--count", "3", "--output", str(output)],
                cwd=ROOT, check=True, capture_output=True, text=True,
            )
            rows = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(len(rows), 3)
            self.assertEqual(set(rows[0]), {"id", "message"})


if __name__ == "__main__":
    unittest.main()
