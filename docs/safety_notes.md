# Safety notes

This public demo uses synthetic enquiries only. It does not diagnose or provide medical advice. Do not enter real patient, health, or personal information.

## Emergency handling

The classifier checks red-flag phrases before category and urgency rules. A red-flag match overrides every other rule, raises Emergency wording, and displays “call 000 now” plus the matching phrase. The prototype cannot contact the sender; staff must relay the instruction immediately. Phrase matching can miss emergencies and can flag ordinary text, so it must not be used to assess safety or clinical urgency.

Every reply requires a staff approval action. Approval is an audit event and does not send a message.

Exact duplicate-text detection is an advisory comparison of stored masked messages. It points to an earlier record but does not merge, suppress, reprioritise or downgrade an enquiry. Emergency wording still takes precedence.

## Network behavior

Static demo mode uses the bundled classifier and rules, and reads/writes only browser localStorage (or an in-memory fallback). Its code path does not call the application API. Server mode uses same-origin `fetch` calls to the local Node API for triage, approval and history; the server binds to loopback.

Search evidence (run from the repository root; this audit used the PowerShell form):

```powershell
Select-String -Path app.js,classifier.js,index.html,config/clinic.js,rules.js,styles.css -Pattern 'fetch\(|XMLHttpRequest|WebSocket|https?://'
```

```sh
grep -nE "fetch\(|XMLHttpRequest|WebSocket|https?://" app.js classifier.js index.html config/clinic.js rules.js styles.css
```

The only match is the `fetch` inside the guarded `request()` helper in `app.js`. Static mode never calls that helper. The Node server injects `window.CLINIC_SERVER_MODE = true`; without that marker the page selects static mode. There are no third-party scripts, fonts, analytics, or external model calls.

## Storage and limitations

Server mode writes the local event file; static mode writes the browser's localStorage. Static storage can be cleared or be unavailable, in which case the demo keeps events in memory for the current page. The hash chain can expose some sequence edits when independently checked, but it is not a security boundary. The app has no authentication or access controls and has not been clinically validated.

## Masking and simulation

Structured-identifier masking is applied before display and storage for common phone, email, Medicare-style number, and date patterns. It is a demonstration safeguard, not a guarantee that all identifying information has been removed; use fictional text only. The simulate-clinic-day action adds six fictional messages through the same enquiry path and does not contact anyone.

## Integrity checking

The **Verify integrity** button recomputes the local hash chain and reports the first mismatch. Server mode uses SHA-256. Static mode uses Web Crypto SHA-256 where available and a labelled deterministic fallback otherwise. Passing the check means the stored sequence is internally consistent; it does not prove that no one with storage access changed the data.

The Safety view includes a user-triggered Trust Center. Its in-browser checks exercise classifier precedence, measured fixture recall, configured routing, synthetic slot exclusion, masking and hash-change behaviour. The API permission test runs in Node against the server. A PASS only describes that software check on the supplied synthetic cases.
