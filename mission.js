(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const roles = ['Receptionist', 'Practice Nurse', 'GP', 'Practice Manager'];
  const priorityColors = { 'Emergency wording': 'var(--red)', 'Prompt review': 'var(--amber)', Routine: 'var(--teal)' };
  const SIM_MESSAGES = [
    'Could I book an appointment for next week?',
    'Please call me today about a repeat prescription.',
    'Can someone explain my invoice?',
    'Could a staff member call about my blood test results?',
    'I have a question about the clinic car park.',
    'I need a repeat script for my blood pressure medication.',
    'I cannot breathe and need help urgently.',
    'Could I reschedule my appointment to Friday?',
  ];

  let events = [];
  let metrics = null;
  let simTimer = null;
  let simRunning = false;
  let simPaused = false;
  let simIndex = 0;
  let demoToken = 0;
  let demoRunning = false;
  let selectedCommand = 0;
  let filteredCommands = [];

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  }

  function textElement(text, attributes = {}) {
    const element = svgElement('text', attributes);
    element.textContent = text;
    return element;
  }

  function formatClock(timestamp) {
    try {
      return new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
    } catch {
      return '—';
    }
  }

  function relativeAge(timestamp) {
    if (!timestamp) return '—';
    const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  }

  function renderSwimlanes() {
    const host = $('#swimlanes');
    if (!host) return;
    host.replaceChildren();
    const roster = (window.CLINIC_CONFIG && window.CLINIC_CONFIG.staffRoster) || [];
    const pending = metrics ? metrics.pending : [];
    for (const role of roles) {
      const lane = document.createElement('div');
      lane.className = 'lane';
      const head = document.createElement('div');
      head.className = 'lane-head';
      const name = document.createElement('strong');
      const staff = roster.find(person => person.role === role);
      name.textContent = staff ? `${role} · ${staff.name.replace('Synthetic ', '')}` : role;
      const count = document.createElement('span');
      const laneEvents = pending.filter(event => (event.assignee || 'Receptionist') === role);
      count.textContent = laneEvents.length;
      head.append(name, count);
      const cards = document.createElement('div');
      cards.className = 'lane-cards';
      if (!laneEvents.length) {
        const empty = document.createElement('p');
        empty.className = 'lane-empty';
        empty.textContent = 'Clear';
        cards.append(empty);
      } else {
        for (const event of laneEvents.slice(0, 4)) {
          const card = document.createElement('div');
          card.className = `enquiry-card${event.emergency ? ' emergency' : event.priority === 'Prompt review' ? ' priority' : ''}`;
          const title = document.createElement('b');
          title.textContent = event.category || 'General enquiry';
          const detail = document.createElement('small');
          detail.textContent = `${event.priority || 'Routine'} · ${relativeAge(event.timestamp)}`;
          card.append(title, detail);
          card.title = `${event.message || 'Synthetic enquiry'} · ${window.ClinicDesk ? window.ClinicDesk.slaText(event) : ''}`;
          cards.append(card);
        }
        if (laneEvents.length > 4) {
          const more = document.createElement('p');
          more.className = 'lane-empty';
          more.textContent = `+${laneEvents.length - 4} more`;
          cards.append(more);
        }
      }
      lane.append(head, cards);
      host.append(lane);
    }
  }

  function renderTimeline() {
    const host = $('#arrival-timeline');
    if (!host) return;
    host.replaceChildren();
    const received = metrics ? metrics.received : [];
    if (!received.length) {
      const empty = document.createElement('p');
      empty.className = 'lane-empty';
      empty.textContent = 'No arrivals yet. Triage an enquiry or start the simulation.';
      host.append(empty);
      return;
    }
    for (const event of [...received].reverse().slice(0, 10)) {
      const row = document.createElement('div');
      row.className = 'timeline-item';
      const time = document.createElement('span');
      time.className = 'timeline-time';
      time.textContent = formatClock(event.timestamp);
      const label = document.createElement('span');
      label.className = 'timeline-label';
      label.textContent = event.category || 'General enquiry';
      const flag = document.createElement('span');
      flag.className = `timeline-flag${event.emergency ? ' emergency' : ''}`;
      flag.textContent = event.emergency ? '000' : event.priority === 'Prompt review' ? 'PROMPT' : 'ROUTINE';
      row.append(time, label, flag);
      host.append(row);
    }
  }

  function renderHeatmap() {
    const chart = $('#chart-heatmap');
    if (!chart) return;
    chart.replaceChildren();
    const counts = Array(24).fill(0);
    for (const event of (metrics ? metrics.received : [])) {
      const date = new Date(event.timestamp);
      if (!Number.isNaN(date.getTime())) counts[date.getHours()] += 1;
    }
    const max = Math.max(1, ...counts);
    const baseY = 92;
    const chartHeight = 64;
    counts.forEach((count, hour) => {
      const height = count ? Math.max(4, (count / max) * chartHeight) : 2;
      const rect = svgElement('rect', {
        x: 6 + hour * 21.2,
        y: baseY - height,
        width: 17,
        height,
        rx: 2,
        fill: count ? 'var(--teal)' : 'var(--line)',
        opacity: count ? 0.35 + (count / max) * 0.65 : 0.6,
      });
      const title = svgElement('title');
      title.textContent = `${String(hour).padStart(2, '0')}:00 · ${count} enquir${count === 1 ? 'y' : 'ies'}`;
      rect.append(title);
      chart.append(rect);
    });
    chart.append(svgElement('line', { x1: 4, y1: baseY + 2, x2: 516, y2: baseY + 2, stroke: 'var(--line)', 'stroke-width': 1 }));
    for (const hour of [0, 6, 12, 18]) {
      chart.append(textElement(String(hour).padStart(2, '0'), { x: 8 + hour * 21.2, y: 108, fill: 'var(--faint)', 'font-size': 8, 'font-family': 'var(--mono)' }));
    }
    chart.append(textElement('local device time', { x: 516, y: 108, 'text-anchor': 'end', fill: 'var(--faint)', 'font-size': 8, 'font-family': 'var(--mono)' }));
    chart.setAttribute('aria-label', `Enquiries by hour of day. ${counts.reduce((sum, value) => sum + value, 0)} total.`);
  }

  function renderDonut() {
    const chart = $('#chart-donut');
    const legend = $('#donut-legend');
    if (!chart || !legend) return;
    chart.replaceChildren();
    legend.replaceChildren();
    const counts = { 'Emergency wording': 0, 'Prompt review': 0, Routine: 0 };
    for (const event of (metrics ? metrics.received : [])) {
      const key = counts[event.priority] === undefined ? 'Routine' : event.priority;
      counts[key] += 1;
    }
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    chart.append(svgElement('circle', { cx: 60, cy: 60, r: radius, fill: 'none', stroke: 'var(--line)', 'stroke-width': 16 }));
    let offset = 0;
    for (const [label, count] of Object.entries(counts)) {
      if (!count) continue;
      const length = (count / Math.max(1, total)) * circumference;
      const circle = svgElement('circle', {
        cx: 60,
        cy: 60,
        r: radius,
        fill: 'none',
        stroke: priorityColors[label],
        'stroke-width': 16,
        'stroke-dasharray': `${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`,
        'stroke-dashoffset': -offset,
        transform: 'rotate(-90 60 60)',
        'stroke-linecap': 'butt',
      });
      chart.append(circle);
      offset += length;
    }
    chart.append(textElement(total ? String(total) : '—', { x: 60, y: 60, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 19, 'font-weight': 700, 'font-family': 'var(--mono)' }));
    chart.append(textElement('total', { x: 60, y: 72, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 7.5, 'font-family': 'var(--mono)' }));
    for (const [label, count] of Object.entries(counts)) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = priorityColors[label];
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('b');
      value.textContent = String(count);
      item.append(dot, name, value);
      legend.append(item);
    }
  }

  function renderAgeing() {
    const chart = $('#chart-ageing');
    if (!chart) return;
    chart.replaceChildren();
    const buckets = [
      { label: '<1h', test: minutes => minutes < 60 },
      { label: '1–4h', test: minutes => minutes >= 60 && minutes < 240 },
      { label: '4–8h', test: minutes => minutes >= 240 && minutes < 480 },
      { label: '8h+', test: minutes => minutes >= 480 },
    ];
    const pending = metrics ? metrics.pending : [];
    const now = Date.now();
    const counts = buckets.map(bucket => pending.filter(event => bucket.test((now - new Date(event.timestamp).getTime()) / 60000)).length);
    const max = Math.max(1, ...counts);
    const colors = ['var(--teal)', 'var(--amber)', 'var(--amber)', 'var(--red)'];
    buckets.forEach((bucket, index) => {
      const height = counts[index] ? Math.max(6, (counts[index] / max) * 74) : 2;
      const x = 32 + index * 120;
      chart.append(svgElement('rect', { x, y: 92 - height, width: 72, height, rx: 3, fill: colors[index], opacity: counts[index] ? 0.85 : 0.25 }));
      chart.append(textElement(String(counts[index]), { x: x + 36, y: 86 - height, 'text-anchor': 'middle', fill: 'var(--ink-soft)', 'font-size': 9, 'font-family': 'var(--mono)' }));
      chart.append(textElement(bucket.label, { x: x + 36, y: 108, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 8.5, 'font-family': 'var(--mono)' }));
    });
    chart.append(svgElement('line', { x1: 20, y1: 94, x2: 500, y2: 94, stroke: 'var(--line)', 'stroke-width': 1 }));
  }

  function renderSlaGauge() {
    const chart = $('#chart-sla');
    if (!chart) return;
    chart.replaceChildren();
    const pending = metrics ? metrics.pending.filter(event => Number.isFinite(event.slaMinutes) && event.slaMinutes > 0) : [];
    const now = Date.now();
    const within = pending.filter(event => now <= new Date(event.timestamp).getTime() + event.slaMinutes * 60000).length;
    const percentage = pending.length ? Math.round((within / pending.length) * 100) : 100;
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    chart.append(svgElement('circle', { cx: 100, cy: 60, r: radius, fill: 'none', stroke: 'var(--line)', 'stroke-width': 13 }));
    const color = percentage >= 80 ? 'var(--green)' : percentage >= 50 ? 'var(--amber)' : 'var(--red)';
    chart.append(svgElement('circle', {
      cx: 100,
      cy: 60,
      r: radius,
      fill: 'none',
      stroke: color,
      'stroke-width': 13,
      'stroke-dasharray': `${(percentage / 100) * circumference} ${circumference}`,
      transform: 'rotate(-90 100 60)',
      'stroke-linecap': 'round',
    }));
    chart.append(textElement(`${percentage}%`, { x: 100, y: 60, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 20, 'font-weight': 700, 'font-family': 'var(--mono)' }));
    chart.append(textElement('within target', { x: 100, y: 72, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 7, 'font-family': 'var(--mono)' }));
    const note = $('#sla-note');
    if (note) note.textContent = pending.length
      ? `${within} of ${pending.length} open enquiries with a positive target are inside the target. Emergencies have a relay-now target and are counted separately.`
      : 'No open enquiries with a positive service target.';
  }

  function renderAssumption() {
    const slider = $('#minutes-per-enquiry');
    const output = $('#minutes-value');
    const result = $('#time-saved');
    if (!slider || !output || !result) return;
    const minutes = Number(slider.value) || 6;
    const count = metrics ? metrics.total : 0;
    const saved = Math.round(count * minutes * 0.4);
    output.textContent = String(minutes);
    result.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = `≈ ${saved.toLocaleString('en-AU')} min`;
    const label = document.createElement('span');
    label.textContent = `estimated staff time saved across ${count.toLocaleString('en-AU')} enquiries`;
    result.append(strong, label);
  }

  function renderWorkload() {
    const chart = $('#chart-workload');
    if (!chart) return;
    chart.replaceChildren();
    const pending = metrics ? metrics.pending : [];
    const counts = roles.map(role => pending.filter(event => (event.assignee || 'Receptionist') === role).length);
    const max = Math.max(1, ...counts);
    const colors = ['var(--teal)', 'var(--blue)', 'var(--violet)', 'var(--amber)'];
    counts.forEach((count, index) => {
      const height = count ? Math.max(6, (count / max) * 78) : 2;
      const x = 36 + index * 122;
      chart.append(svgElement('rect', { x, y: 96 - height, width: 78, height, rx: 3, fill: colors[index], opacity: count ? 0.85 : 0.22 }));
      chart.append(textElement(String(count), { x: x + 39, y: 89 - height, 'text-anchor': 'middle', fill: 'var(--ink-soft)', 'font-size': 10, 'font-family': 'var(--mono)' }));
      chart.append(textElement(roles[index], { x: x + 39, y: 112, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 8, 'font-family': 'var(--mono)' }));
    });
    chart.append(svgElement('line', { x1: 20, y1: 98, x2: 500, y2: 98, stroke: 'var(--line)', 'stroke-width': 1 }));
    chart.setAttribute('aria-label', `Open enquiries by role: ${roles.map((role, index) => `${role} ${counts[index]}`).join(', ')}.`);
  }

  function renderTrend() {
    const host = $('#trend-signals');
    if (!host) return;
    host.replaceChildren();
    const extras = window.ClinicExtras;
    const signals = extras && typeof extras.spikeSignals === 'function' ? extras.spikeSignals(events) : [];
    if (!signals.length) {
      const empty = document.createElement('p');
      empty.className = 'signal-empty';
      empty.textContent = 'No z-score spike or emergency-cluster signal in the current local history. Add examples or run the simulator to populate the trend view. Signals need at least three hourly buckets.';
      host.append(empty);
      return;
    }
    for (const signal of signals.slice(0, 6)) {
      const row = document.createElement('div');
      row.className = `signal ${signal.type === 'symptom-cluster' ? 'cluster' : 'spike'}`;
      const label = document.createElement('b');
      label.textContent = signal.type === 'symptom-cluster' ? 'Emergency cluster' : 'Volume spike';
      const detail = document.createElement('span');
      detail.textContent = signal.type === 'symptom-cluster'
        ? `${signal.note}`
        : `${signal.category} · ${signal.count} in the latest hour · mean ${signal.mean} · z ${signal.z}`;
      row.append(label, detail);
      host.append(row);
    }
    const note = document.createElement('p');
    note.className = 'chart-note';
    note.textContent = `Z-score threshold 2 with a minimum of 3 arrivals in an hour. ${signals.length} signal(s) from ${events.filter(event => event.type === 'enquiry_received').length} local arrivals. Demo signal for manager review only.`;
    host.append(note);
  }

  function renderSimPattern() {
    const host = $('#sim-pattern');
    if (!host) return;
    host.replaceChildren();
    const pattern = [1, 2, 3, 5, 7, 9, 8, 6, 5, 6, 7, 5, 4, 5, 7, 8, 6, 4, 3, 2, 1, 1, 1, 1];
    const max = Math.max(...pattern);
    pattern.forEach((value, hour) => {
      const bar = document.createElement('span');
      bar.style.height = `${Math.max(4, (value / max) * 100)}%`;
      if (value >= max - 1) bar.className = 'peak';
      bar.title = `${String(hour).padStart(2, '0')}:00 · seeded arrival weight ${value}`;
      host.append(bar);
    });
    host.setAttribute('aria-label', 'Seeded hourly arrival pattern: morning peak, lunch lull, afternoon wave.');
  }

  function renderSimLive() {
    const host = $('#sim-live');
    if (!host) return;
    host.replaceChildren();
    const live = metrics || { total: 0, review: 0, emergencyPending: 0, slaBreaches: 0 };
    const cards = [
      ['Open queue', live.review, 'awaiting approval'],
      ['Emergency', live.emergencyPending, 'awaiting acknowledgement'],
      ['SLA breaches', live.slaBreaches, 'computed from timestamps'],
    ];
    for (const [label, value, note] of cards) {
      const article = document.createElement('article');
      article.className = 'metric';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('strong');
      strong.textContent = Number(value || 0).toLocaleString('en-AU');
      const small = document.createElement('small');
      small.textContent = note;
      article.append(span, strong, small);
      host.append(article);
    }
    renderSimCapacity();
  }

  function renderSimCapacity() {
    const host = $('#sim-capacity');
    if (!host) return;
    const value = id => Number((($(id) || {}).value) || 0);
    const reception = value('#staff-reception');
    const nurses = value('#staff-nurses');
    const gps = value('#staff-gps');
    const capacity = reception * 8 + nurses * 5 + gps * 4;
    const open = metrics ? metrics.review : 0;
    const pressure = capacity ? Math.round((open / capacity) * 100) : 100;
    host.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = `${open} open / ${capacity} teaching-model capacity`;
    const note = document.createElement('span');
    note.textContent = ` ${pressure}% pressure. Assumed contacts per fictional shift: receptionist 8, practice nurse 5, GP 4. Adjustable assumption, not a workforce plan.`;
    host.append(strong, note);
  }

  function renderDashboard() {
    renderSwimlanes();
    renderTimeline();
    renderHeatmap();
    renderDonut();
    renderAgeing();
    renderSlaGauge();
    renderWorkload();
    renderTrend();
    renderAssumption();
    renderSimPattern();
    renderSimLive();
  }

  function scrollToDashboard() {
    if (window.ClinicViews) window.ClinicViews.showView('dashboard');
    const dashboard = $('#view-dashboard');
    if (dashboard) dashboard.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  async function triageMessage(message) {
    if (!window.ClinicDesk) throw new Error('The demo core has not loaded.');
    if (window.ClinicViews) window.ClinicViews.showView('inbox');
    const result = await window.ClinicDesk.createEnquiry(message);
    await window.ClinicDesk.loadHistory();
    window.ClinicDesk.showResult(result);
    const pipeline = $('#pipeline');
    if (pipeline) pipeline.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    return result;
  }

  // ---------- live simulation ----------
  function simDelay() {
    const speed = Number(($('#sim-speed') || {}).value) || 3;
    return Math.max(700, Math.round(11000 / speed));
  }

  function updateSimNext() {
    const output = $('#sim-next');
    if (!output) return;
    const speed = Number(($('#sim-speed') || {}).value) || 3;
    if (!simRunning) {
      output.textContent = 'Next arrival: simulation stopped.';
    } else if (simPaused) {
      output.textContent = 'Next arrival: paused.';
    } else {
      output.textContent = `Next arrival: within about ${(simDelay() / 1000).toFixed(1)} s at ${speed}×. Arrival ${simIndex + 1} is next.`;
    }
  }

  function updateSimButtons() {
    const pause = $('#sim-pause');
    const reset = $('#sim-reset');
    const start = $('#sim-start');
    if (pause) {
      pause.hidden = !simRunning;
      pause.textContent = simPaused ? 'Resume simulation' : 'Pause simulation';
    }
    if (reset) reset.hidden = !simRunning;
    if (start) start.textContent = simRunning ? 'Simulation running' : 'Start live simulation';
    const output = $('#sim-speed-value');
    const speed = $('#sim-speed');
    if (output && speed) output.textContent = `${speed.value}×`;
    updateSimNext();
  }

  async function simulationTick() {
    if (!simRunning || simPaused) return;
    const message = SIM_MESSAGES[simIndex % SIM_MESSAGES.length];
    simIndex += 1;
    try {
      await window.ClinicDesk.createEnquiry(message);
      await window.ClinicDesk.loadHistory();
      updateSimNext();
    } catch (error) {
      window.ClinicDesk.notify(`Simulation paused: ${error.message}`);
      stopSimulation();
    }
  }

  function scheduleSimulation() {
    clearInterval(simTimer);
    if (!simRunning || simPaused) return;
    simTimer = setInterval(simulationTick, simDelay());
  }

  function startSimulation() {
    if (!window.ClinicDesk) return;
    if (simRunning) {
      if (simPaused) {
        simPaused = false;
        scheduleSimulation();
        updateSimButtons();
      }
      return;
    }
    simRunning = true;
    simPaused = false;
    simIndex = 0;
    updateSimButtons();
    simulationTick();
    scheduleSimulation();
    window.ClinicDesk.notify('Live simulation started. Every arrival is a fictional enquiry stored locally.');
  }

  function stopSimulation() {
    clearInterval(simTimer);
    simTimer = null;
    simRunning = false;
    simPaused = false;
    updateSimButtons();
  }

  // ---------- command palette ----------
  function commandDefinitions() {
    const view = name => () => { if (window.ClinicViews) window.ClinicViews.showView(name); };
    const commands = [
      { label: 'Go to Inbox', hint: 'NAV', icon: 'i-inbox', run: view('inbox') },
      { label: 'Go to Queue', hint: 'NAV', icon: 'i-list', run: view('queue') },
      { label: 'Go to Dashboard', hint: 'NAV', icon: 'i-grid', run: view('dashboard') },
      { label: 'Go to Simulator', hint: 'NAV', icon: 'i-play', run: view('simulator') },
      { label: 'Go to Rules Lab', hint: 'NAV', icon: 'i-flask', run: view('rules') },
      { label: 'Go to Safety Net', hint: 'NAV', icon: 'i-shield', run: view('safety') },
      { label: 'Go to Prompt Lab', hint: 'NAV', icon: 'i-book', run: view('prompt') },
      { label: 'Go to Settings', hint: 'NAV', icon: 'i-settings', run: view('settings') },
      { label: 'Triage an appointment example', hint: 'INTAKE', icon: 'i-inbox', run: () => { fillMessage('Hi, could I book an appointment next week?'); } },
      { label: 'Triage an emergency example', hint: 'SAFETY', icon: 'i-alert', run: async () => { await triageMessage('I have chest pain and feel short of breath.'); } },
      { label: 'Watch the 60-second auto-demo', hint: 'DEMO', icon: 'i-play', run: startAutoDemo },
      { label: simRunning ? 'Stop live simulation' : 'Start live simulation', hint: 'SIM', icon: 'i-clock', run: () => { simRunning ? stopSimulation() : startSimulation(); } },
      { label: 'Export enquiries as CSV', hint: 'EXPORT', icon: 'i-download', run: () => window.ClinicDesk.exportCsv() },
      { label: 'Export FHIR-shaped JSON', hint: 'EXPORT', icon: 'i-download', run: () => window.ClinicDesk.exportFhir() },
      { label: 'Verify history integrity', hint: 'AUDIT', icon: 'i-shield', run: () => window.ClinicDesk.verifyIntegrity() },
      { label: 'Simulate a tamper (display only)', hint: 'AUDIT', icon: 'i-alert', run: () => window.ClinicDesk.simulateTamper() },
      { label: 'Show onboarding hints again', hint: 'HELP', icon: 'i-spark', run: () => { const button = $('#reset-onboarding'); if (button) button.click(); } },
      { label: 'Open shift handover', hint: 'PAGE', icon: 'i-print', run: () => { window.location.href = 'handover.html'; } },
      { label: 'Open prompt lab', hint: 'PAGE', icon: 'i-spark', run: () => { window.location.href = 'prompt-lab.html'; } },
      { label: 'Open safety case', hint: 'PAGE', icon: 'i-shield', run: () => { window.location.href = 'safety.html'; } },
      { label: 'Open limits', hint: 'PAGE', icon: 'i-shield', run: () => { window.location.href = 'limits.html'; } },
      { label: 'Toggle light / dark theme', hint: 'UI', icon: 'i-sun', run: () => { const button = $('#theme-toggle'); if (button) button.click(); } },
    ];
    const query = ($('#command-input') || {}).value || '';
    if (query.trim().length >= 2 && window.ClinicExtras && window.ClinicDesk) {
      const matches = window.ClinicExtras.searchEnquiries(query, window.ClinicDesk.getEventsCache(), 5);
      for (const match of matches) {
        const preview = match.message.length > 76 ? `${match.message.slice(0, 73)}…` : match.message;
        commands.push({
          label: `Open ${match.id} · ${match.category}: ${preview}`,
          hint: match.emergency ? 'EMERGENCY' : 'ENQUIRY',
          icon: match.emergency ? 'i-alert' : 'i-search',
          run: () => {
            const events = window.ClinicDesk.getEventsCache();
            const enquiry = events.find(event => event.type === 'enquiry_received' && event.id === match.id);
            if (!enquiry) {
              window.ClinicDesk.notify('That enquiry is no longer in the local history. Refresh the queue and try again.');
              return;
            }
            const approved = events.some(event => event.type === 'reply_approved' && event.id === match.id);
            if (window.ClinicViews) window.ClinicViews.showView('inbox');
            window.ClinicDesk.showResult({ ...enquiry, triggers: enquiry.triggers || enquiry.redFlags || [] }, approved);
            const pipeline = $('#pipeline');
            if (pipeline) pipeline.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
          },
        });
      }
    }
    return commands;
  }

  function renderCommands(query = '') {
    const list = $('#command-list');
    if (!list) return;
    const normalized = query.trim().slice(0, 120).toLowerCase();
    filteredCommands = commandDefinitions().filter(command => !normalized || `${command.label} ${command.hint}`.toLowerCase().includes(normalized));
    selectedCommand = Math.min(selectedCommand, Math.max(0, filteredCommands.length - 1));
    list.replaceChildren();
    if (!filteredCommands.length) {
      const item = document.createElement('li');
      item.className = 'command-item';
      item.id = 'command-no-results';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-disabled', 'true');
      item.setAttribute('aria-selected', 'false');
      item.textContent = query.trim().length >= 2
        ? 'No matching command or enquiry. Enquiry search checks this browser’s local history only.'
        : 'No matching command.';
      list.append(item);
      const input = $('#command-input');
      if (input) {
        input.setAttribute('aria-expanded', 'true');
        input.setAttribute('aria-activedescendant', item.id);
      }
      return;
    }
    filteredCommands.forEach((command, index) => {
      const item = document.createElement('li');
      item.className = 'command-item';
      item.id = `command-option-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === selectedCommand));
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.classList.add('icon');
      icon.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${command.icon}`);
      icon.append(use);
      const label = document.createElement('span');
      label.textContent = command.label;
      const hint = document.createElement('small');
      hint.textContent = command.hint;
      item.append(icon, label, hint);
      item.addEventListener('click', () => runCommand(command));
      item.addEventListener('mouseenter', () => {
        selectedCommand = index;
        [...list.children].forEach((child, childIndex) => child.setAttribute('aria-selected', String(childIndex === index)));
        const input = $('#command-input');
        if (input) input.setAttribute('aria-activedescendant', item.id);
      });
      list.append(item);
    });
    const input = $('#command-input');
    if (input) {
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-activedescendant', `command-option-${selectedCommand}`);
    }
  }

  function openPalette() {
    const modal = $('#command-palette');
    if (!modal) return;
    modal.hidden = false;
    selectedCommand = 0;
    const input = $('#command-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    renderCommands('');
  }

  function closePalette() {
    const modal = $('#command-palette');
    if (modal) modal.hidden = true;
    const input = $('#command-input');
    if (input) {
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    const open = $('#command-open');
    if (open) open.focus();
  }

  function runCommand(command) {
    closePalette();
    Promise.resolve(command.run()).catch(error => {
      if (window.ClinicDesk) window.ClinicDesk.notify(error.message);
    });
  }

  function fillMessage(message) {
    const input = $('#message');
    if (!input) return;
    // A command-palette example must reveal the Inbox before touching its
    // hidden input, otherwise the result appears to do nothing.
    if (window.ClinicViews) window.ClinicViews.showView('inbox', { focus: '#message' });
    input.value = message;
    input.dispatchEvent(new Event('input'));
    input.focus({ preventScroll: true });
  }

  // ---------- voice input ----------
  function setupVoice() {
    const button = $('#voice-input');
    const note = $('#voice-note');
    if (!button) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      button.hidden = true;
      if (note) note.textContent = 'Voice input is not available in this browser. Type the fictional message instead.';
      return;
    }
    button.hidden = false;
    if (note) note.textContent = 'Voice input is optional and uses your browser’s speech service. Say fictional text only.';
    let recognition = null;
    button.addEventListener('click', () => {
      try {
        if (recognition) {
          recognition.stop();
          recognition = null;
          button.textContent = 'Voice input';
          return;
        }
        recognition = new Recognition();
        recognition.lang = 'en-AU';
        recognition.interimResults = true;
        recognition.continuous = false;
        button.textContent = 'Listening…';
        recognition.onresult = event => {
          const transcript = [...event.results].map(result => result[0].transcript).join(' ');
          const input = $('#message');
          if (input) {
            input.value = transcript;
            input.dispatchEvent(new Event('input'));
          }
        };
        recognition.onerror = event => {
          if (window.ClinicDesk) window.ClinicDesk.notify(`Voice input stopped: ${event.error || 'unavailable'}.`);
          recognition = null;
          button.textContent = 'Voice input';
        };
        recognition.onend = () => {
          recognition = null;
          button.textContent = 'Voice input';
        };
        recognition.start();
      } catch (error) {
        if (window.ClinicDesk) window.ClinicDesk.notify(`Voice input is unavailable: ${error.message}`);
        button.textContent = 'Voice input';
      }
    });
  }

  // ---------- auto demo ----------
  function demoUi(step, total, caption) {
    const label = $('#demo-step-label');
    const text = $('#demo-caption');
    const bar = $('#demo-progress-bar');
    if (label) label.textContent = `Step ${step} / ${total}`;
    if (text) text.textContent = caption;
    if (bar) bar.style.width = `${Math.round((step / total) * 100)}%`;
  }

  async function demoWait(token, milliseconds) {
    await sleep(milliseconds);
    if (token !== demoToken) throw new Error('demo-cancelled');
  }

  async function startAutoDemo() {
    if (demoRunning) return;
    if (!window.ClinicDesk) return;
    stopSimulation();
    demoRunning = true;
    demoToken += 1;
    const token = demoToken;
    const overlay = $('#demo-overlay');
    if (overlay) overlay.hidden = false;
    const total = 6;
    const steps = [
      {
        caption: '1/6 · A clear emergency. The phrase “chest pain” fires before every other rule. The red panel tells staff to relay the 000 instruction. The reply stays locked until a staff member acknowledges it — this demo deliberately leaves it locked.',
        run: () => triageMessage('I have chest pain and cannot breathe.'),
      },
      {
        caption: '2/6 · A negated emergency. “No chest pain” still contains the phrase “chest pain”, so the literal rule over-triages. That is a known limit, not a diagnosis. Staff judgement decides what to do next.',
        run: () => triageMessage('No chest pain and no shortness of breath — I just need a repeat script.'),
      },
      {
        caption: '3/6 · A benign look-alike. A poster about chest pain awareness is not an emergency, but the phrase rule still flags it. The demo accepts the extra work because missing an emergency is worse.',
        run: () => triageMessage('Could I book the community room? We are running a chest pain awareness poster session.'),
      },
      {
        caption: '4/6 · Multi-intent. This message asks for a script, an appointment and billing help. The classifier reports only the first configured category; a human must handle the rest.',
        run: () => triageMessage('I need a repeat script and an appointment, and could you explain my invoice?'),
      },
      {
        caption: '5/6 · A refill routed to the GP. The structured identifiers are masked before local storage. Staff still verify identity and medication details using the clinic’s normal process — the demo does not give clinical advice.',
        run: () => triageMessage('I need a repeat prescription for my blood pressure medication. My Medicare number is 1234 56789 0 and my phone is 0412 345 678.'),
      },
      {
        caption: '6/6 · The audit chain. Verify integrity checks every stored event. The demo then paints a simulated tamper on screen only, without changing the stored history. Run Verify integrity again to restore the green chain.',
        run: async () => {
          await window.ClinicDesk.verifyIntegrity();
          await demoWait(token, 1300);
          window.ClinicDesk.simulateTamper();
          scrollToDashboard();
        },
      },
    ];

    try {
      for (let index = 0; index < steps.length; index += 1) {
        if (token !== demoToken) return;
        demoUi(index + 1, total, steps[index].caption);
        await steps[index].run();
        if (index < steps.length - 1) await demoWait(token, 5600);
      }
      if (token !== demoToken) return;
      demoUi(total, total, 'Demo complete. The history now holds only fictional examples. Try Verify integrity, the command palette (Ctrl+K), or the shift handover page.');
      await demoWait(token, 4200);
      if (overlay) overlay.hidden = true;
      scrollToDashboard();
      window.ClinicDesk.notify('Auto-demo finished. All examples are fictional and stored locally.');
    } catch (error) {
      if (error.message !== 'demo-cancelled' && window.ClinicDesk) window.ClinicDesk.notify(`Auto-demo stopped: ${error.message}`);
      if (overlay) overlay.hidden = true;
    } finally {
      demoRunning = false;
    }
  }

  function stopAutoDemo() {
    demoToken += 1;
    demoRunning = false;
    const overlay = $('#demo-overlay');
    if (overlay) overlay.hidden = true;
  }

  // ---------- bindings ----------
  document.addEventListener('clinic:updated', event => {
    events = event.detail.events || [];
    metrics = event.detail.metrics || null;
    renderDashboard();
    updateSimButtons();
  });

  const autoDemo = $('#auto-demo');
  if (autoDemo) autoDemo.addEventListener('click', startAutoDemo);
  const demoSkip = $('#demo-skip');
  if (demoSkip) demoSkip.addEventListener('click', stopAutoDemo);
  const demoBackdrop = $('#demo-overlay');
  if (demoBackdrop) demoBackdrop.addEventListener('click', event => { if (event.target === demoBackdrop) stopAutoDemo(); });

  const simStart = $('#sim-start');
  if (simStart) simStart.addEventListener('click', startSimulation);
  const simPause = $('#sim-pause');
  if (simPause) simPause.addEventListener('click', () => {
    simPaused = !simPaused;
    scheduleSimulation();
    updateSimButtons();
  });
  const simReset = $('#sim-reset');
  if (simReset) simReset.addEventListener('click', () => {
    stopSimulation();
    if (window.ClinicDesk) window.ClinicDesk.notify('Live simulation stopped.');
  });
  const simSpeed = $('#sim-speed');
  if (simSpeed) simSpeed.addEventListener('input', () => { updateSimButtons(); scheduleSimulation(); });

  const commandOpen = $('#command-open');
  if (commandOpen) commandOpen.addEventListener('click', openPalette);
  const commandClose = $('#command-close');
  if (commandClose) commandClose.addEventListener('click', closePalette);
  const commandBackdrop = document.querySelector('[data-close-command]');
  if (commandBackdrop) commandBackdrop.addEventListener('click', closePalette);
  const commandInput = $('#command-input');
  if (commandInput) {
    commandInput.placeholder = 'Search commands or local enquiries';
    commandInput.setAttribute('aria-label', 'Search commands or enquiries in local history');
    commandInput.setAttribute('role', 'combobox');
    commandInput.setAttribute('aria-autocomplete', 'list');
    commandInput.setAttribute('aria-expanded', 'false');
    commandInput.removeAttribute('aria-activedescendant');
    commandInput.maxLength = 120;
    commandInput.addEventListener('input', () => { selectedCommand = 0; renderCommands(commandInput.value); });
    commandInput.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedCommand = Math.min(selectedCommand + 1, filteredCommands.length - 1);
        renderCommands(commandInput.value);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedCommand = Math.max(selectedCommand - 1, 0);
        renderCommands(commandInput.value);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (filteredCommands[selectedCommand]) runCommand(filteredCommands[selectedCommand]);
      } else if (event.key === 'Escape') {
        closePalette();
      }
    });
  }
  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const modal = $('#command-palette');
      if (modal && !modal.hidden) closePalette(); else openPalette();
    } else if (event.key === '/' && !typing) {
      event.preventDefault();
      openPalette();
    } else if (event.key === 'Escape') {
      const modal = $('#command-palette');
      if (modal && !modal.hidden) closePalette();
    }
  });

  const minutesSlider = $('#minutes-per-enquiry');
  if (minutesSlider) minutesSlider.addEventListener('input', renderAssumption);

  for (const id of ['#staff-reception', '#staff-nurses', '#staff-gps']) {
    const slider = $(id);
    if (!slider) continue;
    const output = $(`${id}-value`);
    slider.addEventListener('input', () => {
      if (output) output.textContent = slider.value;
      renderSimCapacity();
    });
  }

  document.addEventListener('clinic:view', event => {
    if (event.detail && event.detail.view === 'dashboard') renderDashboard();
    if (event.detail && event.detail.view === 'simulator') renderSimLive();
  });

  setupVoice();
  updateSimButtons();
  renderDashboard();

  if (window.ClinicDesk) window.ClinicDesk.loadHistory();
})();
