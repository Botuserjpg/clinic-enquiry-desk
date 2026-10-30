#!/usr/bin/env node
/**
 * Headless Chrome smoke check and screenshot capture over the DevTools protocol.
 * No package dependencies. Usage:
 *   node tools/browser_check.mjs --url file:///.../index.html --out docs/screenshots --report docs/browser_check.json
 *   node tools/browser_check.mjs --url http://127.0.0.1:3100/ --server
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const url = option('--url');
const out = option('--out', '');
const reportPath = option('--report', '');
const serverMode = args.includes('--server');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.CDP_PORT || 9333 + Math.floor(Math.random() * 400));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-chrome-'));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
// Some desktop antivirus products inject a script into localhost pages. That
// request comes from the environment, not the app, so it is reported separately.
const isEnvironmentInjection = requestUrl => /(^|\.)kaspersky-labs\.com\//i.test(requestUrl);

if (!url) {
  console.error('Missing --url');
  process.exit(2);
}
if (out) fs.mkdirSync(out, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--remote-allow-origins=*',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--window-size=1440,1000',
  'about:blank',
], { stdio: 'ignore' });

async function waitForChrome() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(150);
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

let socket;
let nextId = 1;
const pending = new Map();
const events = [];
const consoleErrors = [];
const pageExceptions = [];
const requests = [];

function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 30000);
    pending.set(id, {
      resolve: value => { clearTimeout(timeout); resolve(value); },
      reject: error => { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = true) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result.value;
}

async function waitFor(expression, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // Page may still be navigating.
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function screenshot(name) {
  if (!out) return;
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(out, name), Buffer.from(result.data, 'base64'));
}

async function main() {
  await waitForChrome();
  const created = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  const target = await created.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', message => {
    const payload = JSON.parse(message.data);
    if (payload.id && pending.has(payload.id)) {
      const handler = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) handler.reject(new Error(payload.error.message));
      else handler.resolve(payload.result);
      return;
    }
    if (payload.method === 'Runtime.consoleAPICalled' && payload.params.type === 'error') {
      consoleErrors.push(payload.params.args.map(arg => arg.value || arg.description || '').join(' '));
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      pageExceptions.push(payload.params.exceptionDetails.exception?.description || payload.params.exceptionDetails.text);
    }
    if (payload.method === 'Network.requestWillBeSent') {
      requests.push(payload.params.request.url);
    }
    events.push(payload.method);
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete"');
  await waitFor('Boolean(window.ClinicDesk)');

  const initial = await evaluate(`(() => ({
    title: document.title,
    mode: (document.querySelector('#mode-label') || {}).textContent,
    views: document.querySelectorAll('.view').length,
    navItems: document.querySelectorAll('.nav-item').length,
    activeView: (document.querySelector('.nav-item.is-active') || {}).dataset?.view,
    heroRecall: (document.querySelector('#hero-recall') || {}).textContent,
    onboardingVisible: !document.querySelector('#onboarding').hidden,
    emergencyStripHidden: document.querySelector('#emergency-strip').hidden,
    emergencyGate: Boolean(document.querySelector('#emergency-strip')),
    hasSkipLink: Boolean(document.querySelector('.skip-link')),
    localOnly: performance.getEntriesByType('resource').every(entry => entry.name.startsWith('file:') || entry.name.startsWith(location.origin) || /kaspersky-labs\\.com\\//i.test(entry.name)),
  }))()`);

  await screenshot('01-inbox.png');

  const triage = await evaluate(`(async () => {
    const input = document.querySelector('#message');
    input.value = 'Hi, could I book an appointment next week?';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#intake-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const content = document.querySelector('#result-content');
      if (content && !content.hidden && content.textContent.includes('Appointments')) break;
    }
    const content = document.querySelector('#result-content');
    return {
      visible: !content.hidden,
      text: content.textContent.slice(0, 600),
      stages: content.querySelectorAll('.stage').length,
      faq: Boolean(content.querySelector('.faq-box')),
      slots: content.querySelectorAll('.slot-option').length,
      studio: Boolean(content.querySelector('#reply-draft')),
      audit: Boolean(content.querySelector('.enquiry-audit')),
    };
  })()`);
  await screenshot('02-decision-pipeline.png');

  const emergency = await evaluate(`(async () => {
    const input = document.querySelector('#message');
    input.value = 'I have chest pain and cannot breathe.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#intake-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const content = document.querySelector('#result-content');
      if (content && !content.hidden && content.textContent.includes('Emergency')) break;
    }
    const content = document.querySelector('#result-content');
    return {
      emergencyBox: Boolean(content.querySelector('.emergency-box, .emergency-call, .emergency')),
      locked: Boolean(content.querySelector('.ack-locked')),
      stripVisible: !document.querySelector('#emergency-strip').hidden,
      stripCount: (document.querySelector('#emergency-strip-count') || {}).textContent,
      text: content.textContent.slice(0, 500),
    };
  })()`);
  await screenshot('03-emergency-gate.png');

  await evaluate(`(async () => {
    const messages = [
      'Could I book an appointment for next week?',
      'Please call me today about a repeat prescription.',
      'Can someone explain my invoice?',
      'Could a staff member call about my blood test results?',
      'I have a question about the clinic car park.',
      'I need a repeat script for my blood pressure medication.',
      'I cannot breathe and need help urgently.',
      'Could I reschedule my appointment to Friday?',
      'I am furious about the wait. I want to make a complaint.',
      'Hola, could I book an appointment please?',
      'Do you offer telehealth appointments?',
      'I was charged twice for my last visit.',
    ];
    for (const message of messages) await window.ClinicDesk.createEnquiry(message);
    await window.ClinicDesk.loadHistory();
    window.ClinicViews.showView('dashboard');
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  })()`);
  await waitFor('document.querySelector("#view-dashboard").hidden === false');
  await sleep(300);
  const dashboard = await evaluate(`(() => ({
    cards: document.querySelectorAll('#view-dashboard .metric').length,
    swimlanes: document.querySelectorAll('#swimlanes .lane').length,
    timeline: document.querySelectorAll('#arrival-timeline .timeline-item').length,
    workloadBars: document.querySelectorAll('#chart-workload rect').length,
    trend: document.querySelector('#trend-signals').textContent.trim().slice(0, 200),
    total: (document.querySelector('#metric-total') || {}).textContent,
    reviewRate: (document.querySelector('#metric-review-rate') || {}).textContent,
    ack: (document.querySelector('#metric-ack') || {}).textContent,
  }))()`);
  await screenshot('04-dashboard.png');

  await evaluate(`window.ClinicViews.showView('queue'); true`);
  await sleep(350);
  const queue = await evaluate(`(() => ({
    rows: document.querySelectorAll('#queue-list .queue-row').length,
    audits: document.querySelectorAll('#queue-list .queue-audit').length,
    count: (document.querySelector('#nav-queue-count') || {}).textContent,
  }))()`);
  await screenshot('05-queue.png');

  await evaluate(`window.ClinicViews.showView('rules'); document.querySelector('#rules-run').click(); true`);
  await sleep(500);
  const rulesLab = await evaluate(`(() => ({
    gate: document.querySelector('#rules-gate').textContent.trim(),
    gateClass: document.querySelector('#rules-gate').className,
    metrics: document.querySelectorAll('#rules-metrics .rules-metric').length,
    saveDisabled: document.querySelector('#rules-save').disabled,
  }))()`);
  await screenshot('06-rules-lab.png');

  await evaluate(`window.ClinicViews.showView('safety'); true`);
  await sleep(300);
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('[data-redteam]')].find(item => item.dataset.redteam.includes('Ignore previous'));
    button.click();
    return true;
  })()`);
  await sleep(350);
  const safety = await evaluate(`(() => ({
    metricCards: document.querySelectorAll('#safety-metrics .safety-metric').length,
    redteam: document.querySelector('#redteam-result').textContent.trim().slice(0, 400),
    emergencyClass: document.querySelector('#redteam-result').classList.contains('emergency'),
    evalNote: document.querySelector('#safety-eval-note').textContent.trim(),
  }))()`);
  await evaluate(`document.querySelector('#trust-run').click(); true`);
  await waitFor('document.querySelectorAll("#trust-results .trust-result").length >= 6');
  const trustCenter = await evaluate(`(() => ({
    checks: [...document.querySelectorAll('#trust-results .trust-result')].map(row => ({ name: row.querySelector('b').textContent, state: row.querySelector('strong').textContent })),
    hazardLink: Boolean(document.querySelector('.trust-center a[href="docs/safety_hazard_log.md"]')),
    reviewerPath: document.querySelector('.trust-details').textContent.includes('Reviewer’s 5-minute path'),
  }))()`);
  if (trustCenter.checks.some(check => check.state !== 'PASS')) throw new Error(`Trust Center self-test failed: ${JSON.stringify(trustCenter.checks)}`);
  await screenshot('07-safety-net.png');

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const accessibility = await evaluate(`(() => {
    const view = document.querySelector('#view-safety');
    return {
      reducedMotionHonoured: matchMedia('(prefers-reduced-motion: reduce)').matches && parseFloat(getComputedStyle(view).animationDuration) <= 0.00001,
      skipLink: Boolean(document.querySelector('.skip-link')),
      messageLabel: Boolean(document.querySelector('label[for="message"]')),
    };
  })()`);
  await send('Emulation.setEmulatedMedia', { features: [] });
  if (!accessibility.reducedMotionHonoured || !accessibility.skipLink || !accessibility.messageLabel) throw new Error(`Accessibility smoke check failed: ${JSON.stringify(accessibility)}`);

  await evaluate(`window.ClinicViews.showView('simulator'); true`);
  await sleep(250);
  const simulator = await evaluate(`(() => {
    const slider = document.querySelector('#staff-gps');
    slider.value = '3';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      patternBars: document.querySelectorAll('#sim-pattern span').length,
      capacity: document.querySelector('#sim-capacity').textContent.trim(),
      liveCards: document.querySelectorAll('#sim-live .metric').length,
    };
  })()`);
  await screenshot('08-simulator.png');

  const command = await evaluate(`(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 150));
    const input = document.querySelector('#command-input');
    const keyboardFocus = document.activeElement === input;
    input.value = 'dashboard';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      open: !document.querySelector('#command-palette').hidden,
      results: document.querySelectorAll('#command-list .command-item').length,
      first: (document.querySelector('#command-list .command-item') || {}).textContent,
      keyboardFocus,
    };
  })()`);
  await screenshot('09-command-palette.png');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);

  const apiRequests = requests.filter(requestUrl => requestUrl.includes('/api/'));
  const environmentRequests = requests.filter(isEnvironmentInjection);
  const externalRequests = requests.filter(requestUrl => /^https?:/.test(requestUrl)
    && !requestUrl.startsWith(new URL(url).origin)
    && !isEnvironmentInjection(requestUrl));
  const result = {
    url,
    serverMode,
    title: initial.title,
    mode: initial.mode,
    initial,
    triage,
    emergency,
    dashboard,
    queue,
    rulesLab,
    safety,
    trustCenter,
    accessibility,
    simulator,
    command,
    apiRequestCount: apiRequests.length,
    externalRequestCount: externalRequests.length,
    environmentInjectedRequestCount: environmentRequests.length,
    consoleErrors,
    pageExceptions,
    screenshots: out ? fs.readdirSync(out).filter(name => name.endsWith('.png')).sort() : [],
  };
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));

  if (!serverMode && apiRequests.length) throw new Error(`Static mode made ${apiRequests.length} API requests.`);
  if (serverMode && apiRequests.length === 0) throw new Error('Server mode made no API requests.');
  if (externalRequests.length) throw new Error(`Unexpected external requests: ${externalRequests.join(', ')}`);
  if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join(' | ')}`);
  if (pageExceptions.length) throw new Error(`Page exceptions: ${pageExceptions.join(' | ')}`);
  if (!triage.visible || triage.stages < 8 || !triage.studio) throw new Error('Triage pipeline did not render all stages.');
  if (!emergency.locked || !emergency.stripVisible) throw new Error('Emergency gate did not lock the reply.');
  if (!dashboard.cards || dashboard.swimlanes < 4 || !dashboard.workloadBars) throw new Error('Dashboard did not render.');
  if (!queue.rows) throw new Error('Queue did not render rows.');
  if (!rulesLab.gate.toLowerCase().includes('gate')) throw new Error('Rules Lab gate did not run.');
  if (!safety.metricCards || !safety.redteam) throw new Error('Safety Net did not render.');
  if (!simulator.patternBars || !simulator.liveCards) throw new Error('Simulator did not render.');
  if (!command.open || !command.results) throw new Error('Command palette did not render results.');
  if (!command.keyboardFocus || !await evaluate('document.querySelector("#command-palette").hidden')) throw new Error('Keyboard palette open/focus/close check failed.');
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch { /* already closed */ }
  chrome.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
}
