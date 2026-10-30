# Clinic Enquiry Desk

A small, local prototype for sorting fictional general-practice clinic enquiries with transparent rules, assigning a synthetic staff role, drafting a reply that a human must approve, and recording a hash-linked activity history.

**Repository:** <https://github.com/Botuserjpg/clinic-enquiry-desk>

This is a demonstration project. It is **not** a medical device, does not diagnose, does not give medical advice, and must not be used with real patient information.

## What it does

- Classifies a fictional enquiry into a category and priority using shared, readable phrase rules.
- Gives emergency wording precedence over every other rule and shows the matched phrase with a direct instruction to tell the sender to call **000**.
- Routes the enquiry to a synthetic role (Receptionist, Practice Nurse, GP, or Practice Manager) and shows a service-level target.
- Masks common structured identifiers (phone, email, Medicare-style number, date) before display or local storage.
- Requires an explicit staff approval action for every drafted reply. Approval is recorded; the prototype never sends a message.
- Keeps an append-only history linked by a hash chain, with a **Verify integrity** button.
- Includes a **Simulate clinic day** button that adds six fictional enquiries to the history.

## Two modes, one codebase

The same `index.html`, `classifier.js`, `rules.js`, and `app.js` support both modes.

| Mode | How it is selected | History storage | Network behavior |
| --- | --- | --- | --- |
| **Server demo** | `npm start`, then open the local URL | `data/events.jsonl` on this machine | Same-origin calls to the local Node API |
| **Static demo** | Open `index.html` directly, serve it with a static file server, or host on GitHub Pages | Browser `localStorage` (falls back to memory if storage is blocked) | No application network calls |

The Node server injects a small `CLINIC_SERVER_MODE` marker into the page. Without that marker the page runs in static mode, which is what makes GitHub Pages work. You can force a mode with `?mode=static` or `?mode=server` while testing.

## Run the server demo

Requires Node.js 18 or newer. There are no package dependencies.

```sh
npm start
```

Open <http://localhost:3000>. Set `PORT` to use a different port.

## Run the static demo locally

From the repository root:

```sh
python -m http.server 8000
```

Open <http://localhost:8000>. Opening `index.html` directly with `file://` also works in current Chrome and Edge, with history kept in that browser profile.

## Publish the static demo on GitHub Pages

1. Push the repository to a public GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder, then save.
5. Open the published `https://<account>.github.io/<repository>/` URL in an incognito window and submit one of the fictional examples.

The root `index.html` and `.nojekyll` file are already present. All asset paths are relative, so the page works from a repository subpath.

## Shared rules and synthetic data

- `rules.json` is the single authored rule source for JavaScript and Python. It contains red flags, categories, prompt-review words, reply drafts, role routing, and service-level targets.
- `rules.js` and `config/clinic.js` are generated browser bundles. Regenerate them after editing the JSON sources:

```sh
python tools/build_browser_rules.py
```

- `data/enquiries.json` contains fictional messages only.
- `data/labels.json` contains the expected labels in a **separate** file.
- `config/clinic.json` contains a fictional clinic name, opening hours, public holidays, and a synthetic staff roster.
- `data/generated_enquiries.json` is generator output and is git-ignored.

## Python tools and checks

The Python tools use only the standard library.

```sh
python tools/generate_enquiries.py --count 8
python tools/triage_batch.py data/enquiries.json
python tools/evaluate.py --report docs/evaluation_report.md
```

Run both test suites:

```sh
npm test
python -m unittest discover -s tests -v
```

The evaluation compares the deterministic classifier with the separate synthetic labels. It currently reports 12/12 category, priority, and red-flag matches, and 4/4 emergency recall (100%) on the fixture. These are rule-consistency results on fictional examples, **not** clinical validation or evidence of real-world safety.

## Documentation

- [Architecture](docs/architecture.md)
- [Assumptions](docs/assumptions.md)
- [Safety notes](docs/safety_notes.md)
- [Evaluation report](docs/evaluation_report.md)
- [Build log](BUILD_LOG.md)
- [Handoff state](HANDOFF_STATE.md)

## Safety and limitations

Use only the fictional examples. Never enter real patient, health, or personal information. The prototype has no authentication, access control, transport security configuration, clinical validation, or regulatory approval. Phrase matching can miss emergencies and can flag ordinary text, so staff judgement and the 000 instruction always take priority. The hash chain can expose some edits but is not a security boundary.

## Owner TODOs

These are intentionally left for the project owner and are not fabricated here:

- Write your own reflections on the build.
- Replace the prompt summary with your own prompt history.
- Record the 2+ minute demo video in your own words.
- Add the public repository and video links to your submission email.

## License

MIT. See [LICENSE](LICENSE).
