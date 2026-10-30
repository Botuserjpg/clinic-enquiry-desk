# Prompts used

This file records prompts that actually exist in the project. Missing originals are marked **TODO (owner)** rather than reconstructed.

## 01 · Initial project brief

The project was built from a user-provided brief for a small Australian GP front-desk enquiry tool using synthetic data, explainable triage, immediate 000 escalation for emergency wording, staff-approved reply drafts, an append-only history and a small dashboard. Safety constraints were to avoid diagnosis or medical advice, use no real patient data, and retain human approval.

**Original prompt file:** TODO (owner) — the original brief is not present in `prompt_history/`. The summary above is not a verbatim prompt.

## 02 · Upgrade round

An upgrade prompt requested a shared `rules.json`, browser and Python parity, local static mode, synthetic fixtures with separate labels, Python utilities, documentation and submission materials. It also required continued Node standard-library operation and factual logs.

**Original prompt file:** TODO (owner) — the original upgrade prompt was not saved as a file. The summary above is not a verbatim prompt. The implemented changes and the problems found are recorded in `BUILD_LOG.md` under **Upgrade round**.

## 03 · Wow round — mission-control enhancement

**Prompt file:** [`prompt_history/03_wow_prompt.md`](prompt_history/03_wow_prompt.md) — saved from the user's brief in this working session.

**What was wrong or incomplete before this round:** the app worked, but it looked like a generic form and did not make the classifier's reasoning, the emergency gate or the human approval decision visible enough for a reviewer in the first ten seconds. The dashboard was thin, there was no auto-demo, no command palette, no printable handover, no PWA assets and no dedicated safety/limits/prompt pages. The public live site was already working, but the product experience did not yet match the safety story.

**Why this follow-up was requested:** the hiring brief asked for a distinctive “clinic mission control” product, a Decision Pipeline using real classifier outputs, a mission-control dashboard with computed metrics, out-of-the-box interactions, PWA assets and honest submission artefacts, while preserving the existing tests and safety rules.

**What this round asked for:**

- A design system with dark navy, teal, amber and red, a light theme, tabular numerals and reduced-motion support.
- A hero and live status strip, inline SVG icons and a one-click auto-demo.
- An animated Decision Pipeline with exact rule/phrase evidence, replay and step-through controls.
- An emergency panel with **CALL 000 NOW**, helplines, optional read-aloud on a user gesture and a required staff acknowledgement.
- A dashboard with a live simulation, arrival timeline, role swimlanes, SLA breach counter, SVG charts and a clearly labelled manual-vs-assisted assumption.
- A command palette, optional voice input, a 60-second auto-demo, and a visual integrity chain.
- PWA assets, printable shift handover, Prompt Lab, Safety case and Limits pages.
- Honest README, VIDEO_SCRIPT, PROMPTS, AI_USAGE, SUBMISSION_EMAIL, screenshots and FINAL_MESSAGE updates.

**Outcome:** implemented and verified in this working session. See `BUILD_LOG.md` under **Wow round** for the real problems and fixes, and `FINAL_MESSAGE.txt` for the final check results, commit SHAs and owner TODOs.

## Prompt hygiene

- No secrets, credentials or real patient data are stored in these files.
- Runtime triage is deterministic and local. No model API is called by the app.
- AI assistance is documented honestly in `AI_USAGE.md`.
- Dates and personal reflections are not invented.
