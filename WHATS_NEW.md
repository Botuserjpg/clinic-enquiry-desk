## Inbox scroll stability follow-up

On Inbox > Message, clicking the message field preserves the current viewport if focus would otherwise shift it. Selecting Inbox while already in Inbox also preserves scroll. The Triage shortcut scrolls the composer into view only when it is outside the viewport.

# What's new in Clinic Mission Control

A factual cheat sheet for the Max-upgrade round. Every number below is produced by the code in this repository; every path below is a real control in `index.html`. All data is synthetic.

**Live demo:** <https://botuserjpg.github.io/clinic-enquiry-desk/>  
**Run locally:** `npm start` then open <http://localhost:3000>  
**Static test:** open `index.html` directly, or serve any subfolder on GitHub Pages.

## Round 2 Trust Center

Open **Safety â†’ Trust Center â†’ Run self-tests** to see fresh PASS/FAIL rows. It checks emergency precedence, negated emergency handling, measured emergency recall, configured GP refill routing, synthetic slot exclusion, privacy masking and tamper-detection hash behaviour. The same page links [the hazard log](docs/safety_hazard_log.md) and lists a reviewerâ€™s five-minute path. API permission enforcement is covered by the automated Node server tests.

> Synthetic demonstration only. It does not diagnose or give medical advice, and must never contain real patient data. If there is immediate danger, call **000**.

## The 12 things to look at first

| # | What changed | Where it is | Exact click path |
| ---: | --- | --- | --- |
| 1 | New sidebar workspace with nine destinations | Left sidebar, every screen | Click **Inbox / Triage / Queue / Dashboard / Simulator / Rules Lab / Safety / Prompt Lab / Settings**, or press `1`â€“`9` |
| 2 | Light/dark theme toggle | Top-right header | Click the **sun/moon** button; the choice is remembered in this browser |
| 3 | Command palette | Any screen | Press **Ctrl+K** (or **âŒ˜K**), type a view or action, press **Enter**; **Esc** closes |
| 4 | Keyboard help overlay | Any screen | Press **?** or click the **keyboard** icon in the header |
| 5 | Dismissible, remembered onboarding | Inbox, under the hero | Click **Dismiss**; bring it back from **Settings â†’ Show onboarding hints again** |
| 6 | Sticky emergency strip | Top of every screen once an emergency exists | Click **Open oldest** to jump to the oldest unacknowledged emergency |
| 7 | Eight-stage Decision Pipeline | Inbox result panel | Triage any message, then read **Intake â†’ Privacy mask â†’ Understand â†’ Safety check â†’ Route â†’ SLA clock â†’ Draft reply â†’ Human approval gate** |
| 8 | Counterfactual explainer | Inbox, inside the Decision Pipeline | Triage a message, then open **What would change this decision?** under the safety stage |
| 9 | Reply Studio with tone, channel, readability, diff and blocklist | Inbox result panel, after a draft exists | Triage a non-emergency, edit **Tone**, **Channel**, or the draft; approval disables on blocked medical advice or an over-length SMS |
| 10 | Safety-gated Rules Lab | **Rules Lab** in the sidebar | Click **Rules Lab â†’ Run check**; edit a red flag and run again to see the 100% emergency-recall gate |
| 11 | Real evaluation numbers and red-team console | **Safety** in the sidebar | Click **Safety**; scroll to the metric cards and **Red-team console**, then click any attack example |
| 12 | Staffing simulator and live operations view | **Simulator** in the sidebar | Drag **Receptionists / Practice nurses / GPs**; read **teaching-model capacity** and the live queue cards |
| 13 | Trust Center live self-tests, hazard log and reviewer path | **Safety** in the sidebar, **Trust Center** panel | Click **Safety â†’ Run self-tests**; inspect each PASS/FAIL; use the linked hazard log and reviewerâ€™s five-minute path |
| 14 | Exact duplicate enquiry warning | Inbox result panel | Triage the same fictional message twice; the later result shows **Possible duplicate enquiry** and keeps its original priority and emergency result |

## Full tour with click paths

### Inbox and triage

1. Open the app. The **Inbox** view is selected.
2. Type a fictional enquiry in **Message**, or click one of the example chips.
3. Click **Triage enquiry**.
4. The result shows the category, priority, tone, assignee, SLA, status, the matched rule, and the masked message that was stored.
5. The **Decision Pipeline** shows all eight stages. The **Safety check** stage names the exact matched phrase.
6. **What would change this decision?** removes one matched phrase at a time and shows the alternative category and priority. It is a local re-run of the same rules, not a model explanation.
7. For **Appointments**, a **Synthetic appointment slots** fieldset appears. Choose a slot or **No slot â€” handle manually**. Approval books the selected slot; a second approval for the same slot is rejected.
8. For a question that matches the clinic FAQ, the **FAQ answer** box shows the answer, the source question and the BM25 score. A low score is sent to human review instead of being answered.
9. The **Reply Studio** lets staff choose **Tone** (warm / formal / brief) and **Channel** (email / SMS 320 chars). It shows readability, the medical-advice blocklist result, SMS length, and a word-level diff against the template.
10. Click **Approve reply** after entering a staff name or initials. Approval is recorded locally. **Nothing is sent.**
11. A toast confirms the action. Status changes offer **Undo** in the toast for a few seconds.

### Emergency gate

1. Triage `I have chest pain and cannot breathe.`
2. The emergency box appears with **CALL 000 NOW**, the configured helplines, and the matched trigger chips.
3. The reply draft stays locked. Tick **I have read the 000 instruction and will relay it now.** and click **Acknowledge emergency**.
4. Only then does the approval control unlock. The emergency template is fixed; tone, FAQ and slot controls cannot replace it.
5. The **sticky emergency strip** appears on every view and shows how many emergency matches still need acknowledgement.

