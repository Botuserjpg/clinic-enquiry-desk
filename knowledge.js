(function (root) {
  'use strict';

  // A small, transparent BM25 retriever for the fictional clinic FAQ.
  // It runs locally and never calls a model. Scores are relative to the query.
  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }

  function buildIndex(entries) {
    const docs = entries.map(entry => {
      const text = `${entry.question} ${entry.answer} ${(entry.tags || []).join(' ')}`;
      const tokens = tokenize(text);
      const counts = new Map();
      for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
      return { entry, tokens, counts, length: tokens.length };
    });
    const df = new Map();
    for (const doc of docs) {
      for (const token of new Set(doc.tokens)) df.set(token, (df.get(token) || 0) + 1);
    }
    const averageLength = docs.length ? docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length : 0;
    return { docs, df, averageLength, total: docs.length };
  }

  function search(query, entries, limit = 3) {
    const index = buildIndex(entries);
    const terms = tokenize(query);
    const k1 = 1.5;
    const b = 0.75;
    const scored = index.docs.map(doc => {
      let score = 0;
      for (const term of terms) {
        const frequency = doc.counts.get(term) || 0;
        if (!frequency) continue;
        const docFrequency = index.df.get(term) || 0;
        const idf = Math.log(1 + (index.total - docFrequency + 0.5) / (docFrequency + 0.5));
        const denominator = frequency + k1 * (1 - b + b * (doc.length / (index.averageLength || 1)));
        score += idf * ((frequency * (k1 + 1)) / denominator);
      }
      return { entry: doc.entry, score: Math.round(score * 1000) / 1000 };
    }).filter(result => result.score > 0);
    return scored.sort((a, b2) => b2.score - a.score).slice(0, limit);
  }

  function answer(query, entries, threshold = 1.2) {
    const matches = search(query, entries, 3);
    const best = matches[0] || null;
    return {
      matches,
      best,
      score: best ? best.score : 0,
      lowMatch: !best || best.score < threshold,
    };
  }

  const api = { tokenize, buildIndex, search, answer };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => {
        const faq = require('./data/faq.json');
        const payload = JSON.parse(input);
        const threshold = payload.threshold || 1.2;
        process.stdout.write(JSON.stringify(payload.queries.map(query => answer(query, faq, threshold))));
      });
    }
  } else {
    root.ClinicKnowledge = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
