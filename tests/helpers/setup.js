/**
 * tests/helpers/setup.js
 * Bootstrap a minimal __cloaker namespace that mirrors what pii-engine.js creates,
 * then evaluate the real source files into the jsdom window so we can test the
 * actual production code without modifying it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Read a source file relative to the project root.
 */
function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

/**
 * Execute a source file inside the current jsdom `window` context.
 * Uses indirect eval so the code runs in the global scope where
 * jsdom's window/document/Blob/etc. are available.
 */
function loadSource(relPath) {
  const code = readSource(relPath);
  // Indirect eval executes in global scope (where jsdom globals live)
  const indirectEval = eval;
  indirectEval(code);
}

/**
 * Load the PII engine (creates window.__cloaker and exposes redactString / deepRedactObj).
 * Loads compromise.js first so NLP-based name detection is available.
 * Returns the __cloaker reference for convenience.
 */
function loadPiiEngine() {
  loadSource('lib/compromise.min.js');
  loadSource('src/core/pii-engine.js');
  return window.__cloaker;
}

/**
 * Reset __cloaker to a fresh default state (useful between tests).
 */
function resetCloaker() {
  if (!window.__cloaker) return;
  const C = window.__cloaker;
  C.enabled = true;
  C.categories = {
    emails: true, phones: true, ssn: true, creditCards: true,
    addresses: true, names: true, dates: true, medical: true, ip: true,
    passport: true, driversLicense: true, taxId: true,
    bankAccount: true, macAddress: true, urls: true,
    credentials: true, uuid: true
  };
  C.redactionMap = {};
  C.redactionCounter = 0;
  C.customWords = [];
  C.inputSelectors = [];
  C.sendButtonSelectors = [];
  if (typeof C.clearScrubCache === 'function') C.clearScrubCache();
}

module.exports = { readSource, loadSource, loadPiiEngine, resetCloaker, ROOT };
