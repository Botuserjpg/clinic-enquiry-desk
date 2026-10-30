# Final Audit

Independent final audit of the repository state on 30 October 2026. The clean-copy runs used a temporary checkout; generated browser reports and screenshots are retained under `docs/`.

| Check | Result | Evidence |
|---|---|---|
| JavaScript syntax | PASS | `node --check` passed for all 21 `.js`/`.mjs` files. |
| JavaScript tests | PASS | Latest `npm test`: 26 passed, 0 failed. Includes config-driven helplines, invalid-port handling, permission, acknowledgement, API-enforced fixed emergency wording, XSS-like input, cross-origin rejection, protected runtime paths, booking, duplicate, search, scroll and service-worker cache isolation cases. |
| Python tests | PASS | Latest `python -m unittest discover -s tests -v`: 23 passed; `python -m pytest -q`: 23 passed and 12 subtests. |
| Evaluation | PASS | 1,500 synthetic rows; exact category+priority 91.87% (bootstrap 95% CI 90.4–93.2%); category accuracy 95.60%; priority accuracy 92.93%. |
| Emergency safety gate | PASS | 232/232 labelled emergency rows detected; recall 100%; 50 accepted false positives. |
| Dataset reproducibility | PASS | Seed 20261030 hashes: enquiries `50da75f7ea17801520afce25d056e309c8e60568c482cd3540fcfc2f12fd5ca6`; labels `1820bf1e23423be90be87d55589f82977cc932c6e621b590f4cbd807a362c86d`. Automated same-seed and different-seed checks pass. |
| Browser flows | PASS | Fresh-copy Edge pass for file, root static, subpath static and server modes. Reports: `docs/browser_check_final_file.json`, `docs/browser_check_final_root.json`, `docs/browser_check_final_subpath.json`, `docs/browser_check_final_server.json`. |
| Static network boundary | PASS | All three static browser reports show 0 API requests and 0 external requests. Server report shows same-origin API use. |
| Trust Center and accessibility smoke | PASS | Each browser mode ran all 7 Trust Center checks successfully; no console errors or page exceptions. Keyboard skip-link, command palette and reduced-motion smoke checks passed. |
| Security/document scan | PASS | Tests cover input handling, same-origin API checks, JSON-only writes, protected runtime files, permissions, text-node rendering (no UI HTML sinks), headers and safe paths; repository scan found no machine-local path or obvious secret pattern in shipped text. |
| Asset size | PASS | No repository file exceeds 5 MB; largest retained screenshots are under 0.5 MB. |
| GitHub CI | NOT RUN | Workflow is committed to the repository tree but cannot be observed until pushed to GitHub. |
| Owner submission tasks | PENDING | GitHub publishing, incognito checks, video, prompt records/reflections and email are owner actions. |

### Follow-up after owner video review

The recording showed the page moving to the top while Inbox was already selected. Global smooth scrolling was applied to browser focus movement; it is now automatic, while deliberate animations remain explicit. Navigation preserves scroll when the active view is selected again; pointer focus restores its pre-click position if the browser shifts it; initial setup does not force a scroll. The browser harness checks same-view navigation and a real pointer click. A rerun timed out waiting for Chrome DevTools `Runtime.enable`, so these browser assertions could not be observed here. The earlier four-mode reports predate this follow-up. Review after the push also found the service worker serving cache-first JS/CSS after deployment. Cache v3 checks for fresh same-origin assets, reads offline fallbacks only from its own cache, and deletes only this app's namespaced caches plus its specifically named legacy cache; caches belonging to other projects on the same origin are preserved.

Evaluation regenerates `docs/evaluation_metrics.js` alongside the JSON and Markdown report; a Python test checks bundle parity. Latest regression run: 21 JavaScript files syntax checked, `npm test` 26/26, unittest 23/23, pytest 23 passed plus 12 subtests. The latest measured Python evaluation latency is **51.2 ms** total for 1,500 rows (**0.0341 ms per message**); it varies by machine and is not a service-level claim. Earlier browser reports are smoke checks, not a formal accessibility certification.

## Incremental audit (2026-10-30)

Added regressions for occupied-port startup, malformed/oversized API bodies, corrupt event-history handling, service-worker asset existence and local-document links. The project’s README, prompt lab and Prompt Lab summary no longer link to the owner-deleted `PROMPTS.md`; the owner’s prompt log remains un-restored and must come from their own records. CI now runs pytest as well as unittest. Latest run after these updates: see the Final round entry in `BUILD_LOG.md` for verified command results.

The latest attempt to re-run the headless browser harness with Chrome and Edge failed before page navigation: both DevTools WebSocket sessions closed with code 1006 at `Runtime.enable`. The harness now reports this connection state. Automated source tests pass, but they do not prove that clicking the Inbox message box preserves scroll in a live browser; that browser interaction remains unverified in this environment.

The command palette now searches the existing local enquiry history and reopens a selected record in Inbox. Matching is limited to masked message text and basic routing fields, capped at five results, and rendered with `textContent`; a regression test covers emergency records, result limits, empty queries and script-like text.
