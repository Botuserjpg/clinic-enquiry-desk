(function (root) {
  // Keep this function environment-neutral so browser and Node use identical rule order.

  function toneOf(raw, normalized, rules) {
    const words = (rules.tone && rules.tone.words) || [];
    const distinct = words.filter(word => normalized.includes(word)).length;
    const exclamations = Math.min(3, (normalized.match(/!/g) || []).length);
    const letters = raw.replace(/[^A-Za-z]/g, '').length;
    const upper = raw.replace(/[^A-Z]/g, '').length;
    const shouting = letters >= 20 && upper / letters > 0.6 ? 1 : 0;
    const score = distinct + exclamations + shouting;
    const angryAt = (rules.tone && rules.tone.angryAt) || 3;
    const frustratedAt = (rules.tone && rules.tone.frustratedAt) || 1;
    return {
      score,
      label: score >= angryAt ? 'angry' : score >= frustratedAt ? 'frustrated' : 'calm',
    };
  }

  function languageOf(normalized, rules) {
    const language = (rules.languages || []).find(entry =>
      entry.greetings.some(greeting => normalized.includes(String(greeting).toLowerCase()))
    );
    return {
      language: language ? language.name : null,
      interpreterSuggested: Boolean(language),
    };
  }

  function negationOf(normalized, redFlags) {
    return redFlags.filter(phrase => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?:^|\\b)(?:no|not|without|denies|denied)\\s+(?:\\w+\\s+){0,2}?${escaped}`);
      return pattern.test(normalized);
    });
  }

  function classify(message, rules) {
    const raw = String(message || '');
    const normalized = raw.toLowerCase();
    const redFlags = rules.redFlags.filter(phrase => normalized.includes(phrase));
    const emergency = redFlags.length > 0;
    const categoryMatch = rules.categories
      .map(category => ({ category, term: category.terms.find(term => normalized.includes(term)) }))
      .find(match => match.term);
    const matchedCategory = categoryMatch && categoryMatch.category;
    const matchedPromptWord = rules.promptReviewWords.find(word => normalized.includes(word)) || null;
    const tone = toneOf(raw, normalized, rules);
    const language = languageOf(normalized, rules);
    const injectionPhrases = (rules.injectionPhrases || []).filter(phrase => normalized.includes(phrase));
    const negatedRedFlags = negationOf(normalized, redFlags);

    // An emergency flag overrides category, priority, tone and every other rule.
    const category = emergency ? 'Emergency' : matchedCategory?.name || 'General enquiry';
    const priority = emergency
      ? rules.priorities.emergency
      : matchedPromptWord || category === 'Complaint / feedback'
        ? rules.priorities.promptReview
        : rules.priorities.routine;
    const reply = emergency
      ? rules.replies.emergency
      : category === 'Complaint / feedback'
        ? rules.replies.complaint
        : rules.replies.routine;
    return {
      category,
      priority,
      redFlags,
      emergency,
      reply,
      evidence: {
        matchedCategoryTerm: categoryMatch ? categoryMatch.term : null,
        matchedPromptWord,
        redFlagPhrases: redFlags,
        ruleOrder: emergency ? 'red-flag override' : categoryMatch ? 'category match' : 'default category',
        negatedRedFlags,
        toneScore: tone.score,
        toneLabel: tone.label,
        language: language.language,
        interpreterSuggested: language.interpreterSuggested,
        injectionPhrases,
        injectionDetected: injectionPhrases.length > 0,
      },
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
