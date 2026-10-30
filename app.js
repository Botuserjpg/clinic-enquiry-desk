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
  let memoryEvents = [];

  const form = document.querySelector('#intake-form');
  const messageInput = document.querySelector('#message');
  const resultContent = document.querySelector('#result-content');
  const emptyState = document.querySelector('#empty-state');
  const toast = document.querySelector('#toast');
  const integrityStatus = document.querySelector('#integrity-status');
  const simulateButton = document.querySelector('#simulate-day');
  let toastTimer;

  document.querySelector('#today').textContent = new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short' }).format(new Date());
  document.querySelector('#mode-label').textContent = isStatic ? 'STATIC DEMO' : 'SERVER DEMO';
  document.querySelector('#storage-note').textContent = isStatic
    ? 'Static mode stores events in this browser’s localStorage only. It makes no application network calls.'
    : 'Server mode appends events to the local Node data file. Nothing leaves this machine.';
  if (config.clinicName) {
    const clinicName = document.querySelector('#clinic-name');
    if (clinicName) clinicName.textContent = config.clinicName;
  }

  messageInput.addEventListener('input', () => {
    document.querySelector('#char-count').textContent = `${messageInput.value.length.toLocaleString('en-AU')} / 2,000`;
  });
  document.querySelectorAll('.example').forEach(button => button.addEventListener('click', () => {
    messageInput.value = button.dataset.example;
    messageInput.dispatchEvent(new Event('input'));
    messageInput.focus();
  }));
  document.querySelector('#refresh-history').addEventListener('click', loadHistory);
  document.querySelector('#verify-integrity').addEventListener('click', verifyIntegrity);
  simulateButton.addEventListener('click', simulateDay);

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await createEnquiry(messageInput.value);
      showResult(result);
      await loadHistory();
      notify(result.emergency ? 'Emergency wording flagged. Relay the 000 instruction now.' : 'Enquiry triaged and saved to the local history.');
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
    }
  });

  function formatDuration(milliseconds) {
    const minutes = Math.max(0, Math.round(milliseconds / 60000));
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

  function showResult(result, approved = false) {
    emptyState.hidden = true;
    resultContent.hidden = false;
    resultContent.replaceChildren();

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
      preview.textContent = `Message preview (masked): ${result.message}`;
      resultContent.append(preview);
    }

    if (result.emergency) {
      const alert = document.createElement('div');
      alert.className = 'emergency-box';
      const title = document.createElement('strong');
      title.textContent = 'Tell the sender to call 000 now';
      const copy = document.createElement('p');
      copy.textContent = 'Relay this instruction immediately. This demo does not contact the sender.';
      const triggers = document.createElement('div');
      triggers.className = 'trigger-list';
      for (const phrase of result.triggers || result.redFlags || []) {
        const chip = document.createElement('span');
        chip.className = 'trigger';
        chip.textContent = `Matched: “${phrase}”`;
        triggers.append(chip);
      }
      const copyInstruction = document.createElement('button');
      copyInstruction.className = 'button button-approve copy-instruction';
      copyInstruction.type = 'button';
      copyInstruction.textContent = 'Copy 000 instruction';
      copyInstruction.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(result.reply);
          notify('000 instruction copied. Relay it to the sender now.');
        } catch {
          notify('Clipboard access is unavailable. Read the instruction above to the sender.');
        }
      });
      alert.append(title, copy, triggers, copyInstruction);
      resultContent.append(alert);
    }

    const label = document.createElement('p');
    label.className = 'decision-label';
    label.textContent = 'STAFF REPLY DRAFT · EDIT BEFORE USE';
    const reply = document.createElement('textarea');
    reply.className = 'reply-box';
    reply.value = result.reply;
    reply.setAttribute('aria-label', 'Staff reply draft');
    const actions = document.createElement('div');
    actions.className = 'reply-actions';
    const note = document.createElement('span');
    note.className = 'review-note';
    note.textContent = approved ? 'Approved by staff · recorded in history' : 'Human approval required before sending';
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
  }

  async function loadHistory() {
    try {
      const events = await getEvents();
      const received = events.filter(event => event.type === 'enquiry_received');
      const approvals = new Set(events.filter(event => event.type === 'reply_approved').map(event => event.id));
      document.querySelector('#metric-total').textContent = received.length.toLocaleString('en-AU');
      document.querySelector('#metric-review').textContent = received.filter(event => !approvals.has(event.id)).length.toLocaleString('en-AU');
      document.querySelector('#metric-emergency').textContent = received.filter(event => event.emergency).length.toLocaleString('en-AU');
      const list = document.querySelector('#history-list');
      list.replaceChildren();
      if (!events.length) {
        const empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = 'No activity yet.';
        list.append(empty);
        return;
      }
      for (const event of [...events].reverse().slice(0, 8)) {
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
    } catch (error) {
      notify(`History unavailable: ${error.message}`);
    }
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
          setIntegrityStatus(`Integrity check failed at event ${index + 1} of ${events.length}.`, 'bad');
          notify('The local history hash chain does not match.');
          return;
        }
        previousHash = hash;
      }
      setIntegrityStatus(`Integrity check passed for ${events.length} events.`, 'good');
      notify(`Integrity check passed for ${events.length} events.`);
    } catch (error) {
      setIntegrityStatus(`Integrity check unavailable: ${error.message}`, 'bad');
      notify(`Integrity check unavailable: ${error.message}`);
    }
  }

  function setIntegrityStatus(text, state) {
    integrityStatus.textContent = text;
    integrityStatus.className = `integrity-status ${state || ''}`.trim();
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
    simulateButton.disabled = true;
    try {
      for (const message of messages) {
        await createEnquiry(message);
      }
      await loadHistory();
      notify('Six fictional enquiries added. The emergency example is flagged in history.');
    } catch (error) {
      notify(`Simulation stopped: ${error.message}`);
    } finally {
      simulateButton.disabled = false;
    }
  }

  loadHistory();
})();
