# Submission email draft

**To:** jobs@gokulinfocare.com  
**Subject:** Clinic Mission Control — AI-enabled triage prototype (repo + live demo)

Hello,

I am sharing **Clinic Mission Control**, a local, explainable triage prototype for fictional GP clinic enquiries.

- **Public repository:** <https://github.com/Botuserjpg/clinic-enquiry-desk>
- **Live static demo:** <https://botuserjpg.github.io/clinic-enquiry-desk/>
- **Video walkthrough:** TODO (owner) — add the 2+ minute video link before sending.

The demo shows emergency wording overriding every other rule, a required staff acknowledgement before the reply unlocks, and human approval before any draft is treated as ready. It never sends a message and never contacts a patient. A Decision Pipeline shows the exact rule or phrase that fired, and the mission-control dashboard is computed from the local event log.

The project uses only plain HTML, CSS and JavaScript with inline SVG — no CDN, framework or build step — and works from GitHub Pages, a static file server and `file://`. Static mode makes no application network calls.

Verification from the final working session:

- `node --check`: all JavaScript files passed.
- `npm test`: 26/26 passed (last local audit).
- `python -m pytest -q`: 23 passed, 12 subtests passed.
- Evaluation: 1,500 synthetic rows; 91.87% exact category-and-priority accuracy (95% bootstrap CI 90.4%–93.2%); emergency recall 232/232 (100%); 50 emergency false positives.
- Final headless Edge checks on a fresh copy covered static root, GitHub-style subpath, `file://`, and server mode. Static modes made zero `/api/` requests; all modes had zero unexpected external requests, console errors or page exceptions. All seven Trust Center checks passed.

These are fixture-level rule-consistency results, not clinical validation. The prototype is a synthetic demonstration and must not be used with real patient information. The README, safety case and limits page describe the constraints honestly.

The repository also includes prompt history, a build log, architecture and assumption notes, a printable shift handover, and a skippable auto-demo.

Regards,  
[YOUR NAME]
