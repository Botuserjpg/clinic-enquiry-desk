# Assumptions

- This is a local, single-user demonstration prototype, not a production clinical system or medical device.
- All fixtures, labels, clinic details, staff names and messages are fictional. No real patient or personal data is used.
- Emergency escalation displays a direct instruction to call 000 and identifies matched phrases. The demo has no sender messaging integration.
- The rules are deterministic and illustrative. They do not diagnose, assess clinical urgency, or provide medical advice.
- Staff must explicitly approve every drafted reply. Approval is recorded; replies are not sent.
- Role routing and service-level targets are synthetic demonstration settings, not clinic policy. Emergency targets are shown as immediate relay.
- Structured-identifier masking covers common phone, email, Medicare-style number, and date patterns. It cannot guarantee that every possible identifier is removed, so the demo must still be used with fictional text only.
- Server-mode event history is local and hash-linked, not production-grade tamper-proof or access-controlled audit storage.
- Static mode stores its history in the current browser's localStorage. If storage is blocked, the UI remains available for triage using an in-memory list without persistence.
- `rules.json` is authoritative. The browser bundle `rules.js` is generated from it for static hosting. `config/clinic.json` is authoritative for clinic metadata, and `config/clinic.js` is its generated bundle.
- The Node server injects a server-mode marker into the page. Without that marker, the page uses static mode. A query parameter can force either mode for testing.
- No runtime AI service is used. AI assisted the implementation; runtime decisions are transparent rule matches.
- Evaluation figures describe agreement with synthetic labels only. They are not clinical validation, accuracy claims, or evidence of real-world safety.
