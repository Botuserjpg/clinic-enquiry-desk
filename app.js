(() => {
  'use strict';

  const config = window.CLINIC_CONFIG || {};
  const classifier = window.ClinicClassifier;
  const knowledge = window.ClinicKnowledge;
  const extras = window.ClinicExtras;
  const faq = window.CLINIC_FAQ || [];
  const params = new URLSearchParams(window.location.search);
  const forcedMode = params.get('mode');
  // Static is the default for file:// and GitHub Pages. The Node server injects a marker.
  const isStatic = forcedMode === 'static' || (forcedMode !== 'server' && !window.CLINIC_SERVER_MODE);
  const STORAGE_KEY = 'clinicDeskEventsV1';
  const RULES_KEY = 'clinicRulesOverrideV1';
  const ROLE_KEY = 'clinicStaffRole';
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
  let staffRole = 'Receptionist';
  let rules = window.CLINIC_RULES;

  // A saved Rules Lab draft is local to this browser. Keep it behind a try/catch.
  try {
    const storedRules = window.localStorage.getItem(RULES_KEY);
    if (storedRules) {
      const parsed = JSON.parse(storedRules);
      if (parsed && Array.isArray(parsed.redFlags) && Array.isArray(parsed.categories)) rules = parsed;
    }
  } catch {
    // A blocked or corrupt override must not stop the demo.
  }
  try {
    const storedRole = window.localStorage.getItem(ROLE_KEY);
    if (storedRole) staffRole = storedRole;
  } catch {
    // Keep the default role.
  }

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

  function notify(message, options = {}) {
    if (!toast) return;
    toast.replaceChildren();
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(text);
    if (typeof options.undo === 'function') {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'toast-undo';
      undo.textContent = options.undoLabel || 'Undo';
      undo.addEventListener('click', () => {
        toast.classList.remove('show');
        Promise.resolve(options.undo()).catch(error => notify(error.message));
      });
      toast.append(undo);
    }
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), options.duration || 4200);
  }

  function notifyBrowser(title, body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      new Notification(title, { body, tag: 'clinic-emergency' });
    } catch {
      // Optional feature; never block the workflow.
    }
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
    const ackTimes = events.filter(event => event.type === 'emergency_acknowledged').map(event => {
      const enquiry = received.find(item => item.id === event.id);
      if (!enquiry || !enquiry.timestamp) return null;
      return new Date(event.timestamp).getTime() - new Date(enquiry.timestamp).getTime();
    }).filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    const medianAck = ackTimes.length ? ackTimes[Math.floor((ackTimes.length - 1) / 2)] : null;
    const reviewRows = received.filter(event => event.priority === 'Prompt review' || event.emergency);
    return {
      total: received.length,
      review: pending.length,
      emergency: received.filter(event => event.emergency).length,
      emergencyPending: emergencyPending.length,
      slaBreaches: overdue.length,
      approvals: approvals.length,
      medianTtfp: median,
      medianAck,
      reviewRate: received.length ? reviewRows.length / received.length : null,
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
    setText('#metric-review-rate', metrics.reviewRate === null ? '—' : `${(metrics.reviewRate * 100).toFixed(1)}%`);
    setText('#metric-ack', metrics.medianAck === null ? '—' : formatDuration(metrics.medianAck));

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

  // Server and browser use the same fictional permission matrix. The server is
  // still the enforcement point in server mode.
  const APPROVAL_ROLES = {
    Emergency: ['Practice Nurse', 'GP', 'Practice Manager'],
    'Prescription refill': ['GP'],
    'Test results': ['Practice Nurse', 'GP'],
    'Complaint / feedback': ['Practice Manager'],
    Billing: ['Receptionist', 'Practice Manager'],
    Appointments: ['Receptionist', 'Practice Manager'],
    'General enquiry': ['Receptionist', 'Practice Manager'],
  };

  function canApprove(category, role) {
    return (APPROVAL_ROLES[category] || ['Receptionist']).includes(role);
  }

  function setStaffRole(role) {
    staffRole = role || 'Receptionist';
    try { window.localStorage.setItem(ROLE_KEY, staffRole); } catch { /* optional */ }
  }

  function latestStatusOf(events, id) {
    const statuses = events.filter(event => event.type === 'status_changed' && event.id === id);
    return statuses.length ? statuses[statuses.length - 1].status : 'open';
  }

  function bookedSlotIds(events) {
    return events.filter(event => event.type === 'appointment_booked').map(event => event.slotId);
  }

  function downloadFile(filename, content, type) {
    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`${filename} exported locally.`);
    } catch (error) {
      notify(`Export failed: ${error.message}`);
    }
  }

  async function exportCsv() {
    try {
      const events = await getEvents();
      downloadFile('clinic-enquiries.csv', extras.toCsv(events), 'text/csv;charset=utf-8');
    } catch (error) {
      notify(`CSV export unavailable: ${error.message}`);
    }
  }

  async function exportFhir() {
    try {
      const events = await getEvents();
      const received = events.filter(event => event.type === 'enquiry_received');
      const bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        timestamp: new Date().toISOString(),
        meta: { tag: [{ system: 'https://example.invalid/demo', code: 'illustrative-not-validated', display: 'Illustrative FHIR-shaped export; not validated' }] },
        entry: received.flatMap(event => extras.toFhir(event, config).entry),
      };
      downloadFile('clinic-enquiries-fhir-shaped.json', JSON.stringify(bundle, null, 2), 'application/json');
    } catch (error) {
      notify(`FHIR-shaped export unavailable: ${error.message}`);
    }
  }

  async function setStatus(id, status) {
    if (!['open', 'done', 'snoozed'].includes(status)) throw new Error('Unknown status.');
    const events = await getEvents();
    const previous = latestStatusOf(events, id);
    if (previous === status) return;
    if (isStatic) {
      await appendStaticEvent({ type: 'status_changed', id, status, changedBy: staffRole });
    } else {
      await request(`/api/enquiries/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, staffRole }),
      });
    }
    await loadHistory();
    notify(`Enquiry marked ${status}. The change is in the audit chain.`, {
      undo: () => setStatus(id, previous),
      undoLabel: 'Undo',
    });
  }

  function setRules(nextRules) {
    if (!nextRules || !Array.isArray(nextRules.redFlags) || !Array.isArray(nextRules.categories)) throw new Error('Rules are not valid.');
    rules = nextRules;
    try { window.localStorage.setItem(RULES_KEY, JSON.stringify(nextRules)); } catch { /* optional */ }
    document.dispatchEvent(new CustomEvent('clinic:rules', { detail: { rules } }));
  }

  function clearLocalData() {
    memoryEvents = [];
    cachedEvents = [];
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(RULES_KEY);
    } catch { /* optional */ }
    renderHistory([]);
    renderIntegrityChain([]);
    updateMetrics(computeMetrics([]));
    notify('Local synthetic history cleared from this browser.');
  }

  function faqAnswer(message) {
    if (!knowledge || !Array.isArray(faq) || !faq.length) return null;
    try {
      return knowledge.answer(message, faq, Number(config.faqMatchThreshold) || 1.2);
    } catch {
      return null;
    }
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

  function buildStages(result, context = {}) {
    const evidence = result.evidence || {};
    const phrases = result.redFlags || evidence.redFlagPhrases || [];
    const stages = [];
    const faqMatch = context.faqMatch || null;
    const slots = context.slots || [];
    stages.push({
      title: 'Intake',
      state: 'RECEIVED',
      stateClass: 'hit',
      rule: `Message received as a local event (<code>${escapeHtml(String(result.id || '').slice(0, 8) || 'new')}</code>). Length ${String(result.message || '').length} characters. Nothing leaves this browser in static mode.`,
    });
    stages.push({
      title: 'Privacy mask',
      state: 'MASKED',
      stateClass: 'hit',
      rule: 'Structured identifiers (phone, email, Medicare-shaped number, date) are replaced before local storage. The masked preview is shown below. Free-text names are not reliably detectable; staff must still avoid real patient data.',
    });
    stages.push({
      title: 'Understand',
      state: evidence.matchedCategoryTerm ? 'MATCH' : 'DEFAULT',
      stateClass: evidence.matchedCategoryTerm ? 'hit' : 'assumed',
      rule: evidence.matchedCategoryTerm
        ? `First configured term <code>${escapeHtml(evidence.matchedCategoryTerm)}</code> matched. Category: <code>${escapeHtml(result.category)}</code>. Tone: <code>${escapeHtml(evidence.toneLabel || 'calm')}</code>${evidence.language ? `; language cue: <code>${escapeHtml(evidence.language)}</code>` : ''}.`
        : `No configured category term matched. Default category: <code>General enquiry</code>. Tone: <code>${escapeHtml(evidence.toneLabel || 'calm')}</code>${evidence.language ? `; language cue: <code>${escapeHtml(evidence.language)}</code>` : ''}.`,
    });
    if (result.emergency) {
      stages.push({
        title: 'Safety check',
        state: 'OVERRIDE',
        stateClass: 'override',
        rule: `Matched red-flag ${phrases.length === 1 ? 'phrase' : 'phrases'} ${phrases.map(phrase => `<code>${escapeHtml(phrase)}</code>`).join(', ')}. This rule runs first and overrides category, tone, complaint, language and injection rules. ${evidence.injectionDetected ? 'Injection text was also detected and is shown to staff, but cannot downgrade this result.' : ''}`,
      });
    } else {
      const extra = [];
      if ((evidence.negatedRedFlags || []).length) extra.push(`Negated phrase still matched: <code>${escapeHtml(evidence.negatedRedFlags.join(', '))}</code>.`);
      if (evidence.injectionDetected) extra.push(`Injection phrase detected: <code>${escapeHtml((evidence.injectionPhrases || []).join(', '))}</code>. It is evidence only, not an instruction.`);
      stages.push({
        title: 'Safety check',
        state: 'CLEAR',
        stateClass: '',
        rule: `No red-flag phrase matched. A clear scan is not proof that an enquiry is safe — staff judgement still applies. ${extra.join(' ')}`,
      });
    }
    stages.push({
      title: 'Route',
      state: 'ROUTED',
      stateClass: 'hit',
      rule: `Routing table sends <code>${escapeHtml(result.category)}</code> to <code>${escapeHtml(result.assignee || 'Receptionist')}</code>. ${result.category === 'Complaint / feedback' ? 'Complaint routing always goes to the Practice Manager.' : ''}${evidence.interpreterSuggested ? ' Interpreter may be needed; use the configured TIS number, never auto-translate clinical content.' : ''}`,
    });
    stages.push({
      title: 'SLA clock',
      state: result.slaMinutes === 0 ? 'RELAY NOW' : 'TIMER',
      stateClass: result.slaMinutes === 0 ? 'override' : 'assumed',
      rule: result.slaMinutes === 0
        ? 'Emergency wording sets a zero-minute relay target. The clock is not a substitute for calling 000.'
        : `Target: <code>${formatDuration((result.slaMinutes || 0) * 60000)}</code>. ${result.timestamp ? slaText(result) : 'The timer starts when the event is stored.'}`,
    });
    const draftBits = [];
    if (faqMatch && faqMatch.best) {
      draftBits.push(faqMatch.lowMatch
        ? `FAQ best match <code>${escapeHtml(faqMatch.best.entry.id)}</code> scored <code>${faqMatch.score}</code>, below the configured threshold. It is sent to human review rather than asserted.`
        : `Draft cites FAQ <code>${escapeHtml(faqMatch.best.entry.id)}</code> (“${escapeHtml(faqMatch.best.entry.question)}”) at BM25 score <code>${faqMatch.score}</code>.`);
    }
    if (slots.length) draftBits.push(`${slots.length} synthetic appointment slot(s) suggested from the local calendar.`);
    stages.push({
      title: 'Draft reply',
      state: result.emergency ? '000 TEMPLATE' : 'DRAFTED',
      stateClass: result.emergency ? 'override' : 'hit',
      rule: result.emergency
        ? 'The 000 template is fixed. No tone selector, FAQ answer, appointment slot or staff edit can replace the emergency wording.'
        : `A staff-editable draft is prepared. ${draftBits.join(' ') || 'No FAQ or appointment suggestion applies.'}`,
    });
    stages.push({
      title: 'Human approval gate',
      state: 'GATE',
      stateClass: 'assumed',
      rule: `Allowed approvers for <code>${escapeHtml(result.category)}</code>: ${(APPROVAL_ROLES[result.category] || ['Receptionist']).map(role => `<code>${escapeHtml(role)}</code>`).join(', ')}. Approval records a human decision in the local history; this demo never sends a message.${result.emergency ? ' The reply stays locked until the emergency is acknowledged.' : ''}`,
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
    for (const line of (config.helplines || [])) {
      if (!line || !line.name || !line.number) continue;
      const chip = document.createElement('span');
      chip.textContent = `${line.name} ${line.number}`;
      chip.title = line.comment || 'Verify before real use.';
      chip.setAttribute('aria-label', `${line.name}, ${line.number}. ${line.comment || 'Verify before real use.'}`);
      helplines.append(chip);
    }
    const verifyHelplines = document.createElement('p');
    verifyHelplines.className = 'chart-note';
    verifyHelplines.textContent = 'Configured helpline details are synthetic. Verify before real use.';
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
    box.append(kicker, call, copy, helplines, verifyHelplines, triggers, actions, ackRow);
    return box;
  }

  function defaultDraft(result, faqMatch) {
    if (result.emergency) return result.reply || 'Please call 000 now. Do not wait for a reply from the clinic.';
    let text = result.reply || '';
    if (faqMatch && faqMatch.best && !faqMatch.lowMatch) {
      text += `\n\n${faqMatch.best.entry.answer}\n\nSource: ${faqMatch.best.entry.question} (FAQ ${faqMatch.best.entry.id}, BM25 score ${faqMatch.score}).`;
    }
    return text;
  }

  function infoBox(title, text, className = '') {
    const box = document.createElement('div');
    box.className = `info-box ${className}`.trim();
    const strong = document.createElement('strong');
    strong.textContent = title;
    const copy = document.createElement('p');
    copy.textContent = text;
    box.append(strong, copy);
    return box;
  }

  function makeDiff(host, template, edited) {
    host.replaceChildren();
    if (!extras) return;
    for (const part of extras.diffWords(template, edited)) {
      if (!part.text.trim()) {
        host.append(document.createTextNode(part.text));
        continue;
      }
      const span = document.createElement('span');
      span.className = part.type === 'add' ? 'diff-add' : part.type === 'del' ? 'diff-del' : 'diff-same';
      span.textContent = part.text;
      host.append(span);
    }
  }

  function showResult(result, approved = false) {
    if (!result || !resultContent) return;
    currentResult = result;
    currentApproved = approved;
    if (emptyState) emptyState.hidden = true;
    const skeleton = $('#pipeline-skeleton');
    if (skeleton) skeleton.hidden = true;
    resultContent.hidden = false;
    resultContent.replaceChildren();
    clearInterval(stageTimer);

    const evidence = result.evidence || {};
    const events = cachedEvents.slice();
    const acknowledged = isAcknowledged(events, result.id);
    const faqMatch = result.emergency ? null : faqAnswer(result.message || '');
    const slots = result.category === 'Appointments' && extras
      ? extras.generateSlots({ now: new Date(), config, bookedSlotIds: bookedSlotIds(events), limit: 3 })
      : [];

    const badges = document.createElement('div');
    badges.className = 'result-badges';
    const badgeValues = [
      [result.category, result.emergency ? 'emergency' : ''],
      [result.priority, result.emergency ? 'emergency' : result.priority === 'Prompt review' ? 'priority' : ''],
      [`Tone: ${evidence.toneLabel || 'calm'}`, evidence.toneLabel === 'angry' ? 'emergency' : evidence.toneLabel === 'frustrated' ? 'priority' : ''],
      [result.assignee || 'Receptionist', ''],
    ];
    if (evidence.language) badgeValues.push([`Language cue: ${evidence.language}`, 'priority']);
    if (evidence.interpreterSuggested) badgeValues.push(['Interpreter may be needed', 'priority']);
    if (evidence.injectionDetected) badgeValues.push(['Injection text detected', 'emergency']);
    if (evidence.negatedRedFlags && evidence.negatedRedFlags.length) badgeValues.push(['Negated phrase matched', 'priority']);
    if (result.category === 'Complaint / feedback') badgeValues.push(['Practice Manager', 'priority']);
    for (const [text, type] of badgeValues) {
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
    const status = document.createElement('span');
    status.textContent = `Status: ${approved ? 'approved, not sent' : latestStatusOf(events, result.id)}`;
    meta.append(assigned, sla, status);
    resultContent.append(meta);

    const why = document.createElement('p');
    why.className = 'why';
    if (result.emergency) {
      const phrases = (result.redFlags || evidence.redFlagPhrases || []).join('”, “');
      why.textContent = `Why: red-flag phrase “${phrases}” overrides category, tone, language, complaint and urgency.`;
    } else {
      const parts = [
        evidence.matchedCategoryTerm ? `category term “${evidence.matchedCategoryTerm}”` : 'no category term (default General enquiry)',
        evidence.matchedPromptWord ? `prompt-review word “${evidence.matchedPromptWord}”` : 'no prompt-review word (routine priority)',
        evidence.toneLabel && evidence.toneLabel !== 'calm' ? `tone ${evidence.toneLabel}` : null,
        evidence.injectionDetected ? 'injection evidence shown, not obeyed' : null,
      ].filter(Boolean);
      why.textContent = `Why: ${parts.join('; ')}.`;
    }
    resultContent.append(why);

    if (result.message) {
      const preview = document.createElement('p');
      preview.className = 'message-preview';
      preview.textContent = `Masked message stored locally: ${result.message}`;
      resultContent.append(preview);
    }

    if (extras && result.message) {
      const duplicate = extras.findDuplicate(result.message, events, result.id);
      if (duplicate) {
        const warning = infoBox('Possible duplicate enquiry', `This text exactly matches an earlier enquiry (${duplicate.id}). Check the earlier record before taking action. This warning does not change category, priority or emergency handling.`, 'duplicate-warning');
        warning.setAttribute('role', 'status');
        resultContent.append(warning);
      }
    }

    if (result.emergency) resultContent.append(makeEmergencyBox(result, acknowledged));
    if (evidence.interpreterSuggested) {
      const service = config.interpreterService;
      const serviceNote = service && service.number
        ? `Use ${service.name || 'the configured interpreter service'} on ${service.number}. ${service.comment || 'Verify before real use.'}`
        : 'No interpreter service is configured. Follow the clinic process and verify contact details before real use.';
      resultContent.append(infoBox('Interpreter may be needed', `A non-English greeting or phrase was detected. Offer a plain-English reply and ask whether an interpreter is wanted. ${serviceNote} Never auto-translate clinical content.`, 'priority-box'));
    }
    if (result.category === 'Complaint / feedback') {
      resultContent.append(infoBox('Complaint / feedback handling', `Tone score ${evidence.toneScore || 0} (${evidence.toneLabel || 'calm'}). This raises review priority but never lowers an emergency. Route to the Practice Manager and use the complaint reply template.`, 'priority-box'));
    }
    if (evidence.injectionDetected) {
      resultContent.append(infoBox('Integrity check', `Injection-style phrase(s) detected: ${(evidence.injectionPhrases || []).join(', ')}. The text is treated as untrusted content, shown to staff and never obeyed. Emergency wording still wins.`, 'priority-box'));
    }

    if (faqMatch && faqMatch.best) {
      const faqBox = document.createElement('div');
      faqBox.className = `faq-box${faqMatch.lowMatch ? ' low' : ''}`;
      const heading = document.createElement('strong');
      heading.textContent = faqMatch.lowMatch ? 'FAQ match below threshold · human review' : `FAQ answer · ${faqMatch.best.entry.id}`;
      const answer = document.createElement('p');
      answer.textContent = faqMatch.best.entry.answer;
      const citation = document.createElement('small');
      citation.textContent = `Source: “${faqMatch.best.entry.question}” · BM25 score ${faqMatch.score}${faqMatch.lowMatch ? ' · below configured threshold' : ''}. This is a fictional clinic FAQ, not medical advice.`;
      faqBox.append(heading, answer, citation);
      resultContent.append(faqBox);
    }

    if (slots.length) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'slot-picker';
      const legend = document.createElement('legend');
      legend.textContent = 'Synthetic appointment slots · optional';
      fieldset.append(legend);
      const noneLabel = document.createElement('label');
      noneLabel.className = 'slot-option';
      const none = document.createElement('input');
      none.type = 'radio';
      none.name = `appt-slot-${result.id}`;
      none.value = '';
      none.checked = true;
      const noneText = document.createElement('span');
      noneText.textContent = 'No slot · handle manually';
      noneLabel.append(none, noneText);
      fieldset.append(noneLabel);
      for (const slot of slots) {
        const label = document.createElement('label');
        label.className = 'slot-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `appt-slot-${result.id}`;
        radio.value = slot.slotId;
        radio.dataset.slotLabel = slot.label;
        const text = document.createElement('span');
        text.textContent = slot.label;
        label.append(radio, text);
        fieldset.append(label);
      }
      const note = document.createElement('p');
      note.className = 'chart-note';
      note.textContent = 'Approval books the selected slot. A second approval for the same slot is blocked and tested.';
      fieldset.append(note);
      resultContent.append(fieldset);
    }

    const stages = buildStages(result, { faqMatch, slots });
    const list = document.createElement('div');
    list.className = 'stage-list';
    list.setAttribute('aria-label', 'Decision pipeline stages');
    stageEls = stages.map((stage, index) => {
      const item = document.createElement('div');
      item.className = `stage${result.emergency && index === 3 ? ' emergency-stage' : ''}`;
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

    if (extras && result.message) {
      const counterfactual = extras.counterfactuals(result.message, rules, classifier.classify);
      const changed = counterfactual.results.filter(item => item.changed);
      const details = document.createElement('details');
      details.className = 'counterfactual-box';
      const summary = document.createElement('summary');
      summary.textContent = 'What would change this result?';
      const intro = document.createElement('p');
      intro.className = 'chart-note';
      intro.textContent = 'Each probe removes or negates one matched phrase and re-runs the same local classifier.';
      details.append(summary, intro);
      if (changed.length) {
        const items = document.createElement('ul');
        for (const item of changed.slice(0, 6)) {
          const entry = document.createElement('li');
          entry.textContent = `${item.label} → ${item.category} · ${item.priority}${item.emergency ? ' · still emergency' : ''}`;
          items.append(entry);
        }
        details.append(items);
      } else {
        const none = document.createElement('p');
        none.className = 'chart-note';
        none.textContent = 'No matched phrase produced a different category or priority in this probe.';
        details.append(none);
      }
      resultContent.append(details);
    }

    if (pipelineControls) pipelineControls.hidden = false;
    animateStages();

    const audit = document.createElement('details');
    audit.className = 'enquiry-audit';
    const auditSummary = document.createElement('summary');
    auditSummary.textContent = `Audit trail for this enquiry (${events.filter(event => event.id === result.id).length})`;
    const auditList = document.createElement('ul');
    for (const event of events.filter(event => event.id === result.id)) {
      const item = document.createElement('li');
      item.textContent = `${event.timestamp ? new Date(event.timestamp).toLocaleString('en-AU') : '—'} · ${String(event.type || 'event').replaceAll('_', ' ')}${event.hash ? ` · ${event.hash.slice(0, 10)}` : ''}`;
      auditList.append(item);
    }
    audit.append(auditSummary, auditList);
    resultContent.append(audit);

    if (!result.emergency || acknowledged) {
      const label = document.createElement('p');
      label.className = 'decision-label';
      label.textContent = approved ? 'STAFF REPLY · APPROVED, NOT SENT' : 'REPLY STUDIO · EDIT BEFORE USE';
      resultContent.append(label);

      const studio = document.createElement('div');
      studio.className = 'reply-studio';
      const controls = document.createElement('div');
      controls.className = 'studio-controls';
      const toneLabel = document.createElement('label');
      toneLabel.textContent = 'Tone';
      const toneSelect = document.createElement('select');
      toneSelect.id = 'reply-tone';
      for (const [value, text] of [['warm', 'Warm'], ['formal', 'Formal'], ['brief', 'Brief']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        toneSelect.append(option);
      }
      toneLabel.append(toneSelect);
      const channelLabel = document.createElement('label');
      channelLabel.textContent = 'Channel';
      const channelSelect = document.createElement('select');
      channelSelect.id = 'reply-channel';
      for (const [value, text] of [['email', 'Email'], ['sms', 'SMS (320 chars)']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        channelSelect.append(option);
      }
      channelLabel.append(channelSelect);
      controls.append(toneLabel, channelLabel);
      studio.append(controls);

      const textarea = document.createElement('textarea');
      textarea.className = 'reply-box';
      textarea.id = 'reply-draft';
      textarea.value = defaultDraft(result, faqMatch);
      textarea.setAttribute('aria-label', 'Staff reply draft');
      textarea.readOnly = approved || result.emergency;
      const template = textarea.value;
      studio.append(textarea);

      const measures = document.createElement('div');
      measures.className = 'studio-measures';
      const readability = document.createElement('span');
      readability.id = 'readability-score';
      const advice = document.createElement('span');
      advice.id = 'advice-status';
      const smsCount = document.createElement('span');
      smsCount.id = 'sms-count';
      measures.append(readability, advice, smsCount);
      studio.append(measures);

      const diffLabel = document.createElement('p');
      diffLabel.className = 'decision-label';
      diffLabel.textContent = 'DIFF · TEMPLATE VS YOUR EDIT';
      const diff = document.createElement('div');
      diff.className = 'reply-diff';
      diff.id = 'reply-diff';
      studio.append(diffLabel, diff);

      const actions = document.createElement('div');
      actions.className = 'reply-actions';
      const note = document.createElement('span');
      note.className = `review-note${approved ? ' approved' : ''}`;
      note.textContent = approved ? 'Approved by staff · recorded in history · not sent' : 'Human approval required before sending';
      actions.append(note);

      let approveButton = null;
      const roleSelect = document.createElement('select');
      roleSelect.className = 'settings-select';
      roleSelect.id = 'approval-role';
      roleSelect.setAttribute('aria-label', 'Approval role');
      for (const role of ['Receptionist', 'Practice Nurse', 'GP', 'Practice Manager']) {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role;
        roleSelect.append(option);
      }
      roleSelect.value = staffRole;
      roleSelect.disabled = approved;
      actions.append(roleSelect);

      if (!approved) {
        approveButton = document.createElement('button');
        approveButton.className = 'button button-approve';
        approveButton.type = 'button';
        approveButton.textContent = 'Approve draft';
        actions.append(approveButton);
      }

      function refreshStudio() {
        const value = textarea.value;
        const readabilityValue = extras ? extras.readability(value) : { score: 0, grade: 'Unavailable', words: 0 };
        readability.textContent = `Readability: ${readabilityValue.score} (${readabilityValue.grade}) · ${readabilityValue.words} words`;
        const hits = extras ? extras.medicalAdviceHits(value) : [];
        advice.textContent = hits.length ? `Blocked medical-advice wording: ${hits.join(', ')}` : 'Medical-advice blocklist: clear';
        advice.className = hits.length ? 'blocked' : 'clear';
        const isSms = channelSelect.value === 'sms';
        smsCount.textContent = isSms ? `SMS: ${value.length} / 320 characters` : 'Channel: email';
        smsCount.className = isSms && value.length > 320 ? 'blocked' : '';
        if (approveButton) {
          const blocked = hits.length > 0 || (isSms && value.length > 320);
          approveButton.disabled = blocked;
          approveButton.title = blocked ? 'Resolve the blocklist or SMS length first.' : 'Record human approval. Nothing is sent.';
        }
        makeDiff(diff, template, value);
      }

      toneSelect.addEventListener('change', () => {
        if (approved) return;
        if (extras) {
          const variants = extras.replyVariants({ result, faqEntry: faqMatch && faqMatch.best && !faqMatch.lowMatch ? faqMatch.best.entry : null, config });
          textarea.value = variants[toneSelect.value] || textarea.value;
        }
        refreshStudio();
      });
      channelSelect.addEventListener('change', () => {
        if (channelSelect.value === 'sms' && textarea.value.length > 320 && extras) {
          const variants = extras.replyVariants({ result, faqEntry: faqMatch && faqMatch.best && !faqMatch.lowMatch ? faqMatch.best.entry : null, config });
          textarea.value = variants.brief;
          toneSelect.value = 'brief';
          notify('Draft shortened to the brief SMS variant. Edit it before approval.');
        }
        refreshStudio();
      });
      textarea.addEventListener('input', refreshStudio);
      roleSelect.addEventListener('change', () => setStaffRole(roleSelect.value));

      if (approveButton) {
        approveButton.addEventListener('click', async () => {
          const role = roleSelect.value;
          setStaffRole(role);
          const value = textarea.value.trim();
          if (!value) { notify('Write or generate a reply before approval.'); return; }
          if (result.emergency && value !== defaultDraft(result, null)) {
            notify('Emergency approval must keep the fixed 000 instruction unchanged.');
            return;
          }
          if (extras && extras.medicalAdviceHits(value).length) { notify('Approval blocked: the draft contains medical-advice wording.'); return; }
          if (channelSelect.value === 'sms' && value.length > 320) { notify('Approval blocked: the SMS draft is over 320 characters.'); return; }
          if (!canApprove(result.category, role)) {
            notify(`${role} cannot approve a ${result.category} reply in this demo. Change the approval role or route it to ${(APPROVAL_ROLES[result.category] || ['Receptionist']).join(' / ')}.`);
            return;
          }
          const freshEvents = await getEvents();
          if (result.emergency && !isAcknowledged(freshEvents, result.id)) {
            notify('Acknowledge the 000 instruction before approving the emergency reply.');
            return;
          }
          const selected = document.querySelector(`input[name="appt-slot-${CSS.escape(result.id)}"]:checked`);
          const slotId = selected && selected.value ? selected.value : null;
          if (slotId && bookedSlotIds(freshEvents).includes(slotId)) {
            notify('That slot is already booked. Choose another slot or handle it manually.');
            return;
          }
          const approvedBy = window.prompt('Enter staff name or initials to record approval:');
          if (!approvedBy || !approvedBy.trim()) return;
          approveButton.disabled = true;
          try {
            if (isStatic) {
              if (freshEvents.some(item => item.type === 'reply_approved' && item.id === result.id)) throw new Error('This reply is already approved.');
              await appendStaticEvent({
                type: 'reply_approved',
                id: result.id,
                approvedBy: approvedBy.trim(),
                staffRole: role,
                replyText: classifier.maskSensitive(value),
                tone: toneSelect.value,
                channel: channelSelect.value,
                faqId: faqMatch && faqMatch.best ? faqMatch.best.entry.id : null,
                slotId,
              });
              if (slotId) {
                const latestEvents = loadStaticEvents();
                if (bookedSlotIds(latestEvents).includes(slotId)) throw new Error('That slot was booked a moment ago. Choose another slot.');
                await appendStaticEvent({ type: 'appointment_booked', id: result.id, slotId, bookedBy: approvedBy.trim(), slotLabel: selected.dataset.slotLabel || slotId });
              }
            } else {
              await request(`/api/enquiries/${encodeURIComponent(result.id)}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approvedBy, staffRole: role, replyText: value, tone: toneSelect.value, channel: channelSelect.value, faqId: faqMatch && faqMatch.best ? faqMatch.best.entry.id : null, slotId }),
              });
            }
            showResult(result, true);
            await loadHistory();
            notify(slotId ? 'Approval recorded and the selected synthetic slot is booked. Nothing was sent.' : 'Approval recorded. The draft has not been sent.');
          } catch (error) {
            notify(error.message);
            if (approveButton) approveButton.disabled = false;
          }
        });
      }

      studio.append(actions);
      resultContent.append(studio);
      refreshStudio();
      if (result.emergency) {
        const lock = document.createElement('p');
        lock.className = 'ack-locked';
        lock.textContent = 'Emergency template is fixed. Tone and FAQ controls cannot replace the 000 wording.';
        resultContent.append(lock);
      }
    } else {
      const locked = document.createElement('p');
      locked.className = 'ack-locked';
      locked.textContent = 'The reply draft is locked until a staff member acknowledges the 000 instruction above.';
      resultContent.append(locked);
    }

    if (result.emergency) {
      notifyBrowser('Emergency wording detected', 'Open Clinic Mission Control and relay the 000 instruction. This is a synthetic demo.');
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

  const messageError = $('#message-error');
  function setMessageError(text) {
    if (!messageError) return;
    messageError.textContent = text || '';
    messageError.hidden = !text;
    if (messageInput) messageInput.setAttribute('aria-invalid', text ? 'true' : 'false');
  }
  if (messageInput) {
    let pointerScrollPosition = null;
    messageInput.addEventListener('pointerdown', () => {
      pointerScrollPosition = window.scrollY;
    }, { passive: true });
    messageInput.addEventListener('blur', () => { pointerScrollPosition = null; });
    const restoreMessagePointerPosition = () => {
      if (pointerScrollPosition === null) return;
      const beforeFocus = pointerScrollPosition;
      pointerScrollPosition = null;
      requestAnimationFrame(() => {
        if (document.activeElement !== messageInput || Math.abs(window.scrollY - beforeFocus) < 2) return;
        const root = document.documentElement;
        const previousBehaviour = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        window.scrollTo({ top: beforeFocus, behavior: 'instant' });
        root.style.scrollBehavior = previousBehaviour;
      });
    };
    messageInput.addEventListener('focus', restoreMessagePointerPosition);
    messageInput.addEventListener('pointerup', restoreMessagePointerPosition);
    messageInput.addEventListener('input', () => {
      setText('#char-count', `${messageInput.value.length.toLocaleString('en-AU')} / 2,000`);
      if (messageInput.value.trim()) setMessageError('');
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
      const value = String(messageInput ? messageInput.value : '').trim();
      if (!value) {
        setMessageError('Enter a fictional enquiry before triaging.');
        if (messageInput) messageInput.focus();
        return;
      }
      if (value.length > 2000) {
        setMessageError('Keep the message under 2,000 characters.');
        if (messageInput) messageInput.focus();
        return;
      }
      setMessageError('');
      const button = form.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      const skeleton = $('#pipeline-skeleton');
      if (emptyState) emptyState.hidden = true;
      if (resultContent) resultContent.hidden = true;
      if (skeleton) skeleton.hidden = false;
      try {
        const result = await createEnquiry(value);
        showResult(result);
        await loadHistory();
        notify(result.emergency ? 'Emergency wording flagged. Relay the 000 instruction now.' : 'Enquiry triaged and saved to the local history.');
      } catch (error) {
        notify(error.message);
        if (emptyState) emptyState.hidden = false;
      } finally {
        if (skeleton) skeleton.hidden = true;
        if (button) button.disabled = false;
      }
    });
  }

  updateClock();
  setInterval(updateClock, 30000);

  window.ClinicDesk = {
    isStatic,
    get rules() { return rules; },
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
    notifyBrowser,
    formatDuration,
    slaText,
    hashText,
    appendStaticEvent,
    loadStaticEvents,
    getMetrics: () => latestMetrics,
    getEventsCache: () => cachedEvents.slice(),
    getCurrentResult: () => currentResult,
    isAcknowledged,
    exportCsv,
    exportFhir,
    setStatus,
    setRules,
    setStaffRole,
    clearLocalData,
    faqAnswer,
    bookedSlotIds,
    latestStatusOf,
    canApprove,
    getStaffRole: () => staffRole,
  };

  loadHistory();
})();
