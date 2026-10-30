(() => {
  'use strict';

  const rules = window.CLINIC_RULES;
  const config = window.CLINIC_CONFIG || {};
  const classifier = window.ClinicClassifier;
  const params = new URLSearchParams(window.location.search);
  const forcedMode = params.get('mode');
  // Static is the default for file:// and GitHub Pages. The Node server injects a marker.
  const isStatic = forcedMode === 'static' || (forcedMode !== 'server' && !window.CLINIC_SERVER_MODE);
  const STORAGE_KEY = 'clinicDeskEventsV1';
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let memoryEvents = [];
  let toastTimer;
  let stageTimer;
  let stageEls = [];
  let stageIndex = 0;
  let currentResult = null;
  let currentApproved = false;
  let tamperIndex = null;
  let latestMetrics = null;

  const $ = selector => document.querySelector(selector);
  const form = $('#intake-form');
  const messageInput = $('#message');
  const resultContent = $('#result-content');
  const emptyState = $('#empty-state');
  const toast = $('#toast');
  const integrityStatus = $('#integrity-status');
  const pipelineControls = $('#pipeline-controls');

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
  }

  function newId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function hashText(text) {
    if (globalThis.crypto && globalThis.crypto.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    // Deterministic fallback for browsers without Web Crypto. The UI says which mode is active.
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  async function request(url, options) {
    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
    return body;
  }

  function loadStaticEvents() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) memoryEvents = parsed;
      }
    } catch {
      // Storage may be blocked; the in-memory copy keeps the demo usable.
    }
    return memoryEvents.slice();
  }

  function saveStaticEvents(events) {
    memoryEvents = events.slice();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {
      // Keep working in memory if storage is blocked.
    }
  }

  async function appendStaticEvent(event) {
    const events = loadStaticEvents();
    const previousHash = events.length ? events[events.length - 1].hash : 'GENESIS';
    const content = { ...event, previousHash, timestamp: new Date().toISOString() };
    const hash = await hashText(previousHash + JSON.stringify(content));
    const stored = { ...content, hash };
    events.push(stored);
    saveStaticEvents(events);
    return stored;
  }

  async function getEvents() {
    return isStatic ? loadStaticEvents() : request('/api/history');
  }

  async function createEnquiry(message) {
    const text = String(message || '').trim();
    if (!text) throw new Error('Enter an enquiry of 1 to 2,000 characters.');
    if (text.length > 2000) throw new Error('Enter an enquiry of 1 to 2,000 characters.');
    if (isStatic) {
      const triage = classifier.classify(text, rules);
      const routing = classifier.routeEnquiry(triage, rules);
      const event = await appendStaticEvent({
        type: 'enquiry_received',
        id: newId(),
        message: classifier.maskSensitive(text),
        ...triage,
        ...routing,
      });
      return { ...event, triggers: event.redFlags };
    }
    return request('/api/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
  }

  function formatDuration(milliseconds) {
    const minutes = Math.max(0, Math.round(milliseconds / 60000));
    if (minutes < 1) return '<1 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  function slaText(event) {
    if (!Number.isFinite(event.slaMinutes)) return '';
    if (event.emergency || event.slaMinutes === 0) return 'SLA: relay now';
    if (!event.timestamp) return `SLA: ${formatDuration(event.slaMinutes * 60000)}`;
    const due = new Date(event.timestamp).getTime() + event.slaMinutes * 60000;
    const remaining = due - Date.now();
    return remaining < 0 ? `SLA: overdue by ${formatDuration(-remaining)}` : `SLA: due in ${formatDuration(remaining)}`;
  }

  function clinicNow() {
    const now = new Date();
    const timezone = config.timezone || 'Australia/Sydney';
    try {
      const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: timezone,
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const get = type => (parts.find(part => part.type === type) || {}).value;
      const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
      return { weekday: String(get('weekday') || '').toLowerCase(), hour: Number(get('hour')), minute: Number(get('minute')), dateKey };
    } catch {
      return {
        weekday: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()],
        hour: now.getHours(),
        minute: now.getMinutes(),
        dateKey: now.toISOString().slice(0, 10),
      };
    }
  }

  function updateClock() {
    const now = clinicNow();
    const time = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
    setText('#clock', time);
    const pill = $('#hours-pill');
    if (!pill) return;
    const hours = (config.openingHours || {})[now.weekday] || 'closed';
    const isHoliday = Array.isArray(config.publicHolidays) && config.publicHolidays.includes(now.dateKey);
    let open = false;
    let close = '';
    if (!isHoliday && hours !== 'closed') {
      const [start, end] = hours.split('-').map(value => value.trim());
      const [startHour, startMinute] = start.split(':').map(Number);
      const [endHour, endMinute] = end.split(':').map(Number);
      const minutes = now.hour * 60 + now.minute;
      open = minutes >= startHour * 60 + startMinute && minutes < endHour * 60 + endMinute;
      close = end;
    }
    pill.textContent = isHoliday ? 'Public holiday · closed' : open ? `In hours · until ${close}` : 'After hours';
    pill.className = `status-pill status-hours ${open ? 'open' : 'closed'}`;
  }

  function isAcknowledged(events, id) {
    return events.some(event => event.type === 'emergency_acknowledged' && event.id === id);
  }

  function computeMetrics(events) {
    const received = events.filter(event => event.type === 'enquiry_received');
    const approvals = events.filter(event => event.type === 'reply_approved');
    const approvedIds = new Set(approvals.map(event => event.id));
    const ackedIds = new Set(events.filter(event => event.type === 'emergency_acknowledged').map(event => event.id));
    const pending = received.filter(event => !approvedIds.has(event.id));
    const now = Date.now();
    const overdue = pending.filter(event => Number.isFinite(event.slaMinutes) && event.slaMinutes > 0 && event.timestamp && now > new Date(event.timestamp).getTime() + event.slaMinutes * 60000);
    const emergencyPending = received.filter(event => event.emergency && !ackedIds.has(event.id));
    const times = approvals.map(approval => {
      const enquiry = received.find(item => item.id === approval.id);
      if (!enquiry || !enquiry.timestamp) return null;
      return new Date(approval.timestamp).getTime() - new Date(enquiry.timestamp).getTime();
    }).filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    const median = times.length ? times[Math.floor((times.length - 1) / 2)] : null;
    return {
      total: received.length,
      review: pending.length,
      emergency: received.filter(event => event.emergency).length,
      emergencyPending: emergencyPending.length,
      slaBreaches: overdue.length,
      approvals: approvals.length,
      medianTtfp: median,
      received,
      pending,
      approvalsList: approvals,
      ackedIds,
      approvedIds,
    };
  }

  function updateMetrics(metrics) {
    latestMetrics = metrics;
    const values = [
      ['#metric-total', metrics.total],
      ['#metric-review', metrics.review],
      ['#metric-emergency', metrics.emergency],
      ['#metric-sla', metrics.slaBreaches],
      ['#metric-approvals', metrics.approvals],
      ['#hero-queue', metrics.review],
      ['#hero-emergency', metrics.emergency],
      ['#hero-sla', metrics.slaBreaches],
      ['#queue-size', metrics.review],
    ];
    for (const [selector, value] of values) setText(selector, Number(value).toLocaleString('en-AU'));
    setText('#metric-ttfp', metrics.medianTtfp === null ? '—' : formatDuration(metrics.medianTtfp));

    const strip = $('#emergency-strip');
    if (strip) {
      strip.hidden = metrics.emergencyPending === 0;
      setText('#emergency-strip-count', metrics.emergencyPending.toLocaleString('en-AU'));
    }
    document.dispatchEvent(new CustomEvent('clinic:updated', { detail: { events: stateEvents(), metrics, isStatic } }));
  }

  let cachedEvents = [];
  function stateEvents() {
    return cachedEvents.slice();
  }

  function renderIntegrityChain(events) {
    const chain = $('#integrity-chain');
    if (!chain) return;
    chain.replaceChildren();
    if (!events.length) {
      const empty = document.createElement('span');
      empty.className = 'chain-block unknown';
      empty.innerHTML = '<b>GENESIS</b>no events';
      chain.append(empty);
      return;
    }
    events.forEach((event, index) => {
      const block = document.createElement('span');
      const isTampered = tamperIndex === index;
      block.className = `chain-block${isTampered ? ' tampered' : event.hash ? '' : ' unknown'}`;
      const label = document.createElement('b');
      label.textContent = isTampered ? `#${index + 1} TAMPER` : `#${index + 1}`;
      const hash = document.createElement('span');
      hash.textContent = event.hash ? event.hash.slice(0, 8) : 'no hash';
      block.append(label, hash);
      block.title = `${event.type || 'event'} · ${event.timestamp || ''}`;
      chain.append(block);
    });
  }

  function renderHistory(events) {
    const list = $('#history-list');
    if (!list) return;
    list.replaceChildren();
    if (!events.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'No activity yet. Triage a fictional enquiry or start the simulation.';
      list.append(empty);
      return;
    }
    for (const event of [...events].reverse().slice(0, 12)) {
      const row = document.createElement('div');
      row.className = 'history-row';
      const time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.timestamp));
      const description = document.createElement('span');
      description.className = 'history-description';
      const strong = document.createElement('b');
      if (event.type === 'reply_approved') {
        strong.textContent = 'Reply approved';
        description.append(strong, document.createTextNode(` · by ${event.approvedBy}`));
      } else if (event.type === 'emergency_acknowledged') {
        strong.textContent = 'Emergency acknowledged';
        description.append(strong, document.createTextNode(` · by ${event.acknowledgedBy || 'staff'}`));
      } else {
        strong.textContent = event.category;
        const routing = event.assignee ? ` · ${event.assignee}` : '';
        description.append(strong, document.createTextNode(` · ${event.priority}${event.emergency ? ' · emergency phrase match' : ''}${routing}`));
        if (event.slaMinutes !== undefined) {
          const sla = document.createElement('small');
          sla.className = event.emergency || event.slaMinutes === 0 ? 'sla sla-now' : 'sla';
          sla.textContent = ` ${slaText(event)}`;
          description.append(sla);
        }
      }
      const hash = document.createElement('span');
      hash.className = 'history-hash';
      hash.textContent = event.hash ? event.hash.slice(0, 12) : '—';
      row.append(time, description, hash);
      list.append(row);
    }
  }

  async function loadHistory() {
    try {
      const events = await getEvents();
      cachedEvents = events;
      const metrics = computeMetrics(events);
      updateMetrics(metrics);
      renderHistory(events);
      renderIntegrityChain(events);
    } catch (error) {
      notify(`History unavailable: ${error.message}`);
    }
  }

  function setIntegrityStatus(text, state) {
    if (!integrityStatus) return;
    integrityStatus.textContent = text;
    integrityStatus.className = `integrity-status ${state || ''}`.trim();
  }

  async function verifyIntegrity() {
    try {
      const events = await getEvents();
      if (!events.length) {
        setIntegrityStatus('No events to verify yet.', 'neutral');
        notify('There is no history to verify yet.');
        return;
      }
      let previousHash = 'GENESIS';
      for (let index = 0; index < events.length; index += 1) {
        const { hash, ...content } = events[index];
        const expected = await hashText(previousHash + JSON.stringify(content));
        if (content.previousHash !== previousHash || hash !== expected) {
          tamperIndex = index;
          renderIntegrityChain(events);
          setIntegrityStatus(`Integrity check failed at event ${index + 1} of ${events.length}.`, 'bad');
          notify('The local history hash chain does not match.');
          return;
        }
        previousHash = hash;
      }
      tamperIndex = null;
      renderIntegrityChain(events);
      setIntegrityStatus(`Integrity check passed for ${events.length} events.`, 'good');
      notify(`Integrity check passed for ${events.length} events.`);
    } catch (error) {
      setIntegrityStatus(`Integrity check unavailable: ${error.message}`, 'bad');
      notify(`Integrity check unavailable: ${error.message}`);
    }
  }

  function simulateTamper() {
    if (!cachedEvents.length) {
      notify('Add an event before simulating a tamper.');
      return;
    }
    tamperIndex = Math.max(0, cachedEvents.length - 2);
    renderIntegrityChain(cachedEvents);
    setIntegrityStatus(`Simulated tamper at event ${tamperIndex + 1}. Display only — stored history is unchanged.`, 'warn');
    notify('Tamper simulated on screen only. Run Verify integrity to restore the green chain.');
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function buildStages(result) {
    const evidence = result.evidence || {};
    const phrases = result.redFlags || evidence.redFlagPhrases || [];
    const stages = [];
    if (result.emergency) {
      stages.push({
        title: 'Emergency phrase scan',
        state: 'OVERRIDE',
        stateClass: 'override',
        rule: `Matched red-flag ${phrases.length === 1 ? 'phrase' : 'phrases'} ${phrases.map(phrase => `<code>${escapeHtml(phrase)}</code>`).join(', ')}. This rule runs first and overrides every category and urgency rule.`,
      });
    } else {
      stages.push({
        title: 'Emergency phrase scan',
        state: 'CLEAR',
        stateClass: '',
        rule: 'No red-flag phrase matched. Continue to category matching. A clear scan is not proof that an enquiry is safe — staff judgement still applies.',
      });
    }
    if (result.emergency) {
      stages.push({
        title: 'Category lock',
        state: 'EMERGENCY',
        stateClass: 'override',
        rule: 'Category is locked to Emergency. Underlying term match is ignored for routing because the emergency route takes precedence.',
      });
    } else {
      stages.push({
        title: 'Category match',
        state: evidence.matchedCategoryTerm ? 'MATCH' : 'DEFAULT',
        stateClass: evidence.matchedCategoryTerm ? 'hit' : 'assumed',
        rule: evidence.matchedCategoryTerm
          ? `First configured term <code>${escapeHtml(evidence.matchedCategoryTerm)}</code> matched. Category: <code>${escapeHtml(result.category)}</code>.`
          : 'No configured category term matched. Default category: <code>General enquiry</code>.',
      });
    }
    stages.push({
      title: 'Priority decision',
      state: result.emergency ? 'OVERRIDE' : evidence.matchedPromptWord ? 'PROMPT REVIEW' : 'ROUTINE',
      stateClass: result.emergency ? 'override' : evidence.matchedPromptWord ? 'assumed' : '',
      rule: result.emergency
        ? 'Emergency wording sets the highest priority and a zero-minute relay target.'
        : evidence.matchedPromptWord
          ? `Prompt-review word <code>${escapeHtml(evidence.matchedPromptWord)}</code> matched. Priority: <code>${escapeHtml(result.priority)}</code>.`
          : 'No prompt-review word matched. Priority: <code>Routine</code>.',
    });
    stages.push({
      title: 'Route and service target',
      state: 'ROUTED',
      stateClass: 'hit',
      rule: `Routing table sends <code>${escapeHtml(result.category)}</code> to <code>${escapeHtml(result.assignee || 'Receptionist')}</code>. Target: <code>${result.slaMinutes === 0 ? 'relay now' : formatDuration((result.slaMinutes || 0) * 60000)}</code>.`,
    });
    stages.push({
      title: 'Human approval gate',
      state: 'GATE',
      stateClass: 'assumed',
      rule: 'A reply draft is prepared for a staff member. Approval records a human decision in the local history; this demo never sends a message.',
    });
    return stages;
  }

  function revealStages(index) {
    stageIndex = Math.max(0, Math.min(index, stageEls.length - 1));
    stageEls.forEach((stage, position) => { stage.hidden = position > stageIndex; });
    const previous = $('#pipeline-prev');
    const next = $('#pipeline-next');
    if (previous) previous.disabled = stageIndex === 0;
    if (next) next.disabled = stageIndex === stageEls.length - 1;
  }

  function animateStages() {
    clearInterval(stageTimer);
    stageEls.forEach(stage => { stage.hidden = true; });
    if (!stageEls.length) return;
    if (reducedMotion) {
      stageEls.forEach(stage => { stage.hidden = false; });
      revealStages(stageEls.length - 1);
      return;
    }
    revealStages(0);
    stageTimer = setInterval(() => {
      if (stageIndex >= stageEls.length - 1) {
        clearInterval(stageTimer);
        return;
      }
      revealStages(stageIndex + 1);
    }, 280);
  }

  function makeEmergencyBox(result, acknowledged) {
    const box = document.createElement('div');
    box.className = 'emergency-box';
    box.setAttribute('role', 'alert');

    const kicker = document.createElement('div');
    kicker.className = 'emergency-kicker';
    kicker.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg> EMERGENCY WORDING DETECTED';
    const call = document.createElement('div');
    call.className = 'call-000';
    call.textContent = 'CALL 000 NOW';
    const copy = document.createElement('p');
    copy.textContent = 'Tell the sender to call 000 now. Do not wait for a reply from the clinic. This demo does not contact the sender or emergency services.';
    const helplines = document.createElement('div');
    helplines.className = 'helplines';
    for (const line of ['Emergency 000', 'Lifeline 13 11 14', 'Healthdirect 1800 022 222']) {
      const chip = document.createElement('span');
      chip.textContent = line;
      helplines.append(chip);
    }
    const triggers = document.createElement('div');
    triggers.className = 'trigger-list';
    for (const phrase of result.triggers || result.redFlags || []) {
      const chip = document.createElement('span');
      chip.className = 'trigger';
      chip.textContent = `Matched: “${phrase}”`;
      triggers.append(chip);
    }
    const actions = document.createElement('div');
    actions.className = 'emergency-actions';
    const read = document.createElement('button');
    read.className = 'button button-danger';
    read.type = 'button';
    read.textContent = 'Read 000 instruction aloud';
    read.addEventListener('click', () => {
      try {
        if (!('speechSynthesis' in window)) {
          notify('Speech synthesis is unavailable in this browser. Read the instruction on screen.');
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance('Immediate danger. Tell the sender to call triple zero now. Do not wait for a reply from the clinic.');
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
        notify('Reading the 000 instruction aloud. Audio is generated locally by your browser.');
      } catch {
        notify('Audio could not start. Read the instruction on screen instead.');
      }
    });
    const copyButton = document.createElement('button');
    copyButton.className = 'button button-quiet';
    copyButton.type = 'button';
    copyButton.textContent = 'Copy 000 instruction';
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(result.reply || 'Please call 000 now.');
        notify('000 instruction copied. Relay it to the sender now.');
      } catch {
        notify('Clipboard access is unavailable. Read the instruction on screen to the sender.');
      }
    });
    actions.append(read, copyButton);

    const ackRow = document.createElement('div');
    ackRow.className = 'ack-row';
    if (acknowledged) {
      const done = document.createElement('span');
      done.className = 'review-note approved';
      done.textContent = 'Acknowledged by staff · recorded in the local history';
      ackRow.append(done);
    } else {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'emergency-ack-check';
      const text = document.createElement('span');
      text.textContent = 'I have read the 000 instruction and will relay it now.';
      label.append(checkbox, text);
      const ackButton = document.createElement('button');
      ackButton.className = 'button button-approve';
      ackButton.type = 'button';
      ackButton.disabled = true;
      ackButton.textContent = 'Acknowledge emergency';
      checkbox.addEventListener('change', () => { ackButton.disabled = !checkbox.checked; });
      ackButton.addEventListener('click', async () => {
        ackButton.disabled = true;
        try {
          const acknowledgedBy = window.prompt('Enter staff name or initials to record the emergency acknowledgement:');
          if (!acknowledgedBy || !acknowledgedBy.trim()) {
            ackButton.disabled = false;
            return;
          }
          if (isStatic) {
            if (!isAcknowledged(loadStaticEvents(), result.id)) {
              await appendStaticEvent({ type: 'emergency_acknowledged', id: result.id, acknowledgedBy: acknowledgedBy.trim() });
            }
          } else {
            await request(`/api/enquiries/${encodeURIComponent(result.id)}/acknowledge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ acknowledgedBy }),
            });
          }
          await loadHistory();
          showResult(result, currentApproved);
          notify('Emergency acknowledgement recorded. Reply draft unlocked.');
        } catch (error) {
          notify(error.message);
          ackButton.disabled = false;
        }
      });
      const locked = document.createElement('span');
      locked.className = 'ack-locked';
      locked.textContent = 'Reply draft stays locked until this is acknowledged.';
      ackRow.append(label, ackButton, locked);
    }
    box.append(kicker, call, copy, helplines, triggers, actions, ackRow);
    return box;
  }

  function showResult(result, approved = false) {
    if (!result || !resultContent) return;
    currentResult = result;
    currentApproved = approved;
    if (emptyState) emptyState.hidden = true;
    resultContent.hidden = false;
    resultContent.replaceChildren();
    clearInterval(stageTimer);

    const badges = document.createElement('div');
    badges.className = 'result-badges';
    for (const [text, type] of [[result.category, ''], [result.priority, result.emergency ? 'emergency' : result.priority === 'Prompt review' ? 'priority' : '']]) {
      const badge = document.createElement('span');
      badge.className = `badge ${type}`.trim();
      badge.textContent = text;
      badges.append(badge);
    }
    resultContent.append(badges);

    const meta = document.createElement('div');
    meta.className = 'result-meta';
    const assigned = document.createElement('span');
    assigned.textContent = `Assigned: ${result.assignee || 'Receptionist'}`;
    const sla = document.createElement('span');
    sla.textContent = slaText(result);
    meta.append(assigned, sla);
    resultContent.append(meta);

    const why = document.createElement('p');
    why.className = 'why';
    const evidence = result.evidence || {};
    if (result.emergency) {
      const phrases = (result.redFlags || evidence.redFlagPhrases || []).join('”, “');
      why.textContent = `Why: red-flag phrase “${phrases}” overrides category and urgency.`;
    } else {
      const parts = [
        evidence.matchedCategoryTerm ? `category term “${evidence.matchedCategoryTerm}”` : 'no category term (default General enquiry)',
        evidence.matchedPromptWord ? `prompt-review word “${evidence.matchedPromptWord}”` : 'no prompt-review word (routine priority)',
      ];
      why.textContent = `Why: ${parts.join('; ')}.`;
    }
    resultContent.append(why);

    if (result.message) {
      const preview = document.createElement('p');
      preview.className = 'message-preview';
      preview.textContent = `Masked message stored locally: ${result.message}`;
      resultContent.append(preview);
    }

    const acknowledged = isAcknowledged(cachedEvents, result.id);
    if (result.emergency) resultContent.append(makeEmergencyBox(result, acknowledged));

    const stages = buildStages(result);
    const list = document.createElement('div');
    list.className = 'stage-list';
    list.setAttribute('aria-label', 'Decision pipeline stages');
    stageEls = stages.map((stage, index) => {
      const item = document.createElement('div');
      item.className = `stage${result.emergency && index === 0 ? ' emergency-stage' : ''}`;
      const number = document.createElement('span');
      number.className = 'stage-num';
      number.textContent = String(index + 1).padStart(2, '0');
      const body = document.createElement('div');
      body.className = 'stage-body';
      const title = document.createElement('div');
      title.className = 'stage-title';
      const name = document.createElement('span');
      name.textContent = stage.title;
      const state = document.createElement('span');
      state.className = `stage-state ${stage.stateClass}`.trim();
      state.textContent = stage.state;
      title.append(name, state);
      const rule = document.createElement('p');
      rule.className = 'stage-rule';
      rule.innerHTML = stage.rule;
      body.append(title, rule);
      item.append(number, body);
      list.append(item);
      return item;
    });
    resultContent.append(list);

    if (result.category === 'Prescription refill') {
      const checklist = document.createElement('div');
      checklist.className = 'identity-checklist';
      const title = document.createElement('strong');
      title.textContent = 'Staff identity checklist · verify before any refill decision';
      const note = document.createElement('p');
      note.textContent = 'Full name, date of birth, Medicare number, medication and dose, and usual GP. The demo does not verify identity or give clinical advice.';
      const listItems = document.createElement('ul');
      for (const item of ['Confirm the sender’s identity using clinic process', 'Confirm the medication and dose against the record', 'Route to the usual GP for a clinical decision']) {
        const entry = document.createElement('li');
        entry.textContent = item;
        listItems.append(entry);
      }
      checklist.append(title, note, listItems);
      resultContent.append(checklist);
    }

    if (pipelineControls) pipelineControls.hidden = false;
    animateStages();

    if (!result.emergency || acknowledged) {
      const label = document.createElement('p');
      label.className = 'decision-label';
      label.textContent = approved ? 'STAFF REPLY · APPROVED, NOT SENT' : 'STAFF REPLY DRAFT · EDIT BEFORE USE';
      const reply = document.createElement('textarea');
      reply.className = 'reply-box';
      reply.value = result.reply;
      reply.setAttribute('aria-label', 'Staff reply draft');
      reply.readOnly = approved;
      const actions = document.createElement('div');
      actions.className = 'reply-actions';
      const note = document.createElement('span');
      note.className = `review-note${approved ? ' approved' : ''}`;
      note.textContent = approved ? 'Approved by staff · recorded in history · not sent' : 'Human approval required before sending';
      actions.append(note);
      if (!approved) {
        const approve = document.createElement('button');
        approve.className = 'button button-approve';
        approve.textContent = 'Approve draft';
        approve.addEventListener('click', async () => {
          const approvedBy = window.prompt('Enter staff name or initials to record approval:');
          if (!approvedBy || !approvedBy.trim()) return;
          approve.disabled = true;
          try {
            if (isStatic) {
              const events = loadStaticEvents();
              if (events.some(item => item.type === 'reply_approved' && item.id === result.id)) {
                throw new Error('This reply is already approved.');
              }
              await appendStaticEvent({ type: 'reply_approved', id: result.id, approvedBy: approvedBy.trim() });
            } else {
              await request(`/api/enquiries/${encodeURIComponent(result.id)}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approvedBy }),
              });
            }
            showResult(result, true);
            await loadHistory();
            notify('Approval recorded. The draft has not been sent.');
          } catch (error) {
            notify(error.message);
            approve.disabled = false;
          }
        });
        actions.append(approve);
      }
      resultContent.append(label, reply, actions);
    } else {
      const locked = document.createElement('p');
      locked.className = 'ack-locked';
      locked.textContent = 'The reply draft is locked until a staff member acknowledges the 000 instruction above.';
      resultContent.append(locked);
    }

    document.dispatchEvent(new CustomEvent('clinic:result', { detail: { result, approved } }));
  }

  async function simulateDay() {
    const confirmed = window.confirm('Add six fictional enquiries to the local history? This does not contact anyone.');
    if (!confirmed) return;
    const messages = [
      'Could I book an appointment for next week?',
      'Please call me today about a repeat prescription.',
      'Could someone explain how I pay this invoice?',
      'Can a staff member call about my blood test results?',
      'I have a question about the clinic car park.',
      'I cannot breathe and need help urgently.',
    ];
    const button = $('#simulate-day');
    if (button) button.disabled = true;
    try {
      for (const message of messages) {
        await createEnquiry(message);
      }
      await loadHistory();
      notify('Six fictional enquiries added. The emergency example is flagged in history.');
    } catch (error) {
      notify(`Simulation stopped: ${error.message}`);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function openOldestEmergency() {
    const events = await getEvents();
    cachedEvents = events;
    const emergency = events.find(event => event.type === 'enquiry_received' && event.emergency && !isAcknowledged(events, event.id));
    if (!emergency) {
      notify('No emergency phrase match is awaiting acknowledgement.');
      return;
    }
    const approved = events.some(event => event.type === 'reply_approved' && event.id === emergency.id);
    showResult({ ...emergency, triggers: emergency.redFlags }, approved);
    const pipeline = $('#pipeline');
    if (pipeline) pipeline.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  // ---------- bindings ----------
  setText('#mode-label', isStatic ? 'STATIC DEMO' : 'SERVER DEMO');
  setText('#storage-note', isStatic
    ? 'Static mode stores events in this browser’s localStorage only. It makes no application network calls.'
    : 'Server mode appends events to the local Node data file. Nothing leaves this machine.');

  if (messageInput) {
    messageInput.addEventListener('input', () => {
      setText('#char-count', `${messageInput.value.length.toLocaleString('en-AU')} / 2,000`);
    });
  }
  document.querySelectorAll('.example').forEach(button => button.addEventListener('click', () => {
    if (!messageInput) return;
    messageInput.value = button.dataset.example;
    messageInput.dispatchEvent(new Event('input'));
    messageInput.focus();
  }));
  const refresh = $('#refresh-history');
  if (refresh) refresh.addEventListener('click', loadHistory);
  const verify = $('#verify-integrity');
  if (verify) verify.addEventListener('click', verifyIntegrity);
  const tamper = $('#simulate-tamper');
  if (tamper) tamper.addEventListener('click', simulateTamper);
  const simulate = $('#simulate-day');
  if (simulate) simulate.addEventListener('click', simulateDay);
  const emergencyOpen = $('#emergency-strip-open');
  if (emergencyOpen) emergencyOpen.addEventListener('click', openOldestEmergency);

  const prev = $('#pipeline-prev');
  if (prev) prev.addEventListener('click', () => { clearInterval(stageTimer); revealStages(stageIndex - 1); });
  const next = $('#pipeline-next');
  if (next) next.addEventListener('click', () => { clearInterval(stageTimer); revealStages(stageIndex + 1); });
  const replay = $('#pipeline-replay');
  if (replay) replay.addEventListener('click', animateStages);

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      try {
        const result = await createEnquiry(messageInput.value);
        showResult(result);
        await loadHistory();
        notify(result.emergency ? 'Emergency wording flagged. Relay the 000 instruction now.' : 'Enquiry triaged and saved to the local history.');
      } catch (error) {
        notify(error.message);
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  updateClock();
  setInterval(updateClock, 30000);

  window.ClinicDesk = {
    isStatic,
    rules,
    config,
    classifier,
    getEvents,
    loadHistory,
    createEnquiry,
    showResult,
    verifyIntegrity,
    simulateTamper,
    simulateDay,
    openOldestEmergency,
    notify,
    formatDuration,
    slaText,
    hashText,
    appendStaticEvent,
    loadStaticEvents,
    getMetrics: () => latestMetrics,
    getEventsCache: () => cachedEvents.slice(),
    getCurrentResult: () => currentResult,
    isAcknowledged,
  };

  loadHistory();
})();
