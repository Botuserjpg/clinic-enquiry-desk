const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { classify, routeEnquiry, maskSensitive } = require('../classifier.js');

const root = path.join(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'rules.json'), 'utf8'));

test('emergency wording overrides appointment and urgency words', () => {
  const result = classify('Urgent appointment today: I cannot breathe.', rules);
  assert.equal(result.category, 'Emergency');
  assert.equal(result.priority, 'Emergency wording');
  assert.deepEqual(result.redFlags, ['cannot breathe']);
});

test('routing and SLA come from the shared rules', () => {
  assert.deepEqual(routeEnquiry(classify('Could I book an appointment?', rules), rules), {
    assignee: 'Receptionist',
    slaMinutes: 480,
  });
  assert.deepEqual(routeEnquiry(classify('I cannot breathe.', rules), rules), {
    assignee: 'Practice Nurse',
    slaMinutes: 0,
  });
});

test('masking removes common structured identifiers but keeps 000', () => {
  const masked = maskSensitive('Call 0412 345 678, email person@example.com, Medicare 1234 56789 0, date 01/02/2026.');
  for (const secret of ['0412 345 678', 'person@example.com', '1234 56789 0', '01/02/2026']) {
    assert.equal(masked.includes(secret), false);
  }
  assert.equal(masked.includes('[phone redacted]'), true);
  assert.equal(masked.includes('[email redacted]'), true);
  assert.equal(masked.includes('[medicare redacted]'), true);
  assert.equal(masked.includes('[date redacted]'), true);
  assert.equal(maskSensitive('Please call 000 now.').includes('000'), true);
});

test('browser rules bundle matches rules.json', () => {
  const text = fs.readFileSync(path.join(root, 'rules.js'), 'utf8');
  const match = text.match(/=\s*(\{.*\});\s*$/s);
  assert.ok(match);
  assert.deepEqual(JSON.parse(match[1]), rules);
});

test('static index has no root-absolute assets', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(/href="\//.test(html), false);
  assert.equal(/src="\//.test(html), false);
  assert.ok(html.includes('config/clinic.js'));
});
