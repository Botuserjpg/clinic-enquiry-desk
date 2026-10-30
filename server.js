const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const rules = require('./rules.json');
const extras = require('./extras');
const { classify, routeEnquiry, maskSensitive } = require('./classifier');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 20000;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const dataDirectory = path.join(root, 'data');
const eventFile = process.env.CLINIC_EVENT_FILE
  ? path.resolve(process.env.CLINIC_EVENT_FILE)
  : path.join(dataDirectory, 'events.jsonl');
const eventDirectory = path.dirname(eventFile);
const PRIVATE_RUNTIME_FILES = new Set([
  eventFile,
  path.join(dataDirectory, 'events.jsonl'),
  path.join(dataDirectory, 'generated_enquiries.json'),
].map(file => path.resolve(file)));

// Same fictional matrix as the browser. The server is the enforcement point in
// server mode; the browser copy only produces a friendlier message.
const APPROVAL_ROLES = {
  Emergency: ['Practice Nurse', 'GP', 'Practice Manager'],
  'Prescription refill': ['GP'],
  'Test results': ['Practice Nurse', 'GP'],
  'Complaint / feedback': ['Practice Manager'],
  Billing: ['Receptionist', 'Practice Manager'],
  Appointments: ['Receptionist', 'Practice Manager'],
  'General enquiry': ['Receptionist', 'Practice Manager'],
};
const STAFF_ROLES = ['Receptionist', 'Practice Nurse', 'GP', 'Practice Manager'];
const STATUSES = ['open', 'done', 'snoozed'];
const EMERGENCY_REPLY = 'Please call 000 now. Do not wait for a reply from the clinic.';

