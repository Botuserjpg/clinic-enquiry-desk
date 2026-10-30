<!-- Saved from the user's "Wow round" brief in this working session. No date is invented. -->
Act as a world-class product engineer specializing in AI-enabled healthcare automation and front-end engineering. Given the following context, criteria, and instructions, implement a polished, production-ready enhancement of an existing static clinic triage demo app to meet a hiring assessment brief: complete Steps 1–6, preserve existing features/tests, run required checks, log changes, and produce the required submission artifacts (video script, prompt history, README updates, public repo + live-site-ready static app). Work autonomously, prioritize speed (target ~45–60 minutes of focused edits), make conservative edits, commit at logical milestones, and stop at a stable working state if tokens/time run low while leaving clear TODOs.

## Context

- Project: a simple static HTML/CSS/JS clinic triage demo app (already working). Reviewers will click the live link first: first 10 seconds must impress and all flows must work without setup.
- Assessment requirements and deliverables:
  - Video of >=2 minutes explaining AI tools used, prompt engineering, approach, challenges, and demo.
  - Prompt documentation with all prompts and significant revisions.
  - Public GitHub repo and ideally a live GitHub Pages site.
  - The UI must be redesigned into a distinctive "clinic mission control" product while keeping existing features and tests working.
- Non-negotiable technical constraints:
  - No external CDNs, fonts, frameworks, or build step; only plain HTML, CSS, JS with inline SVG.
  - Must work from GitHub Pages and file://.
  - No network calls in default/static mode.
  - Safety rules: synthetic data only, no medical advice, human-in-the-loop required, emergency wording wins, no secrets/local paths.
  - Accessibility: keyboard access, prefers-reduced-motion respected, adequate contrast.
  - All numeric UI values must derive from real event data or be explicitly labeled as assumptions.
  - Log all real problems/fixes in BUILD_LOG.md under "Wow round".
  - Commit after each step if git works; if commits fail, note once and continue.
- Required runtime checks:
  - node --check on every .js file
  - npm test
  - python tests
  - ensure zero /api/ requests in static mode
  - no console errors in main flows
  - static mode works from repo root, subpath, and file://
  - evaluation still at 100% emergency recall (safety test)

## Approach

- Work iteratively in small focused commits. For each Step (1–6), implement the described features, then run the checks and tests, then commit with a clear message and update BUILD_LOG.md.
- Prioritize:
  1. Visual identity + theme toggle + hero/status strip and inline SVG icons (Step 1).
  2. Decision Pipeline animation that visualises classifier decisions using real app data (Step 2).
  3. Mission-control dashboard with live simulation, swimlanes, SVG-only charts and computed metrics (Step 3).
  4. Out-of-the-box interactions: command palette, speech recognition feature-detected microphone, 60s auto-demo script, verify-integrity chain (Step 4).
  5. PWA assets (manifest, service worker), printable shift handover, Prompt Lab, Safety case, Limits page (Step 5).
  6. Map to assessment criteria, update README, VIDEO_SCRIPT.md, PROMPTS.md, AI_USAGE.md, SUBMISSION_EMAIL.md, take screenshots if possible, final checks and final message (Step 6).
- Keep edits surgical: add CSS variables, new JS modules if necessary, new HTML pages or sections, minimal refactors. Reuse existing data structures and event log. Do not rewrite working code.
- Be token-economical: if time/compute limited, finish a polished subset and ensure README and VIDEO_SCRIPT.md explain remaining TODOs.
- Use defensive coding: wrap service worker registration, theme persistence, speech APIs in try/catch and feature-detect.
- Accessibility & safety: ensure reduced-motion respect, keyboard shortcuts documented, emergency panel requires explicit staff acknowledgement and read-aloud only on user interaction.

## Response Format

- Update repository files and commit history. After finishing, produce a single concise final message file (FINAL_MESSAGE.txt) that includes:
  1. What changed (file list and short description)
  2. Real test and evaluation numbers (node --check results, npm test summary, python tests summary, emergency recall check)
  3. Anything skipped or TODOs with owners
  4. Git status (branch, last commit SHAs)
  5. Short numbered checklist for reviewer to finish submission: run in both modes, try auto-demo, save prompt as prompt_history/03_wow_prompt.md, log prompts in PROMPTS.md, answer AI_USAGE reflections, push to empty public repo, enable GitHub Pages, open live URL incognito and run auto-demo, record video, email jobs@gokulinfocare.com with links
  6. Verdict: either "READY AFTER MY TODOs" or exact blockers
- In repo create/update these files:
  - BUILD_LOG.md: record every real problem and fix under "Wow round" with timestamps and commits.
  - README.md: add "Try it in 60 seconds" and "How this maps to the assessment criteria" table, honest test counts and "Not done yet".
  - VIDEO_SCRIPT.md: 3-minute tight script covering AI tools and why; prompt engineering (initial prompt, audit rounds, improvements with real prompt_history/BULD_LOG refs and [SAY IN YOUR OWN WORDS] placeholders); approach/prior knowledge; challenges from BUILD_LOG.md; final demo click-by-click timings and recording tips.
  - PROMPTS.md: append this prompt as a new revision entry with notes (what was wrong, why this follow-up); keep any missing prompt history marked TODO (owner). Do NOT invent prompts/dates.
  - AI_USAGE.md: honest line about AI use in this round and TODO reflection questions (owner).
  - SUBMISSION_EMAIL.md: draft email to [jobs@gokulinfocare.com](mailto:jobs@gokulinfocare.com) with live-site and repo placeholders.
  - prompt_history/: save this prompt as 03_wow_prompt.md.
  - docs/screenshots/: place 4–6 screenshots if headless browser/environment available; if not, note this in BUILD_LOG.md.
  - FINAL_MESSAGE.txt as described above.
