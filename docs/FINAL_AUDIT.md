# Final Audit

Independent audit of the repository state, first completed on 30 October 2026 and rechecked on 31 October 2026. Earlier clean-copy runs used a temporary checkout; the latest recheck ran on the working tree. Generated browser reports and screenshots are retained under `docs/`.

| Check | Result | Evidence |
|---|---|---|
| JavaScript syntax | PASS | `node --check` passed for all 21 `.js`/`.mjs` files. |
| JavaScript tests | PASS | Latest `npm test`: 28 passed, 0 failed. Includes config-driven helplines, invalid-port handling, permission, acknowledgement, API-enforced exact emergency template, XSS-like input, cross-origin rejection, protected runtime paths, booking, duplicate, search, scroll, export approval joins and service-worker cache isolation cases. |
| Python tests | PASS | Latest `python -m unittest discover -s tests -v`: 27 passed; `python -m pytest -q`: 27 passed and 12 subtests. |
| Evaluation | PASS | 1,500 synthetic rows; exact category+priority 91.87% (bootstrap 95% CI 90.4–93.2%); category accuracy 95.60%; priority accuracy 92.93%. |
| Emergency safety gate | PASS | 232/232 labelled emergency rows detected; recall 100%; 50 accepted false positives. |
| Dataset reproducibility | PASS | Seed 20261030 hashes: enquiries `50da75f7ea17801520afce25d056e309c8e60568c482cd3540fcfc2f12fd5ca6`; labels `1820bf1e23423be90be87d55589f82977cc932c6e621b590f4cbd807a362c86d`. Automated same-seed and different-seed checks pass. |
| Browser flows (current checkout) | PASS | Fresh headless Chrome runs on `file://`, static root, static subpath and local server. Same-view scroll stayed at 450px; clicking the message composer preserved 706px; Inbox produced all eight decision stages; all seven Trust Center checks passed; the inline staff-name flow recorded an acknowledgement and approval; no console errors or page exceptions. Static modes made 0 API and 0 external requests; server mode made 25 same-origin API requests. |
| Live GitHub Pages deployment | PASS | Added `.github/workflows/pages.yml`; GitHub Actions deployed commit `f63c459` successfully. The live browser check now keeps same-view scroll at 450px and composer focus at 706px. All seven Trust Center checks pass; 0 API requests, 0 unexpected external requests, 0 console errors and 0 page exceptions. |
| Static network boundary | PASS | All three static browser reports show 0 API requests and 0 external requests. Server report shows same-origin API use. |
| Trust Center and accessibility smoke | PASS | Each browser mode ran all 7 Trust Center checks successfully; no console errors or page exceptions. Keyboard skip-link, command palette and reduced-motion smoke checks passed. |
| Security/document scan | PASS | Tests cover input handling, same-origin API checks, JSON-only writes, protected runtime files, permissions, text-node rendering (no UI HTML sinks), headers and safe paths; repository scan found no machine-local path or obvious secret pattern in shipped text. |
| Asset size | PASS | No repository file exceeds 5 MB; largest retained screenshots are under 0.5 MB. |
| GitHub CI and Pages deploy | PASS | The verification workflow passed on the restored prompt-log commit. The Pages deploy workflow passed on `f63c459` and published the tested live build. |
| Owner submission tasks | PENDING | GitHub publishing, incognito checks, video, prompt records/reflections and email are owner actions. |

### Follow-up after owner video review

The recording showed the page moving to the top while Inbox was already selected. Global smooth scrolling was applied to browser focus movement; it is now automatic, while deliberate animations remain explicit. Navigation preserves scroll when the active view is selected again; pointer focus restores its pre-click position if the browser shifts it; initial setup does not force a scroll. The browser harness checks same-view navigation and a real pointer click. A rerun timed out waiting for Chrome DevTools `Runtime.enable`, so these browser assertions could not be observed here. The earlier four-mode reports predate this follow-up. Review after the push also found the service worker serving cache-first JS/CSS after deployment. Cache v3 checks for fresh same-origin assets, reads offline fallbacks only from its own cache, and deletes only this app's namespaced caches plus its specifically named legacy cache; caches belonging to other projects on the same origin are preserved.

Evaluation regenerates `docs/evaluation_metrics.js` alongside the JSON and Markdown report; a Python test checks bundle parity. Latest regression run: 21 JavaScript files syntax checked, `npm test` 28/28, unittest 27/27, pytest 27 passed plus 12 subtests. The latest measured Python evaluation latency is recorded in `docs/evaluation_metrics.json` and the generated report; it varies by machine and is not a service-level claim. Earlier browser reports are smoke checks, not a formal accessibility certification.

## Upgrade audit (2026-10-31)

A full read of the project source and delivery files found and fixed these real defects:

- **Server-mode emergency approval rejected the app's own template.** The Node API compared against a shortened hard-coded string, while `classifier.js` returns `rules.replies.emergency`, which includes the follow-up sentence. The server now uses `rules.replies.emergency`; the regression test rejects the shortened copy and accepts the exact configured template.
- **CSV and FHIR exports always reported "not approved".** Both read a nonexistent `event.approved` property on enquiry rows. CSV now joins `reply_approved` events by enquiry ID, and the FHIR call receives the joined boolean, so approval status survives export.
- **Staff names used blocking browser prompts.** Emergency acknowledgement and reply approval now use inline, labelled fields with `maxlength`, `aria-describedby`, inline `role="alert"` errors and input validation. No `window.prompt` remains.
- **Clearing local history left an approvable result on screen and deleted saved rules.** Clear now resets the result panel, pipeline state, tamper marker and queue, and leaves the separately saved Rules Lab override alone.
- **Rules Lab started from the authored rules after a reload.** It now starts from the active rules (including a saved override) and resets to that active baseline.
- **The brand link pointed at a nonexistent `#inbox` anchor.** It now targets `#view-inbox`, and the test checks every in-page anchor against the real IDs.
- **Switch controls had no accessible name.** Reduced motion and notifications now have explicit `aria-label` names.
- **The Dockerfile exposed a port the server did not bind.** `server.js` accepts `HOST` and the container sets `HOST=0.0.0.0`; loopback remains the default outside the container.
- **The queue silently truncated at 60 rows.** It now says how many matches are shown and points to CSV for the full history.
- **`WHATS_NEW.md` had a BOM, mojibake, a pre-title section and a stale "12 things" heading.** It is clean UTF-8, starts with the H1, and lists 14 items with current numbers.
- **Documentation named the wrong headless browser.** Shipped verification text now says Chrome, matching `tools/browser_check.mjs`. Historical build log entries were left as history.


## Incremental audit (2026-10-30)

Added regressions for occupied-port startup, malformed/oversized API bodies, corrupt event-history handling, service-worker asset existence and local-document links. Commit `1babb27` accidentally deleted `PROMPTS.md`; this follow-up restores its exact prior Git contents without adding or inventing prompt text, and reconnects the app and documentation to the restored file. CI runs pytest as well as unittest.

The initial browser harness attempts failed before page navigation because the sandbox blocked the browser's GPU process and closed DevTools sockets. Running the browser outside the sandbox succeeded. The current checkout and live Pages site now pass the real pointer/focus scroll test. The live deployment initially remained at `bf29c33`; the new Pages workflow publishes on every push to `main` and deployed `f63c459` successfully.

The command palette now searches the existing local enquiry history and reopens a selected record in Inbox. Matching is limited to masked message text and basic routing fields, capped at five results, and rendered with `textContent`; a regression test covers emergency records, result limits, empty queries and script-like text.