function readEvents() {
  try {
    return fs.readFileSync(eventFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function appendEvent(event) {
  fs.mkdirSync(eventDirectory, { recursive: true });
  const events = readEvents();
  const previousHash = events.at(-1)?.hash || 'GENESIS';
  const content = { ...event, previousHash, timestamp: new Date().toISOString() };
  const hash = crypto.createHash('sha256').update(previousHash + JSON.stringify(content)).digest('hex');
  fs.appendFileSync(eventFile, JSON.stringify({ ...content, hash }) + '\n', { encoding: 'utf8', flag: 'a' });
  return { ...content, hash };
}

function securityHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, securityHeaders('application/json; charset=utf-8'));
  response.end(JSON.stringify(body));
}

function sendApiError(response, error) {
  const status = Number.isInteger(error && error.statusCode) ? error.statusCode : 500;
  const message = status < 500 ? error.message : 'The local demo could not complete that request.';
  sendJson(response, status, { error: message });
}

function apiRequestAllowed(request, response) {
  let requestUrl;
  try {
    requestUrl = new URL(`http://${request.headers.host || ''}`);
  } catch {
    sendJson(response, 400, { error: 'Invalid local request host.' });
    return false;
  }
  const address = server.address();
  const allowedHost = ['localhost', '127.0.0.1'].includes(requestUrl.hostname);
  const allowedPort = address && typeof address === 'object' && Number(requestUrl.port) === address.port;
  if (!allowedHost || !allowedPort) {
    sendJson(response, 403, { error: 'The local API only accepts requests addressed to this loopback server.' });
    return false;
  }

  const origin = request.headers.origin;
  if (origin) {
    let originUrl;
    try { originUrl = new URL(origin); } catch { originUrl = null; }
    if (!originUrl || originUrl.protocol !== 'http:' || originUrl.hostname !== requestUrl.hostname || originUrl.port !== requestUrl.port) {
      sendJson(response, 403, { error: 'Cross-origin API requests are not allowed.' });
      return false;
    }
  }
  const fetchSite = request.headers['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    sendJson(response, 403, { error: 'Cross-origin API requests are not allowed.' });
    return false;
  }
  if (request.method === 'POST' && !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    sendJson(response, 415, { error: 'API requests must use application/json.' });
    return false;
  }
  return true;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers['content-length'] || 0);
    if (declared > MAX_BODY_BYTES) {
      const error = new Error('Request is too large.');
      error.statusCode = 413;
      reject(error);
      return;
    }
    let body = '';
    let settled = false;
    request.on('data', chunk => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        settled = true;
        const error = new Error('Request is too large.');
        error.statusCode = 413;
        reject(error);
      }
    });
    request.on('end', () => {
      if (settled) return;
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        const error = new Error('Please send valid JSON.');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function findEnquiry(events, id) {
  return events.find(event => event.id === id && event.type === 'enquiry_received');
}

function handleApi(request, response, pathname) {
  if (!apiRequestAllowed(request, response)) return;
  if (request.method === 'GET' && pathname === '/api/history') {
    sendJson(response, 200, readEvents());
    return;
  }

  if (request.method === 'POST' && pathname === '/api/enquiries') {
    readJson(request).then(({ message }) => {
      if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
        sendJson(response, 400, { error: 'Enter an enquiry of 1 to 2,000 characters.' });
        return;
      }
      const triage = classify(message.trim(), rules);
      triage.triggers = triage.redFlags;
      const routing = routeEnquiry(triage, rules);
      const id = crypto.randomUUID();
      const event = appendEvent({
        type: 'enquiry_received',
        id,
        message: maskSensitive(message.trim()),
        ...triage,
        ...routing,
      });
      sendJson(response, 201, event);
    }).catch(error => sendApiError(response, error));
    return;
  }

  const acknowledgement = pathname.match(/^\/api\/enquiries\/([\w-]+)\/acknowledge$/);
  if (request.method === 'POST' && acknowledgement) {
    readJson(request).then(({ acknowledgedBy }) => {
      if (typeof acknowledgedBy !== 'string' || !acknowledgedBy.trim() || acknowledgedBy.length > 60) {
        sendJson(response, 400, { error: 'Enter a staff name or initials (up to 60 characters).' });
        return;
      }
      const events = readEvents();
      const enquiry = findEnquiry(events, acknowledgement[1]);
      if (!enquiry) { sendJson(response, 404, { error: 'Enquiry not found.' }); return; }
      if (!enquiry.emergency) { sendJson(response, 400, { error: 'Only an emergency phrase match needs this acknowledgement.' }); return; }
      if (events.some(event => event.type === 'emergency_acknowledged' && event.id === acknowledgement[1])) {
        sendJson(response, 409, { error: 'This emergency is already acknowledged.' });
        return;
      }
      const event = appendEvent({ type: 'emergency_acknowledged', id: acknowledgement[1], acknowledgedBy: acknowledgedBy.trim() });
      sendJson(response, 201, event);
    }).catch(error => sendApiError(response, error));
    return;
  }

  const statusRoute = pathname.match(/^\/api\/enquiries\/([\w-]+)\/status$/);
  if (request.method === 'POST' && statusRoute) {
    readJson(request).then(({ status, staffRole }) => {
      if (!STATUSES.includes(status)) {
        sendJson(response, 400, { error: 'Status must be open, done or snoozed.' });
        return;
      }
      if (staffRole !== undefined && !STAFF_ROLES.includes(staffRole)) {
        sendJson(response, 400, { error: 'Unknown staff role.' });
        return;
      }
      const events = readEvents();
      if (!findEnquiry(events, statusRoute[1])) {
        sendJson(response, 404, { error: 'Enquiry not found.' });
        return;
      }
      const event = appendEvent({ type: 'status_changed', id: statusRoute[1], status, changedBy: staffRole || 'Receptionist' });
      sendJson(response, 201, event);
    }).catch(error => sendApiError(response, error));
    return;
  }

  const approval = pathname.match(/^\/api\/enquiries\/([\w-]+)\/approve$/);
  if (request.method === 'POST' && approval) {
    readJson(request).then(payload => {
      const { approvedBy, staffRole = 'Receptionist', replyText = '', tone = 'warm', channel = 'email', faqId = null, slotId = null } = payload;
      if (typeof approvedBy !== 'string' || !approvedBy.trim() || approvedBy.length > 60) {
        sendJson(response, 400, { error: 'Enter a staff name or initials (up to 60 characters).' });
        return;
      }
      if (!STAFF_ROLES.includes(staffRole)) {
        sendJson(response, 400, { error: 'Unknown staff role.' });
        return;
      }
      if (typeof replyText !== 'string' || replyText.length > 4000) {
        sendJson(response, 400, { error: 'Reply text must be 4,000 characters or fewer.' });
        return;
      }
      if (!replyText.trim()) {
        sendJson(response, 400, { error: 'Enter a reply before approval.' });
        return;
      }
      if (!['warm', 'formal', 'brief'].includes(tone) || !['email', 'sms'].includes(channel)) {
        sendJson(response, 400, { error: 'Unknown tone or channel.' });
        return;
      }
      if (channel === 'sms' && replyText.length > 320) {
        sendJson(response, 400, { error: 'The SMS draft is over 320 characters.' });
        return;
      }
      if (extras.medicalAdviceHits(replyText).length) {
        sendJson(response, 400, { error: 'Approval blocked: the draft contains medical-advice wording.' });
        return;
      }
      const events = readEvents();
      const enquiry = findEnquiry(events, approval[1]);
      if (!enquiry) { sendJson(response, 404, { error: 'Enquiry not found.' }); return; }
      const allowed = APPROVAL_ROLES[enquiry.category] || ['Receptionist'];
      if (!allowed.includes(staffRole)) {
        sendJson(response, 403, { error: `${staffRole} cannot approve a ${enquiry.category} reply in this demo.` });
        return;
      }
      if (enquiry.emergency && !events.some(event => event.type === 'emergency_acknowledged' && event.id === approval[1])) {
        sendJson(response, 409, { error: 'Acknowledge the 000 instruction before approving the emergency reply.' });
        return;
      }
      if (enquiry.emergency && replyText.trim() !== EMERGENCY_REPLY) {
        sendJson(response, 400, { error: 'Emergency approval must keep the fixed 000 instruction unchanged.' });
        return;
      }
      if (events.some(event => event.type === 'reply_approved' && event.id === approval[1])) {
        sendJson(response, 409, { error: 'This reply is already approved.' });
        return;
      }
      if (slotId !== null && (typeof slotId !== 'string' || slotId.length > 120)) {
        sendJson(response, 400, { error: 'Unknown appointment slot.' });
        return;
      }
      if (slotId && events.some(event => event.type === 'appointment_booked' && event.slotId === slotId)) {
        sendJson(response, 409, { error: 'That slot is already booked. Choose another slot or handle it manually.' });
        return;
      }
      const event = appendEvent({
        type: 'reply_approved',
        id: approval[1],
        approvedBy: approvedBy.trim(),
        staffRole,
        replyText: maskSensitive(replyText),
        tone,
        channel,
        faqId,
        slotId,
      });
      if (slotId) {
        appendEvent({ type: 'appointment_booked', id: approval[1], slotId, bookedBy: approvedBy.trim() });
      }
      sendJson(response, 201, event);
    }).catch(error => sendApiError(response, error));
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
}

function resolveStaticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const requested = decoded === '/' ? '/index.html' : decoded;
  const filePath = path.resolve(root, `.${requested}`);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) return null;
  if (PRIVATE_RUNTIME_FILES.has(filePath)) return null;
  const relative = path.relative(root, filePath);
  if (relative.split(path.sep).some(part => part.startsWith('.') && part !== '.well-known')) return null;
  return filePath;
}

