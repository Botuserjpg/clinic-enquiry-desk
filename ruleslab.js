(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const clone = value => JSON.parse(JSON.stringify(value));
  let baselineRules = null;
  let draftRules = null;
  let lastRun = null;

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function lines(text) {
    return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }

  function renderCategories(rules) {
    const host = $('#rules-categories');
    if (!host) return;
    host.replaceChildren();
    rules.categories.forEach((category, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'rules-category';
      const label = document.createElement('label');
      label.textContent = `${String(index + 1).padStart(2, '0')} · ${category.name}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = (category.terms || []).join(', ');
      input.dataset.categoryIndex = String(index);
      input.setAttribute('aria-label', `${category.name} terms, comma separated`);
      wrap.append(label, input);
      host.append(wrap);
    });
  }

  function renderDraft(rules) {
    draftRules = clone(rules);
    const redflags = $('#rules-redflags');
    const promptwords = $('#rules-promptwords');
    if (redflags) redflags.value = rules.redFlags.join('\n');
    if (promptwords) promptwords.value = rules.promptReviewWords.join('\n');
    renderCategories(rules);
  }

  function collectDraft() {
    const next = clone(draftRules || baselineRules);
    next.redFlags = lines(($('#rules-redflags') || {}).value);
    next.promptReviewWords = lines(($('#rules-promptwords') || {}).value);
    const inputs = [...document.querySelectorAll('[data-category-index]')];
    for (const input of inputs) {
      const index = Number(input.dataset.categoryIndex);
      if (next.categories[index]) next.categories[index].terms = String(input.value || '').split(',').map(term => term.trim()).filter(Boolean);
    }
    return next;
  }

  function score(rules, fixtures, classify) {
    let categoryOk = 0;
    let priorityOk = 0;
    let exact = 0;
    let emergencyExpected = 0;
    let emergencyRecalled = 0;
    let falsePositives = 0;
    let review = 0;
    const labels = new Map(fixtures.labels.map(label => [label.id, label]));
    for (const enquiry of fixtures.enquiries) {
      const expected = labels.get(enquiry.id);
      if (!expected) continue;
      const actual = classify(enquiry.message, rules);
      const category = actual.category === expected.category;
      const priority = actual.priority === expected.priority;
      if (category) categoryOk += 1;
      if (priority) priorityOk += 1;
      if (category && priority) exact += 1;
      const expectedEmergency = expected.category === 'Emergency';
      if (expectedEmergency) {
        emergencyExpected += 1;
        if (actual.emergency) emergencyRecalled += 1;
      } else if (actual.emergency) {
        falsePositives += 1;
      }
      if (actual.priority !== 'Routine') review += 1;
    }
    const total = fixtures.enquiries.length;
    return {
      total,
      exact: total ? exact / total : 0,
      category: total ? categoryOk / total : 0,
      priority: total ? priorityOk / total : 0,
      emergencyRecall: emergencyExpected ? emergencyRecalled / emergencyExpected : 1,
      falsePositives,
      reviewRate: total ? review / total : 0,
    };
  }

  function percent(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function makeMetric(label, before, after, formatter = percent) {
    const row = document.createElement('div');
    row.className = 'rules-metric';
    const name = document.createElement('span');
    name.textContent = label;
    const old = document.createElement('b');
    old.textContent = formatter(before);
    const next = document.createElement('b');
    next.textContent = formatter(after);
    const delta = document.createElement('span');
    delta.className = `delta ${after > before ? 'up' : after < before ? 'down' : ''}`.trim();
    delta.textContent = after === before ? 'no change' : `${after > before ? '+' : ''}${formatter(after - before)}`;
    row.append(name, old, next, delta);
    return row;
  }

  function runCheck() {
    const fixtures = window.CLINIC_EVALUATION_FIXTURES || window.CLINIC_FIXTURES;
    const classifier = window.ClinicClassifier;
    if (!fixtures || !classifier) {
      setText('#rules-gate', 'Fixtures or classifier not loaded. Reload the page.');
      return;
    }
    draftRules = collectDraft();
    const before = score(baselineRules, fixtures, classifier.classify);
    const after = score(draftRules, fixtures, classifier.classify);
    lastRun = { before, after, rules: clone(draftRules) };
    const gate = $('#rules-gate');
    if (gate) {
      gate.className = `rules-gate ${after.emergencyRecall >= 1 ? 'good' : 'bad'}`;
      gate.textContent = after.emergencyRecall >= 1
        ? `Gate passed: emergency recall ${percent(after.emergencyRecall)} on ${after.total.toLocaleString('en-AU')} synthetic enquiries. Saving is allowed, but a human still reviews every reply.`
        : `Save blocked: emergency recall fell to ${percent(after.emergencyRecall)} on ${after.total.toLocaleString('en-AU')} synthetic enquiries. Emergency wording can never be downgraded. Restore the missing red-flag phrase or reset the draft.`;
    }
    const save = $('#rules-save');
    if (save) save.disabled = after.emergencyRecall < 1;
    const metrics = $('#rules-metrics');
    if (metrics) {
      metrics.replaceChildren(
        makeMetric('Exact category + priority', before.exact, after.exact),
        makeMetric('Category accuracy', before.category, after.category),
        makeMetric('Priority accuracy', before.priority, after.priority),
        makeMetric('Emergency recall', before.emergencyRecall, after.emergencyRecall),
        makeMetric('False positives', before.falsePositives, after.falsePositives, value => String(value)),
        makeMetric('Review rate', before.reviewRate, after.reviewRate),
      );
    }
  }

  function saveDraft() {
    if (!lastRun || lastRun.after.emergencyRecall < 1) {
      if (window.ClinicDesk) window.ClinicDesk.notify('Save blocked: emergency recall must stay at 100%.');
      return;
    }
    if (!window.ClinicDesk) return;
    window.ClinicDesk.setRules(clone(lastRun.rules));
    baselineRules = clone(lastRun.rules);
    renderDraft(baselineRules);
    if (window.ClinicDesk) window.ClinicDesk.notify('Rules saved for this browser. The evaluation gate passed; re-run the full evaluation before any real use.');
    runCheck();
  }

  function exportRules() {
    const rules = lastRun ? lastRun.rules : (draftRules || baselineRules);
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rules.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (window.ClinicDesk) window.ClinicDesk.notify('Edited rules.json exported. This is a local download.');
  }

  function init() {
    // Prefer the rules actually active in the app, including a saved local
    // override. The authored bundle is only a fallback.
    const activeRules = window.ClinicDesk && window.ClinicDesk.rules
      ? window.ClinicDesk.rules
      : window.CLINIC_RULES;
    baselineRules = clone(activeRules || {});
    if (!baselineRules.redFlags) return;
    renderDraft(baselineRules);
    const run = $('#rules-run');
    if (run) run.addEventListener('click', runCheck);
    const save = $('#rules-save');
    if (save) save.addEventListener('click', saveDraft);
    const exportButton = $('#rules-export');
    if (exportButton) exportButton.addEventListener('click', exportRules);
    const reset = $('#rules-reset');
    if (reset) reset.addEventListener('click', () => {
      renderDraft(baselineRules);
      runCheck();
      if (window.ClinicDesk) window.ClinicDesk.notify('Rules draft reset to the active rules.');
    });
    runCheck();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
