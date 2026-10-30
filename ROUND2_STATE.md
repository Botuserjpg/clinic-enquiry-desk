# Round 2 state audit

## ALREADY DONE (verified how)

- A through most of B: inspected the workspace UI and modules (`index.html`, `app.js`, `views.js`, `extras.js`, `faq.js`, `ruleslab.js`). Dark/light themes, keyboard palette, responsive shell, auto-demo, explainable pipeline, counterfactuals, gated Rules Lab, FAQ citations, appointments, complaint/language handling and reply studio are present.
- C red-team and audit trail: Safety view includes adversarial examples, evidence, counterfactuals, visual chain, verify control and per-enquiry history; inspected `index.html` and `safety-net.js`.
- D: dashboard, simulator, trends, exports, handover, read-aloud/notification controls and PWA files are present (inspected UI/modules and `WHATS_NEW.md`).
- E dataset: separate 1,500-row synthetic messages and labels, seed 20261030, real metrics and report exist. Python tests confirmed dataset metadata and emergency recall 232/232 (100%).
- JavaScript syntax: all `*.js` files passed `node --check` during the initial audit.
- `npm test`: 17/17 passed.
- Python suite: 20 passed, 12 subtests passed, 1 failed. The failure identified missing `.github/workflows/ci.yml` (see BROKEN).
- Git status was already modified/untracked before this audit; these changes are preserved.

## BROKEN (fix first)

- Python documentation test fails because `.github/workflows/ci.yml` is missing. Add the requested CI workflow and rerun checks.
- The requested reviewer-friendly Trust Center and clickable in-browser live self-tests are absent; Safety currently has evaluation cards and red-team tools, but not the requested Run self-tests proof panel. Add this as the highest-priority feature gap.

## NOT DONE

- Trust Center was added, but its new UI interaction could not be browser-verified this turn because Chrome DevTools timed out during startup. See `BUILD_LOG.md`.
- No project changes beyond the missing items above are planned unless verification exposes another failure. A standalone Dockerfile is referenced by the current Python test but is outside the supplied feature list; do not add unrelated deployment scope.
