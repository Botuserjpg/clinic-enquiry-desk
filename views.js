(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const VIEWS = {
    inbox: { label: 'Inbox', eyebrow: 'WORKSPACE' },
    queue: { label: 'Queue', eyebrow: 'OPERATIONS' },
    dashboard: { label: 'Dashboard', eyebrow: 'MISSION CONTROL' },
    simulator: { label: 'Simulator', eyebrow: 'CLINIC DAY' },
    rules: { label: 'Rules Lab', eyebrow: 'SAFETY-GATED' },
    safety: { label: 'Safety Net', eyebrow: 'TRUST' },
    prompt: { label: 'Prompt Lab', eyebrow: 'ITERATION' },
    settings: { label: 'Settings', eyebrow: 'LOCAL ONLY' },
  };
  const ONBOARDING_KEY = 'clinicOnboardingDismissedV1';
  const MOTION_KEY = 'clinicReducedMotion';
  const ROLE_KEY = 'clinicStaffRole';
  let currentView = 'inbox';

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* storage can be blocked */ }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch { /* storage can be blocked */ }
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function showView(name, options = {}) {
    const view = VIEWS[name] ? name : 'inbox';
    const alreadyActive = currentView === view;
    currentView = view;
    $$('.view').forEach(section => {
      section.hidden = section.dataset.view !== view;
    });
    $$('.nav-item').forEach(item => {
      const active = item.dataset.view === view && !item.dataset.focus;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    setText('#view-name', VIEWS[view].label);
    setText('#view-eyebrow', VIEWS[view].eyebrow);
    const sidebar = $('#sidebar');
    if (sidebar) sidebar.classList.remove('open');
    const toggle = $('#sidebar-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (window.location.hash !== `#${view}`) {
      try { history.replaceState(null, '', `#${view}`); } catch { /* file:// can reject history */ }
    }
    if (options.focus) {
      const target = $(options.focus);
      if (target) {
        target.focus({ preventScroll: true });
        const bounds = target.getBoundingClientRect();
        const alreadyVisible = bounds.top >= 0 && bounds.bottom <= window.innerHeight;
        if (!alreadyVisible) target.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth', block: 'center' });
      }
    } else if (!alreadyActive && !options.preserveScroll) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    document.dispatchEvent(new CustomEvent('clinic:view', { detail: { view } }));
  }

  function motionReduced() {
    return document.documentElement.dataset.motion === 'reduced'
      || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function setupNavigation() {
    $$('[data-view]').forEach(element => {
      element.addEventListener('click', event => {
        if (element.tagName === 'A') event.preventDefault();
        showView(element.dataset.view, { focus: element.dataset.focus });
      });
    });
    const initial = (window.location.hash || '').replace('#', '');
    // Initialisation can run just after the user starts interacting. Preserve
    // their position so deferred setup cannot yank the page back to the hero.
    if (VIEWS[initial]) showView(initial, { preserveScroll: true });
    else showView('inbox', { preserveScroll: true });
    const toggle = $('#sidebar-toggle');
    const sidebar = $('#sidebar');
    if (toggle && sidebar) {
      toggle.addEventListener('click', () => {
        const open = sidebar.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  // ---------- onboarding ----------
  function setupOnboarding() {
    const panel = $('#onboarding');
    if (!panel) return;
    panel.hidden = storageGet(ONBOARDING_KEY) === 'yes';
    const dismiss = $('#onboarding-dismiss');
    if (dismiss) dismiss.addEventListener('click', () => {
      panel.hidden = true;
      storageSet(ONBOARDING_KEY, 'yes');
    });
    const reset = $('#reset-onboarding');
    if (reset) reset.addEventListener('click', () => {
      storageRemove(ONBOARDING_KEY);
      panel.hidden = false;
      showView('inbox');
      if (window.ClinicDesk) window.ClinicDesk.notify('Onboarding hints are visible again.');
    });
  }

  // ---------- shortcut overlay ----------
  function openShortcuts() {
    const modal = $('#shortcuts-modal');
    if (!modal) return;
    modal.hidden = false;
    const close = $('#shortcuts-close');
    if (close) close.focus();
  }
  function closeShortcuts() {
    const modal = $('#shortcuts-modal');
    if (modal) modal.hidden = true;
    const open = $('#shortcuts-open');
    if (open) open.focus();
  }
  function setupShortcuts() {
    const open = $('#shortcuts-open');
    if (open) open.addEventListener('click', openShortcuts);
    const close = $('#shortcuts-close');
    if (close) close.addEventListener('click', closeShortcuts);
    const backdrop = document.querySelector('[data-close-shortcuts]');
    if (backdrop) backdrop.addEventListener('click', closeShortcuts);
    document.addEventListener('keydown', event => {
      const target = event.target;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (typing) return;
      if (event.key === '?') {
        event.preventDefault();
        openShortcuts();
      } else if (event.key === 'Escape') {
        const modal = $('#shortcuts-modal');
        if (modal && !modal.hidden) closeShortcuts();
      } else if (/^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const names = ['inbox', 'inbox', 'queue', 'dashboard', 'simulator', 'rules', 'safety', 'prompt', 'settings'];
        const name = names[Number(event.key) - 1];
        if (name) {
          event.preventDefault();
          showView(name);
        }
      }
    });
  }

  // ---------- queue ----------
  function latestStatus(events, id) {
    const statuses = events.filter(event => event.type === 'status_changed' && event.id === id);
    return statuses.length ? statuses[statuses.length - 1].status : 'open';
  }
  function approvedFor(events, id) {
    return events.some(event => event.type === 'reply_approved' && event.id === id);
  }
  function acknowledgedFor(events, id) {
    return events.some(event => event.type === 'emergency_acknowledged' && event.id === id);
  }

  function makeTag(text, className = '') {
    const tag = document.createElement('span');
    tag.className = `badge ${className}`.trim();
    tag.textContent = text;
    return tag;
  }

  function auditDetails(events, id) {
    const details = document.createElement('details');
    details.className = 'queue-audit';
    const summary = document.createElement('summary');
    const related = events.filter(event => event.id === id);
    summary.textContent = `Audit trail (${related.length})`;
    const list = document.createElement('ul');
    for (const event of related) {
      const item = document.createElement('li');
      const time = event.timestamp ? new Date(event.timestamp).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
      item.textContent = `${time} · ${String(event.type || 'event').replaceAll('_', ' ')}${event.hash ? ` · ${event.hash.slice(0, 8)}` : ''}`;
      list.append(item);
    }
    details.append(summary, list);
    return details;
  }

  function renderQueue(events) {
    const host = $('#queue-list');
    if (!host) return;
    const filter = ($('#queue-filter') || {}).value || 'all';
    const received = events.filter(event => event.type === 'enquiry_received');
    const filtered = received.filter(event => {
      const status = latestStatus(events, event.id);
      if (filter === 'open') return status !== 'done';
      if (filter === 'done') return status === 'done';
      if (filter === 'emergency') return event.emergency;
      if (filter === 'review') return event.priority === 'Prompt review' || event.emergency;
      return true;
    }).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    setText('#nav-queue-count', received.filter(event => latestStatus(events, event.id) !== 'done').length);
    host.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'queue-empty';
      const strong = document.createElement('strong');
      strong.textContent = received.length ? 'Nothing matches this filter.' : 'The queue is empty.';
      const note = document.createElement('span');
      note.textContent = received.length ? 'Try All or add a fictional enquiry from the Inbox.' : 'Triage a fictional enquiry or start the simulator. Every event stays in this browser.';
      empty.append(strong, note);
      host.append(empty);
      return;
    }
    for (const event of filtered.slice(0, 60)) {
      const status = latestStatus(events, event.id);
      const approved = approvedFor(events, event.id);
      const row = document.createElement('article');
      row.className = `queue-row${event.emergency ? ' emergency' : ''}${status === 'done' ? ' done' : ''}`;
      const time = document.createElement('span');
      time.className = 'queue-time';
      time.textContent = event.timestamp ? new Date(event.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '—';
      const main = document.createElement('div');
      main.className = 'queue-main';
      const title = document.createElement('b');
      title.textContent = event.category || 'General enquiry';
      const message = document.createElement('p');
      message.textContent = event.message || 'Synthetic enquiry';
      const tags = document.createElement('div');
      tags.className = 'queue-tags';
      tags.append(makeTag(event.priority || 'Routine', event.emergency ? 'emergency' : event.priority === 'Prompt review' ? 'priority' : ''));
      if (event.assignee) tags.append(makeTag(event.assignee));
      if (status !== 'open') tags.append(makeTag(status === 'done' ? 'Done' : status));
      if (approved) tags.append(makeTag('Approved · not sent', 'approved-tag'));
      if (event.emergency) tags.append(makeTag(acknowledgedFor(events, event.id) ? 'Acknowledged' : 'Ack needed'));
      main.append(title, message, tags, auditDetails(events, event.id));
      const actions = document.createElement('div');
      actions.className = 'queue-actions-cell';
      const open = document.createElement('button');
      open.className = 'button button-quiet';
      open.type = 'button';
      open.textContent = 'Open';
      open.addEventListener('click', () => {
        if (!window.ClinicDesk) return;
        showView('inbox');
        window.ClinicDesk.showResult({ ...event, triggers: event.redFlags }, approved);
        const pipeline = $('#pipeline');
        if (pipeline) pipeline.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth', block: 'center' });
      });
      const statusButton = document.createElement('button');
      statusButton.className = 'button button-quiet';
      statusButton.type = 'button';
      statusButton.textContent = status === 'done' ? 'Reopen' : 'Mark done';
      statusButton.addEventListener('click', () => {
        if (window.ClinicDesk) window.ClinicDesk.setStatus(event.id, status === 'done' ? 'open' : 'done');
      });
      actions.append(open, statusButton);
      row.append(time, main, actions);
      host.append(row);
    }
  }

  function setupQueue() {
    const filter = $('#queue-filter');
    if (filter) filter.addEventListener('change', () => renderQueue((window.ClinicDesk && window.ClinicDesk.getEventsCache()) || []));
    document.addEventListener('clinic:updated', event => renderQueue(event.detail.events || []));
  }

  // ---------- exports ----------
  function setupExports() {
    for (const selector of ['#export-csv', '#export-csv-2']) {
      const button = $(selector);
      if (button) button.addEventListener('click', () => {
        if (window.ClinicDesk) window.ClinicDesk.exportCsv();
      });
    }
    const fhir = $('#export-fhir');
    if (fhir) fhir.addEventListener('click', () => {
      if (window.ClinicDesk) window.ClinicDesk.exportFhir();
    });
  }

  // ---------- settings ----------
  function setupSettings() {
    const theme = $('#settings-theme');
    if (theme) theme.addEventListener('click', () => {
      const toggle = $('#theme-toggle');
      if (toggle) toggle.click();
    });
    const motion = $('#reduced-motion-toggle');
    const applyMotion = value => {
      document.documentElement.dataset.motion = value ? 'reduced' : 'full';
      if (motion) motion.checked = value;
      storageSet(MOTION_KEY, value ? 'yes' : 'no');
    };
    applyMotion(storageGet(MOTION_KEY) === 'yes');
    if (motion) motion.addEventListener('change', () => {
      applyMotion(motion.checked);
      if (window.ClinicDesk) window.ClinicDesk.notify(motion.checked ? 'Reduced motion enabled.' : 'Motion restored.');
    });

    const notifications = $('#notifications-toggle');
    if (notifications) {
      notifications.addEventListener('change', async () => {
        if (!notifications.checked) return;
        if (!('Notification' in window)) {
          notifications.checked = false;
          if (window.ClinicDesk) window.ClinicDesk.notify('Browser notifications are unavailable here.');
          return;
        }
        try {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            notifications.checked = false;
            if (window.ClinicDesk) window.ClinicDesk.notify('Notification permission was not granted.');
          } else if (window.ClinicDesk) {
            window.ClinicDesk.notify('Notifications enabled. Emergency alerts can now raise one optional browser notification.');
          }
        } catch {
          notifications.checked = false;
        }
      });
    }

    const role = $('#staff-role');
    const storedRole = storageGet(ROLE_KEY);
    if (role && storedRole) role.value = storedRole;
    if (role) role.addEventListener('change', () => {
      storageSet(ROLE_KEY, role.value);
      if (window.ClinicDesk) window.ClinicDesk.setStaffRole(role.value);
      if (window.ClinicDesk) window.ClinicDesk.notify(`Approval role set to ${role.value} for this browser.`);
    });

    const clear = $('#clear-local');
    if (clear) clear.addEventListener('click', () => {
      if (!window.confirm('Remove every synthetic event from this browser? This cannot be undone.')) return;
      if (window.ClinicDesk) window.ClinicDesk.clearLocalData();
      setText('#settings-status', 'Local history cleared.');
    });

    const helplines = $('#helpline-list');
    if (helplines) {
      const config = window.CLINIC_CONFIG || {};
      for (const line of config.helplines || []) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = line.name;
        const number = document.createElement('b');
        number.textContent = line.number;
        item.append(name, number);
        helplines.append(item);
      }
      const tis = config.interpreterService;
      if (tis) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = tis.name;
        const number = document.createElement('b');
        number.textContent = tis.number;
        item.append(name, number);
        helplines.append(item);
      }
    }
  }

  // ---------- hero evaluation number ----------
  function setupHeroNumbers() {
    const metrics = window.CLINIC_EVAL_METRICS;
    if (metrics && metrics.emergency) setText('#hero-recall', `${Math.round(metrics.emergency.recall * 100)}%`);
    if (metrics && metrics.dataset) {
      const note = $('#safety-eval-note');
      if (note) note.textContent = `Source: docs/evaluation_metrics.json · ${metrics.dataset.rows.toLocaleString('en-AU')} synthetic rows · seed ${metrics.dataset.seed} · emergency recall ${(metrics.emergency.recall * 100).toFixed(1)}% · ${metrics.emergency.false_positives} false positives.`;
    }
  }

  function init() {
    setupNavigation();
    setupOnboarding();
    setupShortcuts();
    setupQueue();
    setupExports();
    setupSettings();
    setupHeroNumbers();
    if (window.ClinicDesk) {
      renderQueue(window.ClinicDesk.getEventsCache() || []);
      const role = storageGet(ROLE_KEY);
      if (role) window.ClinicDesk.setStaffRole(role);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.ClinicViews = { showView, currentView: () => currentView };
})();
