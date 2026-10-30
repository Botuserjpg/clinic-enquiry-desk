# Demo video script — target 3 minutes

Record this in your own voice. The brackets are placeholders, not lines to read verbatim. Keep the live site in an incognito window and use fictional examples only. Do not claim clinical validation.

## 0:00–0:15 · Open on the product

**Screen:** live site at <https://botuserjpg.github.io/clinic-enquiry-desk/>, hero visible.

**Say:** “This is Clinic Mission Control — a local, explainable triage demo for fictional GP clinic enquiries. Emergency wording wins, and a human approves every reply. It is a demonstration, not medical advice.”

Point at the live status strip: mode, clinic clock, in-hours state, queue size.

## 0:15–0:45 · AI tools and why

**Screen:** keep the hero visible, or show `AI_USAGE.md`.

**Say:** “[SAY IN YOUR OWN WORDS: name the AI tools you actually used — for example an AI coding assistant, a chat model, or a speech-to-text tool — and why you chose them.] I used AI to help with the redesign, the rule explanations, the tests and the documentation. I did not connect a model to the running app: triage is deterministic and local.”

**Say:** “The important part is verification: I ran the JavaScript syntax checks, both test suites, the evaluation, and headless-browser checks in static, subpath, file and server modes.”

## 0:45–1:15 · Prompt engineering and revisions

**Screen:** open `prompt-lab.html`, then `prompt_history/03_wow_prompt.md` or `PROMPTS.md`.

**Say:** “The first brief produced a working but generic form. The upgrade round added shared rules, Python parity, static mode and tests. This Wow-round prompt asked for a distinctive mission-control product, a Decision Pipeline, a dashboard, an auto-demo and honest submission artefacts, while keeping the safety rules and tests intact.”

**Say:** “[SAY IN YOUR OWN WORDS: what was wrong with the first result, which prompt revision mattered most, and what you changed in the prompt to get a better outcome.] The saved prompt is in `prompt_history/03_wow_prompt.md`; the real problems and fixes are in `BUILD_LOG.md` under Wow round.”

## 1:15–1:35 · Approach and prior knowledge

**Screen:** scroll the page slowly, or show `docs/architecture.md`.

**Say:** “[SAY IN YOUR OWN WORDS: what you already knew about front-end work, accessibility or clinic workflows, and what you had to learn.] I kept the existing classifier and tests, then added a separate presentation layer. The rules stay in one JSON file so the browser and Python tools agree.”

## 1:35–2:00 · Challenges

**Screen:** show `BUILD_LOG.md` or the audit panel.

**Say:** “Three real challenges. First, static mode needed to work without an API, so the app uses localStorage with an in-memory fallback. Second, the first live probe raced the deferred scripts and showed the wrong mode; the test now waits for the page to finish loading. Third, a manifest link over `file://` caused a CORS console error, so the manifest is added only when the page is served. The phrase rules also over-triage negated text like ‘no chest pain’ — that is a documented limit, not a hidden failure.”

## 2:00–2:50 · Click-by-click demo

**2:00** Click **Watch the 60-second auto-demo**. Let the caption explain each step. If you are short on time, skip after the emergency step.

**2:10** On the emergency step, point at **CALL 000 NOW**, the matched phrases and the helpline lines. Say: “The reply is locked until a staff member acknowledges the 000 instruction.”

**2:20** Let the demo continue through the negated emergency, the look-alike, the multi-intent message and the refill with masked identifiers. Say: “These examples show over-triage and multi-intent limits honestly.”

**2:30** At the audit step, show the chain turning red on the simulated tamper. Say: “This is display-only; the stored history is unchanged. Verify integrity restores the green chain.”

**2:38** Open **Shift handover** from the nav or command palette. Show the counts and rows. Say: “This is generated from the local event log and is print-styled.”

**2:45** Press **Ctrl+K** to show the command palette. Say: “Keyboard-first actions, plus a light theme and reduced-motion support.”

## 2:50–3:00 · Close

**Screen:** return to the hero or the safety page.

**Say:** “The repo, live demo, prompt history, safety case and limits are linked in the README. The tests are fixture checks, not clinical validation. Thanks for watching.”

## Recording tips

- Use a 1440×900 or 1920×1080 window at 100–110% zoom; the hero and status strip should be visible without scrolling.
- Use an incognito window so the local history starts clean. The demo adds fictional events to that browser only.
- Record system audio only if you want the optional read-aloud button; otherwise keep it muted and narrate yourself.
- Do not show real patient information, real email addresses, tokens, local file paths or browser profiles.
- Keep the video at least 2 minutes. Aim for 2:45–3:15.
- If you show the server mode, start it with `npm start`; if you show static mode, open the live URL or `python -m http.server 8000`.
- Add the final video URL to `SUBMISSION_EMAIL.md` before sending.
