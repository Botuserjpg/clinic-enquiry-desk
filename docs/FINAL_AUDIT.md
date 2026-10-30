# Final Audit

Independent final audit of the repository state on 30 October 2026. The clean-copy runs used a temporary checkout; generated browser reports and screenshots are retained under `docs/`.

| Check | Result | Evidence |
|---|---|---|
| JavaScript syntax | PASS | `node --check` passed for all 21 `.js`/`.mjs` files. |
| JavaScript tests | PASS | Latest `npm test`: 20 passed, 0 failed. Includes permission, acknowledgement, XSS-like input, booking, duplicate and scroll-regression cases. |
| Python tests | PASS | Latest `python -m unittest discover -s tests -v`: 23 passed; `python -m pytest -q`: 23 passed and 12 subtests. |
| Evaluation | PASS | 1,500 synthetic rows; exact category+priority 91.87% (bootstrap 95% CI 90.4–93.2%); category accuracy 95.60%; priority accuracy 92.93%. |
| Emergency safety gate | PASS | 232/232 labelled emergency rows detected; recall 100%; 50 accepted false positives. |
| Dataset reproducibility | PASS | Seed 20261030 hashes: enquiries `50da75f7ea17801520afce25d056e309c8e60568c482cd3540fcfc2f12fd5ca6`; labels `1820bf1e23423be90be87d55589f82977cc932c6e621b590f4cbd807a362c86d`. Automated same-seed and different-seed checks pass. |
| Browser flows | PASS | Fresh-copy Edge pass for file, root static, subpath static and server modes. Reports: `docs/browser_check_final_file.json`, `docs/browser_check_final_root.json`, `docs/browser_check_final_subpath.json`, `docs/browser_check_final_server.json`. |
| Static network boundary | PASS | All three static browser reports show 0 API requests and 0 external requests. Server report shows same-origin API use. |
| Trust Center and accessibility smoke | PASS | Each browser mode ran all 7 Trust Center checks successfully; no console errors or page exceptions. Keyboard skip-link, command palette and reduced-motion smoke checks passed. |
| Security/document scan | PASS | Tests cover input handling, permissions, escaping, headers and safe paths; repository scan found no machine-local path or obvious secret pattern in shipped text. |
| Asset size | PASS | No repository file exceeds 5 MB; largest retained screenshots are under 0.5 MB. |
| GitHub CI | NOT RUN | Workflow is committed to the repository tree but cannot be observed until pushed to GitHub. |
| Owner submission tasks | PENDING | GitHub publishing, incognito checks, video, prompt records/reflections and email are owner actions. |

### Follow-up after owner video review

The recording showed the page moving to the top while Inbox was already selected. Navigation now preserves scroll when the active view is selected again, and initial view setup does not force a scroll. The browser harness now checks this regression. A rerun of the headless harness in this session timed out waiting for Chrome DevTools `Runtime.enable`, so this new browser assertion is present but could not be observed here. The earlier four-mode reports above predate this follow-up.

Evaluation now regenerates `docs/evaluation_metrics.js` alongside the JSON and Markdown report; a Python test checks bundle parity. Latest regression run: 21 JavaScript files syntax checked, `npm test` 20/20, unittest 23/23, pytest 23 passed plus 12 subtests. Latest measured Python evaluation latency was 53.23 ms total for 1,500 rows (0.0355 ms per row); it varies by machine and is not a service-level claim. Browser reports are smoke checks, not a formal accessibility certification.
