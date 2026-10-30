const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const rules = require('./rules.json');
const { classify, routeEnquiry, maskSensitive } = require('./classifier');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
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
const eventFile = path.join(dataDirectory, 'events.jsonl');

function readEvents() {
  try {
    return fs.readFileSync(eventFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function appendEvent(event) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const events = readEvents();
  const previousHash = events.at(-1)?.hash || 'GENESIS';
  const content = { ...event, previousHash, timestamp: new Date().toISOString() };
  const hash = crypto.createHash('sha256').update(previousHash + JSON.stringify(content)).digest('hex');
  fs.appendFileSync(eventFile, JSON.stringify({ ...content, hash }) + '\n', { encoding: 'utf8', flag: 'a' });
  return { ...content, hash };
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 20000) reject(new Error('Request is too large.'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Please send valid JSON.')); }
    });
    request.on('error', reject);
  });
}

function handleApi(request, response, pathname) {
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
    }).catch(error => sendJson(response, 400, { error: error.message }));
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
      const enquiry = events.find(event => event.id === acknowledgement[1] && event.type === 'enquiry_received');
      if (!enquiry) { sendJson(response, 404, { error: 'Enquiry not found.' }); return; }
      if (!enquiry.emergency) { sendJson(response, 400, { error: 'Only an emergency phrase match needs this acknowledgement.' }); return; }
      if (events.some(event => event.type === 'emergency_acknowledged' && event.id === acknowledgement[1])) {
        sendJson(response, 409, { error: 'This emergency is already acknowledged.' });
        return;
      }
      const event = appendEvent({ type: 'emergency_acknowledged', id: acknowledgement[1], acknowledgedBy: acknowledgedBy.trim() });
      sendJson(response, 201, event);
    }).catch(error => sendJson(response, 400, { error: error.message }));
    return;
  }
  const approval = pathname.match(/^\/api\/enquiries\/([\w-]+)\/approve$/);
  if (request.method === 'POST' && approval) {
    readJson(request).then(({ approvedBy }) => {
      if (typeof approvedBy !== 'string' || !approvedBy.trim() || approvedBy.length > 60) {
        sendJson(response, 400, { error: 'Enter a staff name or initials (up to 60 characters).' });
        return;
      }
      const events = readEvents();
      const enquiry = events.find(event => event.id === approval[1] && event.type === 'enquiry_received');
      if (!enquiry) { sendJson(response, 404, { error: 'Enquiry not found.' }); return; }
      if (events.some(event => event.type === 'reply_approved' && event.id === approval[1])) {
        sendJson(response, 409, { error: 'This reply is already approved.' });
        return;
      }
      const event = appendEvent({ type: 'reply_approved', id: approval[1], approvedBy: approvedBy.trim() });
      sendJson(response, 201, event);
    }).catch(error => sendJson(response, 400, { error: error.message }));
    return;
  }
  sendJson(response, 404, { error: 'Not found.' });
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
  if (pathname.startsWith('/api/')) return handleApi(request, response, pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(root, requested);
  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    // The marker tells the shared browser code to use the Node API instead of static storage.
    const body = path.extname(filePath) === '.html'
      ? content.toString('utf8').replace('</head>', '<script>window.CLINIC_SERVER_MODE=true;</script></head>')
      : content;
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`Clinic Enquiry Desk running at http://localhost:${port}`));
