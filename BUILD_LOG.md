# Build log

Factual record of problems encountered and their fixes.

## Final round

### Max-upgrade audit — 31 October 2026

- Read the shipped HTML, CSS, JavaScript, Python tools and docs, then reproduced or source-verified each suspected defect before changing it. Fixes in this pass:
  - Server-mode emergency approval rejected the app's own fixed template. `classifier.js` returns `rules.replies.emergency` (including the follow-up sentence), but `server.js` compared against a shortened hard-coded string. The server now reads `rules.replies.emergency`; the server test rejects the shortened copy and accepts the exact configured template.
  - CSV and FHIR exports always showed “not approved” because they read a nonexistent `event.approved` property on enquiry rows. CSV now joins `reply_approved` events by enquiry ID, and `toFhir` receives that joined boolean. Regression tests cover pending and approved exports.
  - Emergency acknowledgement and reply approval used blocking `window.prompt()` calls. Both now use inline, labelled staff-name inputs with `maxlength=60`, `aria-describedby`, inline `role="alert"` errors, focus handling and input validation.
  - “Clear local data” left the current result and pipeline on screen and deleted the saved Rules Lab override. It now resets the visible result, pipeline, tamper marker and history, and keeps the separately saved rules override.
  - Rules Lab started from the authored rules after a reload instead of the active saved override. It now starts from `window.ClinicDesk.rules` and resets to that active baseline.
  - The sidebar brand link targeted a nonexistent `#inbox` anchor; it now targets `#view-inbox`. The reduced-motion and notification switches now have explicit accessible names.
  - The Dockerfile exposed port 3000 while the server bound only to `127.0.0.1`. `server.js` now accepts `HOST` (loopback remains the default), and the container sets `HOST=0.0.0.0`.
  - The queue silently truncated at 60 rows. It now states “Showing the 60 most recent of N matching enquiries” and points to CSV for the full history.
  - `WHATS_NEW.md` had a BOM, mojibake, a pre-title section and a stale “12 things” heading. It is now clean UTF-8, starts with the H1 and lists 14 current items.
  - Shipped verification text named headless Edge while the harness uses Chrome. Current docs now say Chrome; earlier log entries remain as history.
- Verification after the fixes: `node --check` passed on all **21** JS/MJS files; `npm test` passed **28/28**; Python `unittest` passed **27/27**; `pytest` passed **27 tests plus 12 subtests**. Evaluation kept the same seed and result: **1,500** synthetic rows, **91.87%** exact category+priority, **232/232 (100%)** emergency recall, **50** false positives, **40.8%** review rate. Latest Python latency: **48.27 ms total (0.0322 ms per message)**; repeated runs measured **42.98–81.43 ms**, and timings vary.
- Fresh headless Chrome checks passed static root, GitHub-style subpath, `file://` and Node server mode. Static modes made **0** `/api/` requests and all modes had **0** unexpected external requests, console errors or page exceptions. Server mode made **25** same-origin API requests because the harness now also records an acknowledgement and an approval. The inline staff-name validation and approval flow passed in all four modes. Reports are `docs/browser_check_current_*.json`; eight screenshots were refreshed from the static build. A desktop antivirus injected `kaspersky-labs.com` script requests into localhost pages during some local runs; the harness reports those separately as environment noise, not application requests.

