"""Max-upgrade checks: evaluation reproducibility, docs, assets and safety config."""

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from triage import classify, load_rules  # noqa: E402


def digest(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


class EvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.enquiries = json.loads((ROOT / "data/eval_enquiries.json").read_text(encoding="utf-8"))
        cls.labels = json.loads((ROOT / "data/eval_labels.json").read_text(encoding="utf-8"))
        cls.metrics = json.loads((ROOT / "docs/evaluation_metrics.json").read_text(encoding="utf-8"))
        cls.rules = load_rules()

    def test_dataset_is_1500_rows_with_separate_labels(self):
        self.assertEqual(len(self.enquiries), 1500)
        self.assertEqual(len(self.labels), 1500)
        self.assertEqual(set(self.enquiries[0]), {"id", "message"})
        self.assertEqual({row["id"] for row in self.enquiries}, {row["id"] for row in self.labels})
        self.assertEqual(self.metrics["dataset"]["rows"], 1500)
        self.assertEqual(self.metrics["dataset"]["seed"], 20261030)
        self.assertEqual(self.metrics["dataset"]["sha256_enquiries"], digest(self.enquiries))
        self.assertEqual(self.metrics["dataset"]["sha256_labels"], digest(self.labels))

    def test_browser_rules_lab_bundle_keeps_messages_and_labels_separate(self):
        source = (ROOT / "data/evaluation_fixtures.js").read_text(encoding="utf-8")
        match = re.fullmatch(r"window\.CLINIC_EVALUATION_FIXTURES = (.*);\s*", source, re.DOTALL)
        self.assertIsNotNone(match)
        bundle = json.loads(match.group(1))
        self.assertEqual(len(bundle["enquiries"]), 1500)
        self.assertEqual(len(bundle["labels"]), 1500)
        self.assertNotIn("category", bundle["enquiries"][0])
        self.assertNotIn("message", bundle["labels"][0])

    def test_browser_evaluation_metrics_match_the_json_report(self):
        source = (ROOT / "docs/evaluation_metrics.js").read_text(encoding="utf-8")
        match = re.fullmatch(r"window\.CLINIC_EVAL_METRICS = (.*);\s*", source, re.DOTALL)
        self.assertIsNotNone(match)
        self.assertEqual(json.loads(match.group(1)), self.metrics)

    def test_emergency_recall_is_100_percent_on_the_evaluation_set(self):
        expected = [row for row in self.labels if row["category"] == "Emergency"]
        recalled = []
        for label in expected:
            enquiry = next(row for row in self.enquiries if row["id"] == label["id"])
            if classify(enquiry["message"], self.rules)["emergency"]:
                recalled.append(label)
        self.assertEqual(len(expected), self.metrics["emergency"]["expected"])
        self.assertEqual(len(recalled), len(expected))
        self.assertEqual(self.metrics["emergency"]["recall"], 1.0)

    def test_bootstrap_and_error_analysis_are_present(self):
        accuracy = self.metrics["accuracy"]
        low = accuracy["bootstrap_95_ci"]["low"]
        high = accuracy["bootstrap_95_ci"]["high"]
        self.assertLessEqual(low, accuracy["exact_category_and_priority"])
        self.assertGreaterEqual(high, accuracy["exact_category_and_priority"])
        self.assertEqual(accuracy["bootstrap_95_ci"]["rounds"], 2000)
        self.assertEqual(len(self.metrics["worst_errors"]), 10)
        messages = [row["message"] for row in self.metrics["worst_errors"]]
        self.assertEqual(len(messages), len(set(messages)))
        self.assertTrue(self.metrics["fixes_attempted"])

    def test_per_category_and_per_group_results_cover_the_dataset(self):
        for category, values in self.metrics["per_category"].items():
            self.assertGreater(values["expected"], 0, category)
            self.assertIsNotNone(values["precision"], category)
            self.assertIsNotNone(values["recall"], category)
        self.assertIn("emergency", self.metrics["per_group"])
        self.assertIn("negated", self.metrics["per_group"])
        self.assertIn("lookalike", self.metrics["per_group"])
        self.assertIn("injection", self.metrics["per_group"])
        self.assertIn("multilingual", self.metrics["per_group"])
        self.assertIn("borderline", self.metrics["per_group"])

    def test_dataset_generation_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "enquiries.json"
            labels = Path(directory) / "labels.json"
            subprocess.run(
                [
                    sys.executable,
                    "tools/generate_dataset.py",
                    "--output",
                    str(output),
                    "--labels",
                    str(labels),
                    "--seed",
                    "20261030",
                ],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            generated = json.loads(output.read_text(encoding="utf-8"))
            generated_labels = json.loads(labels.read_text(encoding="utf-8"))
            self.assertEqual(digest(generated), digest(self.enquiries))
            self.assertEqual(digest(generated_labels), digest(self.labels))
            other_output = Path(directory) / "other_enquiries.json"
            other_labels = Path(directory) / "other_labels.json"
            subprocess.run(
                [
                    sys.executable,
                    "tools/generate_dataset.py",
                    "--output",
                    str(other_output),
                    "--labels",
                    str(other_labels),
                    "--seed",
                    "42",
                ],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(digest(json.loads(other_output.read_text(encoding="utf-8"))), digest(generated))
            self.assertNotEqual(digest(json.loads(other_labels.read_text(encoding="utf-8"))), digest(generated_labels))


class AssetAndDocumentationTests(unittest.TestCase):
    def test_static_shell_has_no_root_absolute_or_external_assets(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        for asset in (
            "upgrade.css",
            "views.js",
            "ruleslab.js",
            "safety-net.js",
            "knowledge.js",
            "extras.js",
            "data/fixtures.js",
            "docs/evaluation_metrics.js",
        ):
            self.assertIn(asset, html)
        self.assertNotIn('href="/', html)
        self.assertNotIn('src="/', html)
        self.assertIsNone(re.search(r'<(?:script|link|img)[^>]+(?:src|href)="https?:', html))
        self.assertNotIn("/api/", html)

    def test_required_docs_and_delivery_files_exist(self):
        for relative in (
            "README.md",
            "WHATS_NEW.md",
            "BUILD_LOG.md",
            "docs/architecture.md",
            "docs/safety_hazard_log.md",
            "docs/assumptions.md",
            "docs/evaluation_report.md",
            ".github/workflows/ci.yml",
            "Dockerfile",
            ".gitignore",
        ):
            self.assertTrue((ROOT / relative).exists(), relative)

    def test_helplines_carry_verify_before_real_use(self):
        config = json.loads((ROOT / "config/clinic.json").read_text(encoding="utf-8"))
        self.assertTrue(config["helplines"])
        for line in config["helplines"]:
            self.assertIn("verify before real use", line["comment"].lower())
        self.assertIn("verify before real use", config["interpreterService"]["comment"].lower())
        self.assertIn("verify before real use", config["appointments"]["comment"].lower())

    def test_no_local_paths_or_obvious_secrets_in_shipped_text(self):
        for relative in ("README.md", "WHATS_NEW.md", "index.html", "app.js", "docs/architecture.md"):
            text = (ROOT / relative).read_text(encoding="utf-8")
            self.assertNotIn("C:\\Users\\", text, relative)
            self.assertIsNone(re.search(r"\bsk-[A-Za-z0-9]{20,}", text), relative)
            self.assertIsNone(re.search(r"api[_-]?key\s*[:=]\s*['\"][A-Za-z0-9]{16,}", text, re.IGNORECASE), relative)

    def test_whats_new_is_clean_utf8_with_one_top_level_heading(self):
        text = (ROOT / "WHATS_NEW.md").read_text(encoding="utf-8")
        self.assertFalse(text.startswith("\ufeff"), "WHATS_NEW.md has no leading BOM")
        self.assertEqual(text.count("\ufeff"), 0)
        self.assertEqual(text.count("\ufffd"), 0)
        for corrupted in ("â€™", "â€“", "â€”", "â€œ", "â€\x9d", "â†’", "â€¦", "Â·", "Ã©"):
            self.assertNotIn(corrupted, text)
        first_line = text.lstrip().splitlines()[0]
        self.assertEqual(first_line, "# What's new in Clinic Mission Control")
        self.assertIn("## The 14 things to look at first", text)
        self.assertNotIn("The 12 things", text)
        self.assertIn("48.27 ms", text)
        self.assertIn("42.98", text)

    def test_brand_link_and_switch_controls_have_valid_accessibility_targets(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        ids = set(re.findall(r'\bid="([^"]+)"', html))
        self.assertIn("view-inbox", ids)
        self.assertIn('class="brand sidebar-brand" href="#view-inbox"', html)
        self.assertNotIn('class="brand sidebar-brand" href="#inbox"', html)
        for anchor in re.findall(r'<a\b[^>]*href="#([^"]+)"', html):
            self.assertIn(anchor, ids, f"anchor target #{anchor} exists")
        self.assertIn('id="reduced-motion-toggle" type="checkbox" aria-label="Reduce motion"', html)
        self.assertIn('id="notifications-toggle" type="checkbox" aria-label="Browser notifications"', html)
        for match in re.finditer(r'<label\b([^>]*)>', html):
            if 'for=' not in match.group(1):
                following = html[match.end():match.end() + 240]
                self.assertRegex(following, r'aria-label="[^"]+"', "wrapped switch controls have an accessible name")

    def test_docker_and_browser_documentation_match_the_current_runtime(self):
        dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn("ENV HOST=0.0.0.0", dockerfile)
        self.assertIn("EXPOSE 3000", dockerfile)
        server = (ROOT / "server.js").read_text(encoding="utf-8")
        self.assertIn("process.env.HOST", server)
        self.assertIn("server.listen(port, host", server)
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("headless Chrome", readme)
        self.assertNotIn("headless Edge", readme)
        submission = (ROOT / "SUBMISSION_EMAIL.md").read_text(encoding="utf-8")
        self.assertNotIn("headless Edge", submission)

    def test_queue_and_rules_lab_source_reflect_visible_behaviour(self):
        views = (ROOT / "views.js").read_text(encoding="utf-8")
        self.assertIn("Showing the 60 most recent", views)
        self.assertIn("filtered.length > 60", views)
        ruleslab = (ROOT / "ruleslab.js").read_text(encoding="utf-8")
        self.assertIn("window.ClinicDesk.rules", ruleslab, "Rules Lab starts from the active rules")


if __name__ == "__main__":
    unittest.main()
