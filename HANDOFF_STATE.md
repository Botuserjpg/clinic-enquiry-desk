# Handoff state

Audit performed before further changes. This records what was actually checked, not what a prior log claimed.

## DONE AND VERIFIED

- **Project files are present.** A recursive listing found `index.html`, `app.js`, `classifier.js`, `rules.js`, `rules.json`, `server.js`, `styles.css`, `package.json`, `data/`, `docs/`, `tools/`, `tests/`, and the submission files.
- **Git repository exists but has no commits.** `git status` reports branch `main`, "No commits yet", and every project file untracked. (A one-time `safe.directory` exception was added because `.git` is owned by a different Windows account; this changed no project file.)
- **All JavaScript parses.** `node --check` returned OK for `app.js`, `classifier.js`, `rules.js`, and `server.js`.
- **`rules.json` is valid and is the authored source.** Python loaded it successfully. `rules.js` was parsed and compared with `rules.json`; the objects are identical.
- **JS and Python classifiers agree.** `python -m unittest discover -s tests -v` ran 3 tests, all OK, including the all-row JS/Python parity check and emergency precedence.
- **Synthetic data and labels are separate.** `data/enquiries.json` has 12 message rows only; `data/labels.json` holds the expected labels. The label test and evaluation both matched every row.
- **Evaluation runs.** `python tools/evaluate.py` reported 12 rows, category 12/12, priority 12/12, red-flag 12/12, all fields 12/12. This is synthetic rule consistency, not clinical validation.
- **Emergency recall is 100% on the fixture.** A direct script counted 4 emergency-labelled rows and 4 recalled emergency classifications (4/4, 100%).
- **Python tools run.** `tools/generate_enquiries.py --count 3 --output <temp>` wrote three message-only rows, and `tools/triage_batch.py data/enquiries.json` emitted triage output.
- **Required docs exist and were read:** `BUILD_LOG.md`, `docs/assumptions.md`, `docs/safety_notes.md`, `docs/architecture.md`, `docs/evaluation_report.md`.
- **Submission files exist:** `README.md`, `PROMPTS.md`, `AI_USAGE.md`, `BUILD_LOG.md`, `VIDEO_SCRIPT.md`, `SUBMISSION_EMAIL.md`, `LICENSE` (MIT text present).
- **Zero-dependency intent is real.** `package.json` has only a `start` script and no dependencies; Python tools import only the standard library.

## DONE BUT UNVERIFIED

- **Server mode runtime.** `server.js` parses and its logic was read, but this audit did not start the server or exercise the HTTP page, triage, approval, history, or hash chain. Prior `BUILD_LOG.md` claims are not re-verified here.
- **UI and styling.** `styles.css` and the rendered interface were not opened in a browser this audit.
- **Submission-file quality.** The files exist and are readable, but their content has not been reviewed against the full hiring requirements. Personal reflections, the owner's own prompt history, and the video remain owner work.
- **`data/generated_enquiries.json`.** It exists and is git-ignored, but it is generator output, not an authored source; its current contents were not treated as authoritative.
- **Docs accuracy.** `docs/architecture.md` and `docs/safety_notes.md` describe a static mode that does not exist yet, so those statements are currently inaccurate rather than verified.

## MISSING

- **Static demo mode.** `app.js` always calls `fetch('/api/...')`; `index.html` uses root-absolute `/styles.css` and `/app.js`; there is no mode detection, no localStorage history, and no mode badge. Static mode cannot work from `file://` or a GitHub Pages subpath yet.
- **`.nojekyll`.** Not present at the repository root.
- **Explicit emergency-recall metric in the evaluation tool/report.** The data supports 4/4 (100%), but `tools/evaluate.py` and `docs/evaluation_report.md` do not report emergency recall.
- **Static/GitHub Pages instructions in `README.md`.** Only `npm start` is documented.
- **Clinic configuration and routing.** No `config/clinic.json`; no role routing (Receptionist, Practice Nurse, GP, Practice Manager), no opening hours/public holidays, no service-level targets or staff roster.
- **Extras.** No SLA timers, no sensitive-data masking, no verify-log-integrity button, no simulate-a-clinic-day button.
- **Python cache ignores.** `.gitignore` does not ignore `__pycache__/` or `*.py[cod]`.
- **Commits and remote.** No commits, no remote, nothing published.
- **Owner TODOs.** Reflections, the owner's verbatim prompt history, and the recorded video are intentionally absent.

