(function (root) {
  // Keep this function environment-neutral so browser and Node use identical rule order.
  function classify(message, rules) {
    const normalized = String(message || '').toLowerCase();
    const redFlags = rules.redFlags.filter(phrase => normalized.includes(phrase));
    const emergency = redFlags.length > 0;
    const matchedCategory = rules.categories.find(category => category.terms.some(term => normalized.includes(term)));

    // An emergency flag overrides category and routine urgency decisions.
    const category = emergency ? 'Emergency' : matchedCategory?.name || 'General enquiry';
    const priority = emergency
      ? rules.priorities.emergency
      : rules.promptReviewWords.some(word => normalized.includes(word))
        ? rules.priorities.promptReview
        : rules.priorities.routine;
    return {
      category,
      priority,
      redFlags,
      emergency,
      reply: emergency ? rules.replies.emergency : rules.replies.routine,
    };
  }

  // Assign a fictional role and service-level target from the shared rules.
  function routeEnquiry(result, rules) {
    const assignee = (rules.routing && rules.routing[result.category]) || 'Receptionist';
    const configured = rules.serviceLevels && rules.serviceLevels[result.priority];
    const slaMinutes = result.emergency ? 0 : (Number.isFinite(configured) ? configured : 480);
    return { assignee, slaMinutes };
  }

  // Mask common structured identifiers before display or local storage.
  function maskSensitive(text) {
    return String(text || '')
      .replace(/\b\d{4}\s?\d{5}\s?\d{1}\b/g, '[medicare redacted]')
      .replace(/\b\d{10}\b/g, '[medicare redacted]')
      .replace(/\b(?:\+?61[\s-]?|0)(?:\d[\s-]?){8,9}\b/g, '[phone redacted]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '[date redacted]');
  }

  const api = { classify, routeEnquiry, maskSensitive };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => {
        const rules = require('./rules.json');
        const messages = JSON.parse(input);
        process.stdout.write(JSON.stringify(messages.map(message => classify(message, rules))));
      });
    }
  } else {
    root.ClinicClassifier = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
