(() => {
  'use strict';

  const STORAGE_KEY = 'clinicDeskEventsV1';
  const serverMode = Boolean(window.CLINIC_SERVER_MODE);
  const $ = selector => document.querySelector(selector);

  function toast(message) {
    const element = $('#toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 3500);
  }

  function readStaticEvents() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function getEvents() {
    if (!serverMode) return readStaticEvents();
    const response = await fetch('/api/history');
    if (!response.ok) throw new Error('The local server history could not be read.');
    return response.json();
  }

  function formatTime(timestamp) {
    try {
      return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
    } catch {
      return '—';
    }
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function render(events) {
    const received = events.filter(event => event.type === 'enquiry_received');
    const approved = new Set(events.filter(event => event.type === 'reply_approved').map(event => event.id));
    const acknowledged = new Set(events.filter(event => event.type === 'emergency_acknowledged').map(event => event.id));
    const now = Date.now();
    const pending = received.filter(event => !approved.has(event.id));
    const overdue = pending.filter(event => Number.isFinite(event.slaMinutes) && event.slaMinutes > 0 && event.timestamp && now > new Date(event.timestamp).getTime() + event.slaMinutes * 60000);
    const emergencies = received.filter(event => event.emergency);

    setText('#handover-total', received.length.toLocaleString('en-AU'));
    setText('#handover-emergency', emergencies.length.toLocaleString('en-AU'));
    setText('#handover-overdue', overdue.length.toLocaleString('en-AU'));
    setText('#handover-pending', pending.length.toLocaleString('en-AU'));
    setText('#handover-generated', `Generated ${formatTime(new Date().toISOString())}`);
    setText('#handover-source', serverMode ? 'Source: local Node history file' : 'Source: this browser’s localStorage');
    const clinic = window.CLINIC_CONFIG && window.CLINIC_CONFIG.clinicName;
    if (clinic) setText('#handover-clinic', clinic);

    const list = $('#handover-list');
    if (!list) return;
    list.replaceChildren();
    if (!received.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'No enquiries in the local history yet. Add fictional examples on the dashboard, then return here.';
      list.append(empty);
      return;
    }

    const priority = event => {
      if (event.emergency && !acknowledged.has(event.id)) return 0;
      if (event.emergency) return 1;
      if (overdue.includes(event)) return 2;
      if (!approved.has(event.id)) return 3;
      return 4;
    };
    const rows = [...received].sort((a, b) => priority(a) - priority(b) || new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 30);

    for (const event of rows) {
      const row = document.createElement('div');
      row.className = 'handover-row';
      const time = document.createElement('time');
      time.textContent = formatTime(event.timestamp);
      const description = document.createElement('span');
      const strong = document.createElement('b');
      strong.textContent = event.category || 'General enquiry';
      const detail = document.createElement('span');
      const bits = [event.priority || 'Routine', event.assignee || 'Receptionist'];
      if (approved.has(event.id)) bits.push('approved · not sent');
      else if (overdue.includes(event)) bits.push('overdue');
      else bits.push('awaiting approval');
      detail.textContent = ` · ${bits.join(' · ')}`;
      description.append(strong, detail);
      const flag = document.createElement('span');
      if (event.emergency && !acknowledged.has(event.id)) {
        flag.className = 'flag';
        flag.textContent = '000 · ACK';
      } else if (event.emergency) {
        flag.className = 'flag';
        flag.textContent = '000 · ACKED';
      } else if (approved.has(event.id)) {
        flag.className = 'flag ok';
        flag.textContent = 'APPROVED';
      } else if (overdue.includes(event)) {
        flag.className = 'flag';
        flag.textContent = 'OVERDUE';
      } else {
        flag.className = 'flag ok';
        flag.textContent = 'OPEN';
      }
      row.append(time, description, flag);
      list.append(row);
    }
  }

  async function load() {
    try {
      const events = await getEvents();
      render(events);
      if (new URLSearchParams(window.location.search).get('print') === '1') {
        setTimeout(() => window.print(), 450);
      }
    } catch (error) {
      const list = $('#handover-list');
      if (list) {
        list.replaceChildren();
        const message = document.createElement('p');
        message.className = 'history-empty';
        message.textContent = `Handover unavailable: ${error.message}`;
        list.append(message);
      }
      toast(`Handover unavailable: ${error.message}`);
    }
  }

  const printButton = $('#print-handover');
  if (printButton) printButton.addEventListener('click', () => window.print());

  load();
})();
