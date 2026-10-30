# Handoff prompt for the next AI tool

Continue work in this repository. Do not ask the owner questions; make safe, documented assumptions when needed. The previous agent stopped before implementing Phase 1 of the upgrade.

## Goal and context

This is the Clinic Enquiry Desk, a hiring-assessment project intended for a public GitHub repository. It is a prototype for a general-practice front desk in Australia. Use synthetic data only. The app must never diagnose or give medical advice. Emergency wording must override every other triage rule and prominently direct staff to tell the sender to call 000. A human must approve every drafted reply; approval does not send it.

The hiring reviewers need a working project link, prompt documentation, and a video of at least two minutes recorded by the owner. Do not invent the owner's reflections, personal prompt history, or video. Leave those as owner TODOs. `PROMPTS.md` and `prompt_history/README.md` currently contain a summary only, not a fabricated verbatim conversation.

Zero-install requirements: `npm start` must run the app using Node's standard library only. Python tools must use the standard library (with pytest optional; it is not installed in this environment). Never push. Do not claim clinical validation, medical-device status, or regulatory approval.

## Current state against the upgrade phases

### DONE AND VERIFIED

- Phase 0 audit and most requested deliverables exist: shared `rules.json`; JS and Python classifiers; Python tools; fictional enquiries with labels in a separate file; parity tests; architecture, assumptions, safety and evaluation docs; submission documents; MIT license; and prompt-history folder.
- JS and Python classification were compared for every fixture row using `python -m unittest discover -s tests -v`. The run reported 3 tests passing, including the all-row parity check and emergency precedence.
- `python tools/evaluate.py --report docs/evaluation_report.md` ran against the fixture and wrote its result. It evaluated 12 rows; category, priority, red-flag, and all-field matches were each 12/12. This is only synthetic rule consistency, not clinical validation.
- `python tools/triage_batch.py data/enquiries.json` ran and emitted triage results. `python tools/generate_enquiries.py --count 3` ran and wrote fictional rows to the ignored generated-data path.
- `npm start` was run on a non-default local port. HTTP requests returned 200 for the page and browser-rules bundle. An emergency phrase combined with an urgent appointment classified as category `Emergency`, priority `Emergency wording`, and matched `cannot breathe`.
- `node --check` was run over every `.js` file after Phase 0 changes and again in the current handoff check; both runs completed without syntax errors.
- The current Git branch is `main`; no commits exist.

### DONE BUT NOT VERIFIED

- The requested submission artifacts exist (`PROMPTS.md`, `AI_USAGE.md`, `VIDEO_SCRIPT.md`, `SUBMISSION_EMAIL.md`, and `prompt_history/README.md`), but have not been reviewed against the full hiring submission requirements. The owner must supply personal reflections, their own prompt history, and record the video.
- `docs/safety_notes.md` describes intended static-mode behavior, but static mode has not been implemented yet. Treat those statements as a draft; verify and correct them after implementing Phase 1.
- `rules.js` is generated from `rules.json` by `python tools/build_browser_rules.py`. The generator ran, but reproducibility after edits to rules has not been checked.

### IN PROGRESS / NOT STARTED

- Current phase: Phase 1, not yet started. The last work update said it was next, but no Phase 1 files were edited. The app remains server-only. Implement browser-only demo mode with localStorage behind try/catch, a mode badge, root-relative assets that work from `file://`, a `.nojekyll` file, and README instructions for `python -m http.server`, `npm start`, and GitHub Pages settings. Keep the Node server's persistent hash-chained history and all current features working. Prove the static-mode code path does not make network calls by searching the source, then document the actual search and result in `docs/safety_notes.md`.
- Phase 2 was only partially included in the received upgrade prompt. The visible requirements were `config/clinic.json` with a fictional clinic name, weekday opening hours, public-holiday dates, service-level targets and a staff roster with roles; routing for Receptionist, Practice Nurse, GP and Practice Manager; refill requests to GP review; test results to Nurse; billing to Reception; and the beginning of another routing rule (“u…”). The message ended there. Implement the visible requirements only unless the missing original prompt is available; do not invent what the truncated sentence said.
- Phases 3 through 8 were referenced by the owner in the handoff request but their instructions were not present in the prompt received by the previous agent. Do not fabricate their scope. Look for a full prompt in the owner's supplied context or ask another available source only if one exists; otherwise finish available scope and record that the instructions were truncated.
- No commit was made. Git writes failed in the previous run because `.git` was read-only. Per the owner's instruction, do not retry Git writes; continue without commits and report this limitation.

