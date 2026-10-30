(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function card(label, value, note) {
    const article = document.createElement('article');
    article.className = 'safety-metric';
    const name = document.createElement('span');
    name.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('small');
    small.textContent = note;
    article.append(name, strong, small);
    return article;
  }

  function renderMetrics() {
    const host = $('#safety-metrics');
    const metrics = window.CLINIC_EVAL_METRICS;
    if (!host) return;
    if (!metrics) {
      host.replaceChildren(card('Evaluation bundle', 'Missing', 'Run the evaluation and rebuild the bundle.'));
      return;
    }
    const emergency = metrics.emergency;
    const accuracy = metrics.accuracy;
    const latency = metrics.latency;
    host.replaceChildren(
      card('Emergency recall', `${(emergency.recall * 100).toFixed(1)}%`, `${emergency.recalled}/${emergency.expected} labelled emergencies`),
      card('False positives', String(emergency.false_positives), `${(emergency.false_positive_rate * 100).toFixed(1)}% of non-emergency rows`),
      card('Exact accuracy', `${(accuracy.exact_category_and_priority * 100).toFixed(1)}%`, `95% CI ${(accuracy.bootstrap_95_ci.low * 100).toFixed(1)}–${(accuracy.bootstrap_95_ci.high * 100).toFixed(1)}%`),
      card('Human review rate', `${(metrics.human_review_rate * 100).toFixed(1)}%`, 'prompt review + emergency priority'),
      card('Local latency', `${latency.total_ms.toFixed(1)} ms`, `${latency.mean_ms.toFixed(4)} ms per message`),
    );
    const note = $('#safety-eval-note');
    if (note) {
      note.textContent = `Source: docs/evaluation_metrics.json · ${metrics.dataset.rows.toLocaleString('en-AU')} synthetic rows · seed ${metrics.dataset.seed} · labels kept separately. Emergency recall is measured on rows labelled Emergency.`;
    }
  }

  function badge(text, className = '') {
    const element = document.createElement('span');
    element.className = `badge ${className}`.trim();
    element.textContent = text;
    return element;
  }

  function runRedTeam() {
    const input = $('#redteam-input');
    const host = $('#redteam-result');
    if (!input || !host) return;
    const text = String(input.value || '').trim();
    host.replaceChildren();
    host.className = 'redteam-result';
    if (!text) {
      host.textContent = 'Enter a fictional message to run the pipeline.';
      return;
    }
    const classifier = window.ClinicClassifier;
    if (!classifier) {
      host.textContent = 'The classifier has not loaded. Reload the page.';
      return;
    }
    const rules = window.ClinicDesk && window.ClinicDesk.rules ? window.ClinicDesk.rules : window.CLINIC_RULES;
    const result = classifier.classify(text, rules);
    const routing = classifier.routeEnquiry(result, rules);
    if (result.emergency) host.classList.add('emergency');
    const badges = document.createElement('div');
    badges.className = 'result-badges';
    badges.append(badge(result.category, result.emergency ? 'emergency' : ''));
    badges.append(badge(result.priority, result.emergency ? 'emergency' : result.priority === 'Prompt review' ? 'priority' : ''));
    badges.append(badge(`Route: ${routing.assignee}`));
    badges.append(badge(routing.slaMinutes === 0 ? 'SLA: relay now' : `SLA: ${routing.slaMinutes} min`));
    host.append(badges);

    const why = document.createElement('p');
    why.className = 'why';
    const evidence = result.evidence || {};
    why.textContent = result.emergency
      ? `Emergency phrase override: ${(result.redFlags || []).join(', ')}. No other rule can downgrade this result.`
      : `Category term: ${evidence.matchedCategoryTerm || 'none (default)'}; prompt-review word: ${evidence.matchedPromptWord || 'none'}; tone: ${evidence.toneLabel || 'calm'}; language: ${evidence.language || 'not detected'}.`;
    host.append(why);

    const extra = document.createElement('div');
    extra.className = 'trigger-list';
    if (evidence.injectionDetected) extra.append(badge(`Injection text: ${(evidence.injectionPhrases || []).join(', ')}`));
    if ((evidence.negatedRedFlags || []).length) extra.append(badge(`Negated phrase still matched: ${evidence.negatedRedFlags.join(', ')}`));
    if (evidence.interpreterSuggested) extra.append(badge(`Interpreter may be needed · TIS ${(window.CLINIC_CONFIG && window.CLINIC_CONFIG.interpreterService && window.CLINIC_CONFIG.interpreterService.number) || '131 450'}`));
    if (extra.children.length) host.append(extra);

    if (window.ClinicExtras && typeof window.ClinicExtras.counterfactuals === 'function') {
      const counterfactual = window.ClinicExtras.counterfactuals(text, rules, classifier.classify);
      const list = document.createElement('div');
      list.className = 'trigger-list';
      for (const item of counterfactual.results.filter(entry => entry.changed).slice(0, 4)) {
        list.append(badge(`${item.label} → ${item.category} · ${item.priority}`));
      }
      if (list.children.length) {
        const title = document.createElement('p');
        title.className = 'chart-note';
        title.textContent = 'Counterfactual probes (local, same rules):';
        host.append(title, list);
      }
    }

    const masked = classifier.maskSensitive(text);
    if (masked !== text) {
      const note = document.createElement('p');
      note.className = 'chart-note';
      note.textContent = `Privacy mask would store: ${masked}`;
      host.append(note);
    }
  }

  async function runTrustTests() {
    const host = $('#trust-results');
    if (!host) return;
    const classifier = window.ClinicClassifier;
    const rules = window.ClinicDesk && window.ClinicDesk.rules ? window.ClinicDesk.rules : window.CLINIC_RULES;
    const config = window.CLINIC_CONFIG;
    const metrics = window.CLINIC_EVAL_METRICS;
    const tests = [];
    const record = (name, pass, detail) => tests.push({ name, pass: Boolean(pass), detail });
    try {
      const emergency = classifier.classify('I have chest pain and cannot breathe.', rules);
      const negated = classifier.classify('No chest pain, I just need a repeat script.', rules);
      record('Emergency precedence', emergency.emergency && emergency.category === 'Emergency', `Emergency phrase result: ${emergency.category} / ${emergency.priority}.`);
      record('Negated emergency remains escalated', negated.emergency && negated.category === 'Emergency', `Negated phrase result: ${negated.category}; over-triage is intentional.`);
      record('Evaluation recall gate', metrics.emergency.recall === 1 && metrics.emergency.recalled === metrics.emergency.expected, `${metrics.emergency.recalled}/${metrics.emergency.expected} labelled emergencies recalled in the evaluation.`);
      record('Refill routes to GP review', rules.routing['Prescription refill'] === 'GP', `Configured refill route: ${rules.routing['Prescription refill'] || 'missing'}. Server tests separately enforce role permissions.`);
      const date = new Date(2026, 9, 30, 8, 0);
      const slots = window.ClinicExtras.generateSlots({ now: date, config, bookedSlotIds: [], limit: 4 });
      const taken = slots.length ? window.ClinicExtras.generateSlots({ now: date, config, bookedSlotIds: [slots[0].slotId], limit: 8 }) : [];
      record('Double-booking prevention', Boolean(slots.length) && !taken.some(slot => slot.slotId === slots[0].slotId), slots.length ? `Booked slot ${slots[0].slotId} is excluded from new suggestions.` : 'No eligible slot in this synthetic calendar window.');
      const masked = classifier.maskSensitive('Email test@example.invalid and call 0412 345 678; call 000 for emergencies.');
      record('Privacy masking preserves emergency number', masked.includes('[email redacted]') && masked.includes('[phone redacted]') && masked.includes('000'), `Masked output: ${masked}`);
      const event = { type: 'self_test', previousHash: 'GENESIS', result: 'PASS' };
      const hash = await window.ClinicDesk.hashText('GENESIS' + JSON.stringify(event));
      const verifiedHash = await window.ClinicDesk.hashText('GENESIS' + JSON.stringify(event));
      const alteredHash = await window.ClinicDesk.hashText('GENESIS' + JSON.stringify({ ...event, result: 'ALTERED' }));
      record('Tamper detection hash primitive', hash === verifiedHash && hash !== alteredHash, `Identical event matched; edited event ${hash !== alteredHash ? 'changed' : 'did not change'} the hash. The Audit Trail verifies the actual stored chain.`);
    } catch (error) {
      record('Trust Center self-test run', false, `Self-test error: ${error.message}`);
    }
    host.replaceChildren();
    tests.forEach(result => {
      const row = document.createElement('article');
      row.className = `trust-result ${result.pass ? 'pass' : 'fail'}`;
      const state = document.createElement('strong');
      state.textContent = result.pass ? 'PASS' : 'FAIL';
      const name = document.createElement('b');
      name.textContent = result.name;
      const detail = document.createElement('span');
      detail.textContent = result.detail;
      row.append(state, name, detail);
      host.append(row);
    });
  }

  function init() {
    renderMetrics();
    const run = $('#redteam-run');
    if (run) run.addEventListener('click', runRedTeam);
    const trustRun = $('#trust-run');
    if (trustRun) trustRun.addEventListener('click', runTrustTests);
    const input = $('#redteam-input');
    if (input) {
      input.addEventListener('input', () => setText('#redteam-count', `${input.value.length.toLocaleString('en-AU')} / 2,000`));
      input.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          runRedTeam();
        }
      });
    }
    document.querySelectorAll('[data-redteam]').forEach(button => {
      button.addEventListener('click', () => {
        if (!input) return;
        let value = button.dataset.redteam;
        if (value === 'Chest pain. ') value = `Chest pain. ${'Synthetic filler text for the length test. '.repeat(45)}`.slice(0, 2000);
        input.value = value;
        input.dispatchEvent(new Event('input'));
        input.focus();
        runRedTeam();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