### Queue

1. Click **Queue** in the sidebar.
2. Use the filter: **All / Open / Done / Emergency / Needs review**.
3. Each row shows priority, assignee, status, **Approved Â· not sent**, and **Ack needed / Acknowledged**.
4. Click **Audit trail (n)** on a row to see that enquiry's own events and short hashes.
5. Click **Open** to return to the full result, or **Mark done / Reopen** to change status. The status change is undoable from the toast.
6. Click **CSV** or **FHIR-shaped JSON** to download the local history. The FHIR file is explicitly labelled illustrative and not validated.

### Dashboard

1. Click **Dashboard** in the sidebar.
2. Read the eight metric cards: total, needs review, emergency flags, SLA breaches, median TTFP, approvals, review rate, median emergency acknowledgement.
3. Charts below: arrival swimlanes, arrival timeline, hour/day heatmap, category donut, ageing buckets, SLA gauge, **open enquiries by role**, and **trend signals**.
4. **Trend signals** uses a z-score of at least 2 on hourly volume with a minimum of 3 arrivals, plus an emergency-cluster signal. With fewer than three hourly buckets it shows an empty-state explanation instead of inventing a trend.
5. The **time saved** slider is an adjustable assumption. It is labelled as an estimate, not a measured outcome.
6. Click **Export CSV** to download the same local history.

### Simulator

1. Click **Simulator** in the sidebar.
2. Click **Start live simulation**. The seeded arrival pattern and speed control drive fictional arrivals through the real triage path.
3. Use **Pause simulation** and **Stop** to control the run.
4. Drag **Receptionists**, **Practice nurses** and **GPs**. Capacity uses the visible assumption: 8 contacts per receptionist, 5 per practice nurse and 4 per GP per fictional shift.
5. The **teaching-model capacity** line and the live cards update immediately. This is an adjustable teaching model, not a workforce plan.

### Rules Lab

1. Click **Rules Lab** in the sidebar.
2. Click **Run check**. The gate re-runs all 1,500 synthetic messages in the browser; expected labels remain separate and are read only by this evaluation view.
3. Edit **Red flags**, **Prompt-review words**, or a category's terms.
4. Click **Run check** again. If emergency recall drops below 100%, **Save draft** stays disabled and the gate explains why.
5. Click **Save draft** only when the gate passes. The saved override stays in this browser.
6. **Export rules.json** downloads the draft. **Reset draft** returns to the authored `rules.json`.

### Safety Net

1. Click **Safety** in the sidebar.
2. The metric cards read the real 1,500-row evaluation output in `docs/evaluation_metrics.json`.
3. The **Red-team console** runs attack-style examples through the same local pipeline. Click any example to see the route, the emergency override, injection evidence, and counterfactual probes.
4. The evaluation note states the row count, seed and emergency recall. It does not claim clinical validation.

### Prompt Lab and printable handover

1. Click **Prompt Lab** in the sidebar for the written prompt and iteration notes.
2. Click **Open printable handover** (or open `handover.html`) for a shift handover page. Use the browser's **Print** action to save it as PDF.
3. `safety.html`, `limits.html`, `prompt-lab.html` and `handover.html` remain available as standalone pages.

### Settings

1. Click **Settings** in the sidebar.
2. **Theme** toggles light/dark. **Reduced motion** stops non-essential motion and is also honoured from the operating-system setting.
3. **Browser notifications** asks for permission only when you turn it on. It can raise one optional notification for an emergency.
4. **Staff role for approvals** changes the local permission check: Receptionist, Practice Nurse, GP or Practice Manager.
5. **Show onboarding hints again** makes the Inbox onboarding panel visible.
6. **Clear local history** removes every synthetic event from this browser after a confirmation.
7. The helpline list is read from `config/clinic.json`. Every number carries a **verify before real use** comment in the config.

## Real results from this build

- Synthetic evaluation set: **1,500** messages, seed `20261030`, labels stored separately.
- Exact category + priority accuracy: **91.9%** (95% bootstrap CI **90.4%â€“93.2%**, 2,000 rounds).
- Category accuracy: **95.6%**. Priority accuracy: **92.9%**.
- Emergency recall: **100.0% (232/232)**. Emergency false positives: **50** (3.94% of non-emergency rows).
- Human-review rate: **40.8%**.
- Evaluation latency is shown from the current generated report and Safety Net bundle. It is measured locally and varies by machine; the previous Node classifier benchmark was 42.98 ms for 1,500 rows.
- Automated checks: **21 JavaScript tests** and **23 Python tests** (plus **12 subtests**) pass; `node --check` passes on every project script.
- Final headless Edge reports cover `file://`, static root, GitHub-style subpath and Node server mode. Static runs made **0** `/api/` requests; every mode had **0** unexpected external requests, console errors and page exceptions. The Trust Center's seven self-tests passed, the full Rules Lab reported 1,500 rows, and keyboard focus plus reduced-motion handling passed the browser smoke check.
- 8 real screenshots in `docs/screenshots/` were captured from the final static build, including the full-set Rules Lab and Trust Center PASS results.

## What is deliberately still a demo

- Every message, clinic detail, staff name and label is synthetic.
- The rules are transparent text matches, not a clinical assessment.
- The classifier over-triages look-alike phrases on purpose. The evaluation report lists the errors instead of hiding them.
- Approval records a human decision. No message is sent, and there is no integration with email, SMS or emergency services.
- The audit chain detects some edits. It is not a security boundary and is not production-grade audit storage.
- The service worker is HTTPS-only. On `file://` the app runs without it.