## File layout and purpose

```text
index.html                  Current server-only UI shell
app.js                      Current server API client and UI logic
styles.css                  UI styling
server.js                   Node standard-library HTTP server and append-only event API
rules.json                  Authored, shared triage rules
classifier.js               Environment-neutral JS classifier; Node CLI mode supports parity
rules.js                    Browser rules bundle generated from rules.json
data/enquiries.json         Synthetic enquiry messages without labels
data/labels.json            Separate synthetic expected labels
tools/triage.py             Python rules loader/classifier
tools/triage_batch.py       Batch triage CLI
tools/generate_enquiries.py Deterministic synthetic enquiry generator
tools/evaluate.py           Fixture comparison and report writer
tools/build_browser_rules.py Generates rules.js from rules.json
tests/test_parity.py        unittest parity, label, and emergency-precedence checks
docs/architecture.md        Components, rule order, and data flow
docs/assumptions.md         Scope and explicit assumptions
docs/safety_notes.md        Safety and network-behavior draft
docs/evaluation_report.md   Report generated from the actual fixture run
BUILD_LOG.md                Prior build record and upgrade-round audit
README.md                   Original run instructions; needs Phase 1 updates
PROMPTS.md                  Summary of implementation prompts
AI_USAGE.md                 AI usage statement
VIDEO_SCRIPT.md             Owner-recorded demo outline
SUBMISSION_EMAIL.md         Generic submission-email draft
LICENSE                     MIT license
prompt_history/README.md    Prompt provenance note; owner prompt-history TODO remains
package.json                npm start script; no dependencies
.gitignore                  Ignores runtime event log and generated fixture output
```

Python test execution also created `__pycache__` files. `.gitignore` does not yet ignore them; add `__pycache__/` and `*.py[cod]` when resuming.

## Commands

- Run app: `npm start`
- Run Python checks: `python -m unittest discover -s tests -v`
- Evaluate fixture labels: `python tools/evaluate.py --report docs/evaluation_report.md`
- Batch triage: `python tools/triage_batch.py data/enquiries.json`
- Generate fictional messages: `python tools/generate_enquiries.py --count 3`
- Regenerate browser rules after editing `rules.json`: `python tools/build_browser_rules.py`
- JS syntax: `node --check` each `.js` file (do not claim a check without running it).

## Known issues, failures, and decisions

- The exact Git failure was `could not create .git/index.lock` with permission denied. `.git` was read-only in the prior run. Git status was checked at the start of the latest turn and reports no commits; do not retry writes.
- `pytest` is not installed. Tests use standard-library `unittest`, so no dependency installation is needed.
- `docs/safety_notes.md` makes static-mode claims before the static implementation exists. Verify them after Phase 1 and change any inaccurate claims.
- `rules.js` is generated output from `rules.json`; regenerate it after rule edits and check parity.
- Generated `__pycache__` files appeared in the file listing and are not ignored yet.
- The current app still has absolute-root asset URLs and server-only API calls. Do not consider Phase 1 done until static/file mode works and the server mode is re-verified.
- The received Phase 2 text is truncated, and Phases 3–8 details were not received. Record the limitation rather than inventing requirements.
- No long tests, rebuilds, app runs, or generators were run while preparing this handoff. The cheap handoff checks listed in the latest build record/status were used only.

## Rules for continuing

1. Read `BUILD_LOG.md`, `docs/assumptions.md`, and `docs/safety_notes.md` first.
2. Do not redo finished work. Preserve server-mode history, triage, approvals, dashboard and existing visuals while adding modes.
3. Verify changes before claiming they pass; after each phase, run the app and relevant checks, fix failures, and record real results.
4. Append every real problem, its cause and its fix under the `Upgrade round` section of `BUILD_LOG.md`. Never invent problems or metrics.
5. Never add secrets, real patient data, real people's names, phone numbers, emails, or local filesystem paths to public files.
6. Keep all examples and clinic/staff configuration synthetic. Preserve emergency precedence and human approval for every reply.
7. Do not retry Git writes; no commits were possible due the known read-only `.git` state. Never push.
8. Leave the owner's personal reflections, own prompt history, and video recording as TODOs for the owner.