const server = http.createServer((request, response) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname.startsWith('/api/')) return handleApi(request, response, pathname);
    if (pathname === '/server-mode.js') {
      response.writeHead(200, securityHeaders('text/javascript; charset=utf-8'));
      response.end('window.CLINIC_SERVER_MODE = true;\n');
      return;
    }
    const filePath = resolveStaticFile(pathname);
    if (!filePath) {
      response.writeHead(403, securityHeaders('text/plain; charset=utf-8')).end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(404, securityHeaders('text/plain; charset=utf-8')).end('Not found');
        return;
      }
      // The marker tells the shared browser code to use the Node API instead of static storage.
      const body = path.extname(filePath) === '.html'
        ? content.toString('utf8').replace('</head>', '<script src="/server-mode.js"></script></head>')
        : content;
      response.writeHead(200, securityHeaders(mimeTypes[path.extname(filePath)] || 'application/octet-stream'));
      response.end(body);
    });
  } catch {
    if (response.destroyed || response.headersSent) {
      response.destroy();
      return;
    }
    sendJson(response, 500, { error: 'The local demo could not process that request.' });
  }
});

if (require.main === module) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Invalid PORT. Choose a whole number from 1 to 65535.');
    process.exitCode = 1;
  } else {
    server.on('error', error => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Stop the other server or choose a different PORT.`);
      } else {
        console.error(`The local demo could not start: ${error.message}`);
      }
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`Clinic Enquiry Desk running at http://localhost:${port}`));
  }
}

module.exports = { server, APPROVAL_ROLES, STAFF_ROLES, STATUSES, readEvents, appendEvent, resolveStaticFile };
