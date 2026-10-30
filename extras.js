(function (root) {
  'use strict';

  // Pure, testable helpers used by the UI. No network calls and no model API.

  const MEDICAL_ADVICE_BLOCKLIST = [
    'you should take',
    'you must take',
    'take two',
    'take 2',
    'increase your dose',
    'decrease your dose',
    'stop taking',
    'dosage',
    'diagnosis is',
    'you have an infection',
    'prescribe you',
    'medical advice',
    'it is safe to',
    'no need to see a doctor',
  ];

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function counterfactuals(message, rules, classify) {
    const base = classify(message, rules);
    const results = [];
    const seen = new Set();
    const add = (label, text) => {
      const next = classify(text, rules);
      const key = `${label}|${next.category}|${next.priority}|${next.emergency}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({
        label,
        category: next.category,
        priority: next.priority,
        emergency: next.emergency,
        redFlags: next.redFlags,
        changed: next.category !== base.category || next.priority !== base.priority,
      });
    };
    for (const phrase of base.redFlags) {
      add(`Without “${phrase}”`, String(message).replace(new RegExp(escapeRegExp(phrase), 'gi'), ''));
      add(`If “${phrase}” were negated`, String(message).replace(new RegExp(escapeRegExp(phrase), 'i'), `no ${phrase}`));
    }
    const categoryTerm = base.evidence && base.evidence.matchedCategoryTerm;
    if (categoryTerm) add(`Without category term “${categoryTerm}”`, String(message).replace(new RegExp(escapeRegExp(categoryTerm), 'gi'), ''));
    const promptWord = base.evidence && base.evidence.matchedPromptWord;
    if (promptWord) add(`Without urgency word “${promptWord}”`, String(message).replace(new RegExp(escapeRegExp(promptWord), 'gi'), ''));
    return { base, results };
  }

  function countSyllables(word) {
    const cleaned = String(word).toLowerCase().replace(/[^a-z]/g, '');
    if (!cleaned) return 0;
    const groups = cleaned.match(/[aeiouy]+/g);
    let count = groups ? groups.length : 1;
    if (cleaned.endsWith('e') && count > 1) count -= 1;
    return Math.max(1, count);
  }

  function readability(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const sentences = String(text || '').split(/[.!?]+/).filter(part => part.trim()).length || 1;
    if (!words.length) return { words: 0, sentences, score: 0, grade: 'No text' };
    const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
    const score = Math.round((206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length)) * 10) / 10;
    const grade = score >= 60 ? 'Plain English' : score >= 40 ? 'Fairly clear' : 'Complex';
    return { words: words.length, sentences, score, grade };
  }

  function medicalAdviceHits(text) {
    const normalized = String(text || '').toLowerCase();
    return MEDICAL_ADVICE_BLOCKLIST.filter(phrase => normalized.includes(phrase));
  }

  function diffWords(before, after) {
    const a = String(before || '').split(/(\s+)/).filter(Boolean);
    const b = String(after || '').split(/(\s+)/).filter(Boolean);
    const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    const parts = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        parts.push({ type: 'same', text: a[i] });
        i += 1;
        j += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        parts.push({ type: 'del', text: a[i] });
        i += 1;
      } else {
        parts.push({ type: 'add', text: b[j] });
        j += 1;
      }
    }
    while (i < a.length) { parts.push({ type: 'del', text: a[i] }); i += 1; }
    while (j < b.length) { parts.push({ type: 'add', text: b[j] }); j += 1; }
    return parts;
  }

  function replyVariants({ result, faqEntry, config }) {
    const clinic = (config && config.clinicName) || 'the clinic';
    const faq = faqEntry ? ` ${faqEntry.answer}` : '';
    const base = result && result.reply ? result.reply : '';
    return {
      warm: `Hi, thanks for getting in touch with ${clinic}.${faq || ` ${base}`} A staff member will check this and reply during clinic hours.`,
      formal: `Dear patient,\n\nThank you for contacting ${clinic}.${faq || ` ${base}`} Your enquiry has been recorded and will be reviewed by a staff member during clinic hours.\n\nKind regards,\n${clinic}`,
      brief: `Received. A staff member will review your enquiry and reply during clinic hours.`,
    };
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addDays(date, days) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }

  function parseHours(value) {
    if (!value || value === 'closed') return null;
    const [start, end] = value.split('-').map(part => part.trim());
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    return { start: startHour * 60 + startMinute, end: endHour * 60 + endMinute };
  }

  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function generateSlots({ now = new Date(), config, bookedSlotIds = [], limit = 3 } = {}) {
    const appointments = (config && config.appointments) || {};
    const roles = appointments.roles || ['GP'];
    const daysAhead = appointments.daysAhead || 7;
    const slotMinutes = appointments.slotMinutes || 30;
    const holidays = new Set((config && config.publicHolidays) || []);
    const preBooked = (appointments.preBooked || []).map(slot =>
      `${localDateKey(addDays(now, slot.dayOffset))}-${slot.time}-${slot.role}`
    );
    const taken = new Set([...bookedSlotIds, ...preBooked]);
    const slots = [];
    for (let offset = 0; offset <= daysAhead && slots.length < limit * 4; offset += 1) {
      const date = addDays(now, offset);
      const key = localDateKey(date);
      if (holidays.has(key)) continue;
      const hours = parseHours(((config && config.openingHours) || {})[WEEKDAYS[date.getDay()]]);
      if (!hours) continue;
      for (let minutes = hours.start; minutes + slotMinutes <= hours.end; minutes += slotMinutes) {
        if (offset === 0 && minutes <= now.getHours() * 60 + now.getMinutes() + 30) continue;
        const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
        for (const role of roles) {
          const slotId = `${key}-${time}-${role}`;
          if (taken.has(slotId)) continue;
          slots.push({
            slotId,
            dateKey: key,
            time,
            role,
            label: `${WEEKDAYS[date.getDay()].slice(0, 3)} ${date.getDate()} ${MONTHS[date.getMonth()]} · ${time} · ${role}`,
          });
        }
        if (slots.length >= limit * 4) break;
      }
    }
    return slots.slice(0, limit);
  }

  function slotIsBooked(slotId, events) {
    return (events || []).some(event => event.type === 'appointment_booked' && event.slotId === slotId);
  }

  function findDuplicate(message, events, currentId) {
    const normalise = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    const target = normalise(message);
    if (!target) return null;
    return (events || []).find(event => event.type === 'enquiry_received' && event.id !== currentId && normalise(event.message) === target) || null;
  }

  function searchEnquiries(query, events, limit = 5) {
    const term = String(query || '').trim().slice(0, 120).toLocaleLowerCase('en-AU');
    if (term.length < 2 || !Array.isArray(events)) return [];
    const resultLimit = Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.floor(limit))) : 5;
    const received = events.filter(event => event && event.type === 'enquiry_received');
    const matches = [];
    for (let index = received.length - 1; index >= 0 && matches.length < resultLimit; index -= 1) {
      const event = received[index];
      const message = typeof event.message === 'string' ? event.message.replace(/\s+/g, ' ').trim() : '';
      const searchable = [event.id, event.category, event.priority, message]
        .filter(value => typeof value === 'string').join(' ').toLocaleLowerCase('en-AU');
      if (searchable.includes(term)) {
        matches.push({
          id: String(event.id || ''),
          category: String(event.category || 'Uncategorised'),
          priority: String(event.priority || 'Review'),
          emergency: event.emergency === true,
          message: message.slice(0, 180),
        });
      }
    }
    return matches;
  }

  function toFhir(event, config) {
    const approved = Boolean(event.approved);
    const priority = event.priority === 'Emergency wording' ? 'stat' : event.priority === 'Prompt review' ? 'urgent' : 'routine';
    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      meta: {
        tag: [{ system: 'https://example.invalid/demo', code: 'illustrative-not-validated', display: 'Illustrative FHIR-shaped export; not validated' }],
      },
      entry: [
        {
          fullUrl: `urn:uuid:${event.id}`,
          resource: {
            resourceType: 'Communication',
            id: event.id,
            status: 'preparation',
            category: [{ text: event.category }],
            priority,
            subject: { display: 'Synthetic patient (fictional)' },
            sent: event.timestamp,
            payload: [{ contentString: event.message || '' }],
            note: [{ text: `Synthetic demo record. Clinic: ${(config && config.clinicName) || 'synthetic clinic'}.` }],
          },
        },
        {
          fullUrl: `urn:uuid:task-${event.id}`,
          resource: {
            resourceType: 'Task',
            id: `task-${event.id}`,
            status: approved ? 'completed' : 'requested',
            intent: 'order',
            priority,
            description: `${event.category} · ${event.priority}`,
            for: { display: 'Synthetic patient (fictional)' },
            owner: { display: event.assignee || 'Receptionist' },
            authoredOn: event.timestamp,
            businessStatus: { text: approved ? 'Human approved · not sent' : 'Awaiting human approval' },
          },
        },
      ],
    };
  }

  function toCsv(events) {
    const header = ['id', 'timestamp', 'category', 'priority', 'emergency', 'assignee', 'slaMinutes', 'approved', 'message'];
    const rows = (events || []).filter(event => event.type === 'enquiry_received').map(event => [
      event.id,
      event.timestamp,
      event.category,
      event.priority,
      event.emergency ? 'yes' : 'no',
      event.assignee,
      event.slaMinutes,
      event.approved ? 'yes' : 'no',
      event.message,
    ]);
    const escape = value => {
      const text = String(value === undefined || value === null ? '' : value);
      const safeText = typeof value === 'string' && /^[\s\u0000-\u001F\u007F-\u00A0\uFEFF]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    return [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
  }

  function spikeSignals(events, { minimum = 3, zThreshold = 2 } = {}) {
    const received = (events || []).filter(event => event.type === 'enquiry_received' && event.timestamp);
    const buckets = new Map();
    for (const event of received) {
      const date = new Date(event.timestamp);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}`;
      if (!buckets.has(key)) buckets.set(key, new Map());
      const byCategory = buckets.get(key);
      byCategory.set(event.category, (byCategory.get(event.category) || 0) + 1);
    }
    const keys = [...buckets.keys()].sort();
    if (keys.length < 3) return [];
    const signals = [];
    const categories = new Set();
    for (const bucket of buckets.values()) for (const category of bucket.keys()) categories.add(category);
    for (const category of categories) {
      const counts = keys.map(key => buckets.get(key).get(category) || 0);
      const mean = counts.reduce((sum, value) => sum + value, 0) / counts.length;
      const variance = counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / counts.length;
      const deviation = Math.sqrt(variance);
      const latest = counts[counts.length - 1];
      if (latest >= minimum && deviation > 0) {
        const z = (latest - mean) / deviation;
        if (z >= zThreshold) signals.push({ type: 'volume-spike', category, bucket: keys[keys.length - 1], count: latest, mean: Math.round(mean * 100) / 100, z: Math.round(z * 100) / 100 });
      }
    }
    const emergencies = received.filter(event => event.emergency).map(event => new Date(event.timestamp).getTime()).sort((a, b) => a - b);
    for (let index = 1; index < emergencies.length; index += 1) {
      if (emergencies[index] - emergencies[index - 1] <= 6 * 60 * 60 * 1000) {
        signals.push({ type: 'symptom-cluster', category: 'Emergency', bucket: new Date(emergencies[index]).toISOString(), count: 2, mean: 0, z: 0, note: 'Two emergency phrase matches within six hours. Demo signal for manager review only, never a diagnosis.' });
        break;
      }
    }
    return signals;
  }

  const api = {
    MEDICAL_ADVICE_BLOCKLIST,
    counterfactuals,
    readability,
    medicalAdviceHits,
    diffWords,
    replyVariants,
    generateSlots,
    slotIsBooked,
    findDuplicate,
    searchEnquiries,
    toFhir,
    toCsv,
    spikeSignals,
    localDateKey,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      process.stdout.write(JSON.stringify({ ok: true, exports: Object.keys(api) }));
    }
  } else {
    root.ClinicExtras = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
