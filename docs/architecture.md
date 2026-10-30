# Architecture

## Components

- `rules.json` is the single authored triage-rule source. Node loads it directly, Python tools parse it directly, and the browser bundle is generated from it.
- `classifier.js` implements the rule ordering, role routing, service-level lookup, and structured-identifier masking in an environment-neutral function. Its command-line mode accepts a JSON array of messages for parity checks.
- `tools/triage.py` reads the same JSON rules for Python classification, routing, and masking. The batch, generator, and evaluation commands use Python's standard library.
- `data/enquiries.json` holds fictional message rows; `data/labels.json` holds the expected labels separately.
- `config/clinic.json` holds a fictional clinic name, opening hours, public holidays, and a synthetic staff roster. `config/clinic.js` is its generated browser bundle.
- `server.js` serves the page and persists server-mode events in `data/events.jsonl`, linked by SHA-256 hashes.
- `app.js` renders intake, decisions, routing, approval, dashboard, integrity checking, simulation, and recent history. It selects server or static mode at load time.
- `index.html` is the root entry point for both Node hosting and GitHub Pages. All asset URLs are relative.

## Rule order

Red-flag phrase matching runs first. A match sets both category and priority to Emergency, regardless of any appointment or urgency words also present. Otherwise the first configured category match applies, followed by prompt-review words and then routine priority. The phrase rules are illustrative text matches, not a clinical assessment.

Routing then maps the final category to a synthetic role. Service-level targets map the final priority to a review window, with emergencies set to immediate relay. Both maps live in `rules.json` so JavaScript and Python use the same values.

## Data flow

Server mode sends enquiry and approval actions to the local Node server and reads its event history. The server classifies with `classifier.js`, masks structured identifiers, adds routing and service-level fields, and appends a hash-linked event. Static demo mode classifies in-browser, masks identifiers, and stores events in browser `localStorage`; it does not call the application API. Both modes share `classifier.js` and the generated browser rules.

## Static mode selection

The Node server injects `window.CLINIC_SERVER_MODE = true` into the served HTML. When that marker is absent, as on GitHub Pages or a `file://` page, `app.js` uses static storage. A `?mode=static` or `?mode=server` query parameter can override the choice for testing. Static storage is wrapped in `try/catch` and falls back to an in-memory list if storage is unavailable.

## History integrity

Each event stores `previousHash`, a timestamp, and a hash over the previous hash plus the event content. Server mode uses Node's SHA-256. Static mode uses Web Crypto SHA-256 where available, with a clearly labelled deterministic fallback otherwise. The **Verify integrity** button recomputes the chain and reports the first mismatch. This detects some edits but is not a security boundary.

## Extras

The interface also provides role routing, service-level timers, structured-identifier masking, a verify-integrity action, and a simulate-clinic-day action. The simulated messages are fictional and are added through the same enquiry path as manual entries.