- UI/Feature outputs:
  - New design system CSS variables (dark navy, teal accent, amber, strong red, light theme toggle) with tabular numerals for counters, accessible contrast, reduced-motion handling.
  - Hero header with product name, one-line value prop, live status strip (mode badge, clock, in-hours indicator, queue size) and "Watch the 60-second auto-demo" button.
  - Inline hand-written SVG icons (inbox, shield, route, clock, user, check, alert) embedded and used as decorative + status icons.
  - Decision Pipeline animation using real classifier outputs; textual explanation and exact rule/phrase that fired for each stage. Replay and step-through controls. For emergencies, full-width pulsing red "CALL 000 NOW" with helpline lines, large read-aloud button (speechSynthesis triggered only on user gesture), and required staff acknowledgement before continuing.
  - Mission-control dashboard with:
    - speed control for simulation
    - live arrival timeline
    - queue swimlanes by role with animated cards moving between lanes
    - SLA breach counter
    - pinned emergency alert strip
    - SVG charts (hourly heatmap, priority donut, backlog ageing bars, SLA gauge, median TTFP)
    - "Manual vs triage-assisted" panel with adjustable staff time-per-enquiry assumption slider and computed estimated time saved (clearly labeled as assumption).
  - Command palette (Ctrl+K or "/") for quick actions.
  - Voice input microphone button for phone notes using Web Speech API; hidden with explanation when unavailable.
  - One-click Auto-demo (60s, skippable) that runs a scripted sequence: clear emergency, negated emergency, benign look-alike, multi-intent, refill requiring GP + identity checklist; ends with verify-integrity chain turning red on simulated tamper and dashboard view. Provide captions that explain each step for non-interacting reviewers.
  - Verify integrity visualisation: chain of blocks that turn red at tamper point; both visual and textual explanation.
  - manifest.webmanifest and simple service worker caching static assets; registration wrapped in try/catch.
  - Printable "Shift handover report" page styled for print summarising counts, emergencies, overdue, awaiting approval (sourced from real event log).
  - Prompt Lab page listing prompt_history files with title, purpose, and outcome recorded in BUILD_LOG.md or TODO (owner) if missing.
  - Safety case and Limits pages written in plain English (demo-only, not clinical).
- Testing and safety requirements:
  - Run node --check on all JS files and fix syntax errors.
  - Run npm test and fix failing tests where possible.
  - Run Python tests and address failures.
  - Ensure static mode: no /api/ requests; verify by inspecting network calls in code and disabling external fetches.
  - Ensure no console errors in main flows and that emergency recall evaluation remains at 100% (or document exact metric and mitigation in BUILD_LOG.md).
  - Respect "no medical advice" rule: all emergency text must be synthetic wording and include human-in-loop wording and helpline numbers as required by the brief.
- Logging and commits:
  - After each Step implementation and successful test run, create a git commit with a clear message like "Step 1: mission control design system", "Step 2: decision pipeline", etc.
  - If git operations fail in the environment, record the failure once in BUILD_LOG.md and continue making local file edits.
  - Update BUILD_LOG.md progressively with problems encountered, fixes applied, and any design decisions or compromises.
- Constraints about prompt documentation:
  - Do not invent prompts or dates. Record this prompt as prompt_history/03_wow_prompt.md.
  - When a source file is missing, place a clear "TODO (owner)" note rather than invent content.
- Final checks and final message:
  - After all steps or at stable stopping point, run node --check, npm test, python tests, and static-mode checks. Record results in FINAL_MESSAGE.txt and BUILD_LOG.md.
  - Produce FINAL_MESSAGE.txt as described in Response Format and place it at project root.
  - Ensure README contains the "Try it in 60 seconds" section with live link placeholder and 3 sample messages for the auto-demo.
  - If headless browser available, capture 4–6 screenshots into docs/screenshots/ and reference them in README; if not available, state this explicitly in BUILD_LOG.md.

## Instructions

- Execute without asking clarifying questions. Make conservative edits and avoid refactoring working code.
- Keep the app offline-capable and static-site friendly. Avoid network calls unless gated under a dev/test flag or feature-detected and opt-in.
- Respect accessibility: keyboard maps for palette and controls, semantic HTML, roles/aria where needed.
- Respect prefers-reduced-motion: animations disabled when prefer-reduced-motion is set.
- All emergency audio uses browser speech synthesis only when triggered by a user gesture and must be optional.
- Document every real bug, error, test failure, and fix in BUILD_LOG.md under a "Wow round" section with timestamps and commit SHAs where available.
- When producing textual content in the app (e.g., pipeline explanations, safety case), clearly label any assumptions and do not present assumptions as measured facts.
- Keep prompt/prompt-history documentation honest: only record prompts that exist; place TODOs for missing ones.
- At end of run, generate FINAL_MESSAGE.txt and update BUILD_LOG.md, README.md, VIDEO_SCRIPT.md, PROMPTS.md, AI_USAGE.md, SUBMISSION_EMAIL.md, prompt_history/03_wow_prompt.md, and commit them.
- If running out of time/tokens, leave clear TODOs in BUILD_LOG.md and README.md and ensure README and VIDEO_SCRIPT.md reflect the current state.
- Deliver a runnable static site that impresses in the first 10 seconds (hero + status strip + watch demo) and a working Decision Pipeline and auto-demo flow that demonstrates the assessment criteria.
- Do not include any secrets, real personal data, or direct medical advice. Use synthetic data and clear safety disclaimers.
- After finishing, produce FINAL_MESSAGE.txt with the exact checklist and verdict and ensure all required files are present in the repository.