## Update after the completion pass

The three lists above record the state found during the initial audit. The following items were completed and re-verified afterwards:

- Static demo mode now works from `file://`, a static file server, and GitHub Pages. `index.html` uses relative assets; `.nojekyll` exists; the mode badge reports STATIC DEMO; history uses localStorage with an in-memory fallback.
- Node server mode still works. It injects a server marker, masks stored identifiers, returns routing/SLA fields, and preserves the hash-chained history.
- `tools/evaluate.py` and `docs/evaluation_report.md` now report emergency recall. The fixture result is 4/4 (100%).
- Routing, service-level targets, masking, verify-integrity, and simulate-clinic-day are implemented. The classifier also returns explicit evidence (matched category term, prompt-review word, red-flag phrases, and rule order) for the UI.
- Tests were expanded. `npm test` passed 6/6 and `python -m unittest discover -s tests -v` passed 12/12.
- Headless Chrome checks passed in static HTTP, static `file://`, and server modes. The static runs made no `/api/` requests and reported no page exceptions.
- `README.md`, architecture, assumptions, safety notes, build log, and `.gitignore` were updated to match the implementation.

Published to <https://github.com/Botuserjpg/clinic-enquiry-desk> with GitHub Pages enabled at <https://botuserjpg.github.io/clinic-enquiry-desk/>. Still owner work: answer the reflections, supply the verbatim prompt history, record the 2+ minute video, check the live page in an incognito window, and send the submission email.

## Current status — 31 October 2026

The lists above are the original audit history. Current verified state after the Max-upgrade audit:

- **Code and tests:** all 21 JavaScript/ES module files pass `node --check`; `npm test` passes **28/28**; `python -m unittest discover -s tests -v` passes **27/27**; `python -m pytest -q` passes **27 tests plus 12 subtests**.
- **Evaluation:** 1,500 synthetic rows, seed `20261030`; exact category+priority **91.87%**, category **95.6%**, priority **92.93%**, emergency recall **232/232 (100%)**, **50** emergency false positives, review rate **40.8%**. Latest local Python latency is **48.27 ms** for the full set (**0.0322 ms per message**); repeated runs measured **42.98–81.43 ms** and timings vary. The generated report is `docs/evaluation_report.md`.
- **Browser verification:** fresh headless Chrome runs passed static root, GitHub-style subpath, `file://` and Node server mode. Static modes made **0** API requests; all modes had **0** unexpected external requests, console errors or page exceptions. The inline staff-name acknowledgement/approval flow passed in all four modes. Server mode made **25** same-origin API calls. Evidence is in `docs/browser_check_current_*.json`; screenshots are refreshed.
- **Fixed in this audit:** exact server-side emergency template, export approval joins, inline staff-name validation, clear-history behaviour, Rules Lab active baseline, brand anchor and switch names, Docker `HOST` binding, queue truncation notice, and the cleaned `WHATS_NEW.md`. Details are in `BUILD_LOG.md` and `docs/FINAL_AUDIT.md`.
- **Not verified:** the Docker image could not be built because Docker is not installed on this machine; the `HOST` fix is source-level and test-covered. The live Pages deployment still needs a final post-push check.
- **Owner work still open:** save prompt 04, add the factual prompt row, write owner reflections, supply the original prompt history, record the personal video, run the incognito check, and send the email to `jobs@gokulinfocare.com`. No shipped text invents these.