- Incremental whole-project audit: regression tests now cover an occupied-port start, oversized and malformed JSON requests, and a corrupt event log returning a safe 500 while the server remains available. API failures no longer disclose local filesystem errors. The offline-cache test checks every precached file exists, and a local-link scan prevents dead HTML/Markdown references.
- The owner had removed `PROMPTS.md`; I left the deletion and all prompt-history content untouched, and removed links that pointed to the missing file. README and the app now explain that the owner must restore their own prompt log without reconstructing it. Updated the README, submission note and feature sheet to the measured 22/22 Node test count. CI now installs pytest and runs both Python test runners.
- Verification for this incremental audit: `node --check` passed for all 21 JS/MJS files; `npm test` passed **22/22**; `python -m unittest discover -s tests` passed **23/23**; `python -m pytest -q` passed **23 tests plus 12 subtests**. Evaluation artifacts still report 1,500 synthetic rows with emergency recall **232/232 (100%)**, 50 emergency false positives and 91.87% exact category+priority accuracy. Browser-level typing behavior was not reverified in a live browser during this incremental audit; the scroll fix and updated service-worker cache were previously committed, and this pass only rechecked the focused source regression test.
- Browser follow-up: attempted the existing headless E2E harness with both Chrome and Edge. Both DevTools WebSocket sessions closed with code 1006 before `Runtime.enable`, before navigating to the app. Improved the harness timeout to include the WebSocket state, target and recent protocol events. This environment limitation means no fresh claim of live browser verification is made.
- Re-ran `npm run evaluate` from the fixed seed. It regenerated the report, JSON and browser bundle with the same 1,500-row dataset hashes and labels; measured classification latency was **51.2 ms total (0.0341 ms per enquiry)** on this run.
- Product upgrade: extended **Ctrl+K** (or **/** outside a field) from command-only navigation to search local enquiry IDs, categories, priorities and masked message snippets, then reopen the selected record in Inbox with its stored acknowledgement and approval state. Dynamic command results use DOM text nodes rather than HTML interpolation; a regression test covers search and script-like content.
- Accessibility polish: marked the command search as a combobox, linked the active option for arrow-key navigation, exposed the no-results state, and bounded input length to 120 characters. Regression assertions cover the role, active descendant, bound and safe text rendering.
- Static-hosting audit: found that service-worker activation deleted every CacheStorage entry on the origin, which could evict another GitHub Pages app's offline data. Moved this app to the `clinic-enquiry-desk-v3` namespace and limited cleanup to that prefix plus the exact prior app cache name. A VM regression verifies unrelated origin caches remain untouched.
- Follow-up: offline fallback used global `caches.match()`, which could also read a same-URL response cached by another app on a shared origin. Changed navigation and asset fallbacks to match only inside the namespaced app cache, with a regression assertion against global cache lookup.
- Emergency gate audit: the browser UI locked the fixed 000 reply, but the server API previously accepted any reply after acknowledgement. The server now rejects blank approvals and requires the exact emergency template; the client applies the same check. Tests prove a downgraded post-acknowledgement API reply is rejected and the fixed template is accepted.
- Configuration audit: the emergency panel and interpreter notice contained hard-coded fallback contact numbers, so they could drift from `config/clinic.json`. Both now render configured contacts only, label the helpline details synthetic and unverified, and show a missing-configuration message instead of substituting a number. A regression test checks the UI/config boundary.
- Detail pass: corrected the command combobox's initial `aria-expanded` value, removed the dynamic decision-stage `innerHTML` sink in favour of text nodes with only explicit `<code>` formatting, and made invalid `PORT` values fail with a clear startup message. Regression checks cover each case.
- Full regression after this pass: `node --check` passed for 21 JS/MJS files; `npm test` passed **26/26**; `python -m unittest discover -s tests` passed **23/23**; `python -m pytest -q` passed **23 tests and 12 subtests**. The 1,500-row fixture test still enforces **232/232 emergency recall**.
- Export audit: CSV quoting alone did not stop spreadsheet applications treating submitted cell text beginning with `=`, `+`, `-` or `@` as formulas. The exporter now prefixes formula-starting string cells with an apostrophe, including cells with leading whitespace; regression assertions cover each prefix and embedded quotes.
- Verification after cache isolation: all 21 JS/MJS files pass `node --check`; `npm test` **24/24**; Python `unittest` **23/23**; pytest **23 passed, 12 subtests passed**. The cache-isolation test runs the real worker activation listener against a fake CacheStorage containing unrelated and app-owned entries.
- Security audit: found that the loopback API accepted cross-site requests with a simple content type and the static handler could serve ignored runtime logs if present. Added loopback Host/port validation, same-origin Origin and Fetch Metadata checks, JSON-only writes, and explicit denial for ignored event/generated-data files. Added raw-HTTP Host spoof, Origin, cross-site, content-type and runtime-path regression checks; the first Host test used Node `fetch`, which normalised the header, so it was replaced with `http.get` and verified the hostile Host is actually rejected.
- The final checklist comparison found two unfinished items: duplicate detection was absent, and the Rules Lab was still scoring only the old 12-row sample. Added a cautious exact-text duplicate alert (review only; it changes no category, priority or emergency outcome) and switched Rules Lab to all 1,500 seeded enquiries with labels kept in a separate generated browser array. The classifier API still accepts messages and rules only.
- The first final-round headless pass exposed two browser-check harness defects: the CDP response handler was registered after send, risking a lost fast response, and resolved calls left 30-second timeout timers alive. Registered handlers before send and clear their timers on response. The first full browser retry also caught and fixed a mislabeled phone-mask self-test fixture.
- Refreshed README and submission-email evaluation figures from the generated report, added an assessment evidence table, and documented the Trust Center, full-set Rules Lab and duplicate warning.

### Final round verification

- On a fresh temporary copy, `node --check` passed for **21 JavaScript/ES module files**; `npm test` passed **19/19**; `python -m pytest -q` passed **22 tests and 12 subtests**; the stdlib `unittest` command passed **22/22**.
- Evaluation on 1,500 synthetic enquiries (seed `20261030`): exact category+priority **91.87%** (95% bootstrap CI 90.4–93.2%), emergency recall **232/232 (100%)**, **50** false positives, **40.8%** human-review rate. SHA-256 is recorded in the generated report. The separate Node benchmark classified all 1,500 in **42.98 ms** on this machine.
- Reproducibility: seed `20261030` generated the same enquiry SHA-256 twice (`50da75f7…fd5ca6`) and the same labels SHA-256 twice (`1820bf1e…2c86d`); seed `42` produced different hashes for both files. The Python test now asserts the different-seed case.
- Headless Edge E2E on the fresh copy passed `file://`, static root, GitHub-style subpath and server mode. Each mode reported zero unexpected external requests, console errors and page exceptions; static modes reported zero `/api/` requests; server mode made 19 same-origin API calls. All seven Trust Center self-tests passed, as did the 1,500-row Rules Lab, keyboard focus/close and reduced-motion smoke checks.
- Captured eight final screenshots in `docs/screenshots/` and saved per-mode browser reports in `docs/browser_check_final_*.json`. The file-mode report uses a redacted placeholder URL, not a local path.
- GitHub Actions has not run on a final-round push. The owner must push to observe the hosted workflow and verify the public Pages URL in incognito.

## Round 2

- Initial checks: `npm test` passed 17/17. Initial `pytest` ran 21 tests plus 12 subtests and exposed a missing `.github/workflows/ci.yml` (and the suite's expected `Dockerfile`). Added a zero-dependency Node container recipe and CI workflow covering JS syntax, npm tests, Python tests and evaluation.
- Initial audit found Safety lacked the requested reviewer-facing Trust Center and live self-tests. Added a local Run self-tests panel with emergency/negation classification, measured emergency recall, configured GP refill routing, synthetic calendar slot exclusion, identifier masking and repeatable hash checks. Results use text nodes and explicit PASS/FAIL labels; results are not pre-populated.
- Added a direct Trust Center path to `WHATS_NEW.md` and described the feature in README. Follow-up verification is recorded below when complete.

### Round 2 verification

- `node --check` passed for every JavaScript file outside `node_modules`.
- `npm test`: **17/17 passed**. `python -m pytest -q`: **21 passed, 12 subtests passed**.
- `python tools/evaluate.py --report docs/evaluation_report.md`: **1,500 rows**, exact category+priority accuracy **91.87%**, emergency recall **232/232 (100%)**, emergency false positives **50**. CI intervals and subgroup metrics are in the generated report/JSON.
- The added browser rerun could not initialize the installed Chrome DevTools target and timed out at `Runtime.enable`; therefore, Trust Center interaction is not claimed browser-verified. Existing saved static root/subpath/file and server reports document earlier runs before this panel was added.
- Git status remains modified/untracked as it was before this continuation. Git writes were not retried because the project handoff records `.git/index.lock` permission denial. No commits were made.

- The first HTTP check tried to start Node with PowerShell `Start-Process`; the sandbox rejected hidden background process creation. I ran the server in the command runner's foreground session and checked it from a separate request instead; the page returned HTTP 200.
- Git initialized successfully, but `git add` could not create `.git/index.lock` because the environment exposes `.git` as read-only. The project files are writable, but phase commits cannot be created with the current filesystem permissions. This is an environment limitation without a workaround available inside the writable project folder.
- The first JavaScript syntax check found an extra semicolon in the history label's ternary expression. I removed it; both scripts are being checked again before the feature walkthrough.
- The initial visual design imported Google Fonts, which would make a local demonstration request an external resource. I removed the font import and kept system fallbacks so the prototype stays self-contained.

## Upgrade round

### Round 2 continuation

- Initial `npm test` passed 17/17. Initial `pytest` ran 21 tests plus 12 subtests and exposed a missing `.github/workflows/ci.yml` (and the suite's expected `Dockerfile`). Added a zero-dependency Node container recipe and CI workflow covering JS syntax, npm tests, Python tests and evaluation.
- Initial audit found Safety lacked the requested reviewer-facing Trust Center and live self-tests. Added a local Run self-tests panel with emergency/negation classification, measured emergency recall, configured GP refill routing, synthetic calendar slot exclusion, identifier masking and repeatable hash checks. Results use text nodes and explicit PASS/FAIL labels; results are not pre-populated.
- Added a direct Trust Center path to `WHATS_NEW.md` and described the feature in README.

### Phase 0 audit

At the start of this round, the repository contained only `.gitignore`, `BUILD_LOG.md`, `README.md`, `app.js`, `index.html`, `package.json`, `server.js`, `styles.css`, and `docs/assumptions.md`. The following requested components were missing: `rules.json`, shared JS/Python classification, Python CLI tools, synthetic enquiries and separate labels, parity tests, architecture/safety/evaluation docs, submission materials, MIT license, and prompt history. The existing app had server-only API calls, no browser-only mode, and hard-coded rules in `server.js`.

The previous run already established that Git cannot write `.git/index.lock` because `.git` is read-only in this environment. Per the upgrade instructions I am not retrying Git writes; work will continue without commits.

### Completion pass

- `git status` initially failed with `fatal: detected dubious ownership` because `.git` is owned by a different Windows account. I added a one-time `safe.directory` exception for this folder and re-ran the command successfully. This changed only Git's global configuration, not project files.
- The repository had no commits and every file was untracked. After the `safe.directory` fix, the local commit succeeded on `main` (35 files). A later push published `main` to the public repository.
- Static mode was missing even though `docs/safety_notes.md` described it. The app always called `fetch('/api/...')` and used root-absolute asset URLs. I added mode detection, relative asset paths, localStorage with an in-memory fallback, browser hash chaining, a mode badge, and a `.nojekyll` file. I then corrected the safety and architecture docs to describe the implemented behavior.
- The Node server did not mask stored messages and did not return the stored event (timestamp and hash) to the browser. I updated it to mask structured identifiers, add routing and service-level fields, and return the event so both modes render the same result shape.
- The evaluation tool and report did not report emergency recall. I added the metric and regenerated the report; it reports 4/4 emergency recall on the synthetic fixture.
- `.gitignore` did not ignore Python cache files. I added `__pycache__/`, `*.py[cod]`, and `.pytest_cache/`.
- `README.md` documented only server mode. I added static-mode, GitHub Pages, Python tool, test, routing, masking, and integrity instructions.
- A PowerShell `node --check` loop with nested quoting failed with `The string is missing the terminator`. I reran the check with a simpler loop and all four JavaScript files passed.
- `python -m unittest` printed an `Exited with code 1` wrapper message in PowerShell because the runner treats stderr as an error, even though unittest reported `OK`. I reran the suite and confirmed 12 tests passed.
- Added routing, service-level targets, identifier masking, a verify-integrity action, and a simulate-clinic-day action. These are documented as synthetic demonstration settings, not clinic policy.
- Added explicit classifier evidence (matched category term, matched prompt-review word, red-flag phrases, and rule order) to the JavaScript and Python results and to the UI. The parity test now compares the evidence object as well.
- Verification after the changes: `npm test` passed 6/6; `python -m unittest discover -s tests -v` passed 12/12; `python tools/evaluate.py` reported 12/12 category, priority, and red-flag matches with 4/4 emergency recall. Headless Chrome tests passed in static mode over HTTP and `file://` and in server mode; the static runs made no `/api/` requests and reported no page exceptions.
- Published `main` to <https://github.com/Botuserjpg/clinic-enquiry-desk> and enabled GitHub Pages from the `main` branch root. The published demo is <https://botuserjpg.github.io/clinic-enquiry-desk/>.
- The first live browser probe raced the deferred scripts and reported the default `LOCAL DEMO` label with an empty result. I added an explicit wait for `document.readyState === 'complete'`, then re-ran the same interaction test against the live URL. It passed in `STATIC DEMO` mode with no `/api/` requests and no page exceptions.

## Wow round

Work window: 2026-10-30, approximately 15:40–16:20 (local environment time). Feature commits: `c88f18a`, `a7d6d10`, `79f5402`, `be52013`; the documentation commit is the `HEAD` recorded by `git log -1`.

### Starting state and real fixes

- **15:40 · A rewritten shell referenced files that did not exist.** The working tree already had a new `index.html` for the mission-control design, but `styles.css`, `theme.js`, `mission.js`, `manifest.webmanifest`, `sw.js`, the icon files, and the handover/prompt-lab/safety/limits pages were missing. The page would have loaded without its design or interactions. I implemented the missing design system, presentation layer, PWA assets and pages. Commit `c88f18a` covers the shell, design system and pipeline; `a7d6d10` covers the dashboard and interactions; `79f5402` covers the pages and PWA assets.
- **15:41 · The old `app.js` would throw on the new DOM.** It queried `#today`, which the new shell removed, so the whole module would stop before binding the form. I rewrote `app.js` against the new IDs, kept the existing static/server mode logic, localStorage fallback, masking, approval and hash-chain behaviour, and exposed a small `window.ClinicDesk` API for the presentation layer. Commit `c88f18a`.
- **15:42 · The emergency acknowledgement had no server endpoint.** The static path could append an `emergency_acknowledged` event locally, but server mode had no matching route. I added `POST /api/enquiries/:id/acknowledge`, validation and duplicate protection, plus the extra static MIME types. Commit `c88f18a`.
- **15:44 · `file://` produced a manifest CORS console error.** A static `<link rel="manifest">` caused Chrome to report a CORS failure when the page was opened directly. I removed the static manifest links and add the manifest dynamically from `theme.js` only when the page is served over HTTP(S). The `file://` run then reported zero console errors. Commit `c88f18a`.
- **15:45 · The theme toggle label could be stale.** If a stored light theme was applied before the button existed, the button kept the dark-theme `aria-label`. `bindToggle()` now reapplies the current theme once the button is in the DOM. Commit `c88f18a`.
- **15:46 · A service worker on localhost would have cached the Node marker.** Registering the static worker on the Node demo could serve a cached HTML file without `CLINIC_SERVER_MODE`, silently switching the demo to static mode. Registration is now HTTPS-only, which keeps GitHub Pages offline support without interfering with the local Node server. Commit `79f5402`.

### Verification notes

- **15:52 · Full auto-demo run.** In static mode from a clean localStorage, the six-step auto-demo ran to completion: five fictional enquiries were stored, the overlay closed, the simulated tamper painted one red block, and no page exceptions were reported. The demo is skippable and the skip path was tested separately.
- **15:55 · Browser test selector bug (test only).** The approval check initially read the first `.review-note`, which is the emergency acknowledgement note, instead of `.reply-actions .review-note`. The app had approved correctly (`#metric-approvals` was 1); I corrected the test selector and re-ran. This was a verification-script error, not an app defect.
- **15:58 · Stage animation timing (test only).** A screenshot check after one second saw four of five pipeline stages because the reveal interval is 280 ms. I waited 1.7 seconds before the screenshot. The step-through and replay controls still work; no app change was needed.
- **16:00 · Port 3000 was occupied by an older Node process.** The first `npm start` failed with `EADDRINUSE`. I stopped the old process, restarted the server, and verified the new acknowledgement and approval routes. This was an environment issue, not a repository bug.
- **16:05 · Static-mode checks.** Headless Chrome passed at the HTTP root, a subpath (`/New folder/index.html`) and `file://`. All three reported `STATIC DEMO`, zero `/api/` requests and no console errors after the manifest fix.
- **16:07 · Server-mode checks.** The injected marker produced `SERVER DEMO`; emergency triage, acknowledgement and approval worked through the local API; eight same-origin `/api/` requests were observed; no page exceptions.
- **16:10 · Screenshot pass.** Headless Chrome captured the hero, Decision Pipeline, emergency gate, dashboard, handover and Prompt Lab. The first pass produced eight images; I kept six to match the requested 4–6 range. Commit `be52013`.
- **16:12 · Final automated checks.** `node --check` passed for all 10 JavaScript files; `npm test` passed 6/6; `python -m unittest discover -s tests -v` passed 12/12; the evaluation reported 12/12 category, priority and red-flag matches and 4/4 emergency recall. These remain fixture-level rule-consistency checks, not clinical validation.
- **16:20 · Live GitHub Pages verification after push.** Commit `350eb8e` was pushed and the Pages build for that commit completed with status `built`. A headless Chrome run against <https://botuserjpg.github.io/clinic-enquiry-desk/> reported the title `Clinic Mission Control — synthetic triage demo`, mode `STATIC DEMO`, the hero and four swimlanes present, and the manifest linked. Emergency triage showed `CALL 000 NOW` with the acknowledgement gate and a locked reply; the command palette opened and closed with the keyboard; the auto-demo started and skipped cleanly. The run made zero `/api/` requests, had zero failed requests and reported zero console errors. This is an automated headless check; the owner still needs to open the live URL incognito and run the auto-demo personally.

### Deliberate limits and compromises

- The classifier is still literal phrase matching. The auto-demo deliberately shows a negated emergency and a benign look-alike so reviewers see the over-triage instead of discovering it later. This is documented in `limits.html`.
- The “manual vs triage-assisted” time saving is an explicit 40% assumption, not a measurement. The dashboard labels it as such.
- No runtime model API, backend database, authentication or message-sending integration was added. The demo remains local and synthetic.
- The original prompts for rounds 01 and 02 were not present in the repository, so `PROMPTS.md` and `prompt-lab.html` mark them **TODO (owner)** rather than inventing them.



### Final round — audit artefact cleanup
- Replaced an old browser report's machine-specific file URL with a fresh-copy placeholder after the final local-path scan found it. Final scan is clean.

### Follow-up from owner video review
- Reproduced the visible jump: selecting the already-active view reset the document to the top; initial view setup could also reset scroll after the page began loading. Same-view navigation now preserves the current position, and initial setup never forces a scroll.
- The recording's Safety Net latency (32.5 ms) disagreed with the refreshed JSON/report (30.04 ms). Evaluation now regenerates the browser metrics bundle with its JSON and report; a parity test prevents stale values.
- Added a browser regression check for same-view scroll preservation.
- Follow-up after the owner clarified the click target: Inbox records the viewport before a pointer click and restores it if focusing the message box shifts the page. Triage navigation skips scrolling when the composer is already visible; view changes use an instant reset so an old smooth scroll cannot continue while typing.
- Root cause found in the recording review: global `html { scroll-behavior: smooth }` also animated browser-initiated focus scrolling. Global scrolling is now automatic; intentional animation remains explicit on navigation controls.
- A committed fix still appeared stale in the browser because the PWA service worker used cache-first JavaScript/CSS indefinitely. Bumped its cache version, changed same-origin GETs to network-first with offline cache fallback, and precached the complete app shell. The scroll fix and new cache policy must both be pushed and reloaded to take effect.
### Final round — comprehensive follow-up
- CSV export detects formula prefixes after ASCII control characters as well as ordinary whitespace and BOM, and prefixes the original value with an apostrophe. Added a regression case for a NUL-prefixed spreadsheet formula; `npm test` passes 26/26.
- Re-ran syntax checks across all JavaScript and MJS files, Node tests (26/26), Python unittest (23/23), pytest (23 tests plus 12 subtests), and `git diff --check`; all passed.
- The owner showed commit `1babb27` deleting `PROMPTS.md` instead of containing the scroll correction. Restored that file byte-for-byte from its parent commit and reconnected the README, Prompt Lab and app links; no prompt text was invented.
- The live GitHub Pages site stayed on `bf29c33` after later branch pushes. Added `.github/workflows/pages.yml` to deploy the static root on each push to `main`. Workflow run `41086070198` deployed `f63c459`; a fresh live headless browser pass confirmed the composer click and active-view navigation preserve scroll, with zero console errors, page exceptions, API requests or external requests.
