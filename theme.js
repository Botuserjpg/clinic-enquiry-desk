(function () {
  'use strict';

  const KEY = 'clinicTheme';
  const root = document.documentElement;

  function readTheme() {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Storage can be blocked; the dark default still works.
    }
    return root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = next;
    const button = document.querySelector('#theme-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(next === 'light'));
      button.setAttribute('aria-label', next === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
      button.title = next === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
    }
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // A blocked storage API must not break the theme toggle.
    }
  }

  // Apply the stored theme before the rest of the page paints.
  applyTheme(readTheme());

  // A manifest link over file:// produces a CORS console error in Chrome, so add
  // it only when the page is actually served. The PWA still works on Pages.
  try {
    if (window.location.protocol !== 'file:' && !document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = 'manifest.webmanifest';
      document.head.append(manifest);
    }
  } catch {
    // A missing manifest must not block the demo.
  }

  function bindToggle() {
    const button = document.querySelector('#theme-toggle');
    if (!button) return;
    // Refresh the accessible label now that the button exists in the DOM.
    applyTheme(root.dataset.theme);
    button.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
    });
  }

  function registerServiceWorker() {
    // Static hosting only. file:// cannot register a service worker, and the
    // Node demo does not need one. Failures are intentionally silent.
    if (!('serviceWorker' in navigator)) return;
    // HTTPS only: this avoids caching the Node server's injected marker on localhost.
    if (window.location.protocol !== 'https:') return;
    try {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }, { once: true });
    } catch {
      // Feature detection above covers the normal cases.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindToggle, { once: true });
  } else {
    bindToggle();
  }
  registerServiceWorker();
})();
