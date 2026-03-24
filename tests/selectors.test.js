/**
 * tests/selectors.test.js
 * Unit tests for platform selector registration files.
 *
 * Verifies that each platform correctly registers its CSS selectors
 * into __cloaker.inputSelectors and __cloaker.sendButtonSelectors.
 */
const { loadPiiEngine, loadSource, resetCloaker } = require('./helpers/setup');

let C;

beforeAll(() => {
  C = loadPiiEngine();
});

beforeEach(() => {
  resetCloaker();
});

// ─── ChatGPT Selectors ─────────────────────────────────────────────────────

describe('ChatGPT selectors', () => {
  beforeEach(() => {
    resetCloaker();
    loadSource('src/platforms/chatgpt/selectors.js');
  });

  test('registers input selectors', () => {
    expect(C.inputSelectors.length).toBeGreaterThan(0);
    expect(C.inputSelectors).toContain('#prompt-textarea');
  });

  test('registers send button selectors', () => {
    expect(C.sendButtonSelectors.length).toBeGreaterThan(0);
    expect(C.sendButtonSelectors.some(s => s.includes('send-button'))).toBe(true);
  });
});

// ─── Claude Selectors ───────────────────────────────────────────────────────

describe('Claude selectors', () => {
  beforeEach(() => {
    resetCloaker();
    loadSource('src/platforms/claude/selectors.js');
  });

  test('registers input selectors', () => {
    expect(C.inputSelectors.length).toBeGreaterThan(0);
    expect(C.inputSelectors.some(s => s.includes('ProseMirror'))).toBe(true);
  });

  test('registers send button selectors', () => {
    expect(C.sendButtonSelectors.length).toBeGreaterThan(0);
    expect(C.sendButtonSelectors.some(s => s.includes('Send message'))).toBe(true);
  });
});

// ─── Gemini Selectors ───────────────────────────────────────────────────────

describe('Gemini selectors', () => {
  beforeEach(() => {
    resetCloaker();
    loadSource('src/platforms/gemini/selectors.js');
  });

  test('registers input selectors', () => {
    expect(C.inputSelectors.length).toBeGreaterThan(0);
    expect(C.inputSelectors.some(s => s.includes('ql-editor'))).toBe(true);
  });

  test('registers send button selectors', () => {
    expect(C.sendButtonSelectors.length).toBeGreaterThan(0);
    expect(C.sendButtonSelectors.some(s => s.includes('Send'))).toBe(true);
  });

  test('includes generic fallback selectors', () => {
    expect(C.inputSelectors.some(s => s === 'form textarea')).toBe(true);
    expect(C.inputSelectors.some(s => s === 'div[contenteditable="true"]')).toBe(true);
  });
});

// ─── Combined Platform Selectors ────────────────────────────────────────────

describe('All platforms combined', () => {
  beforeEach(() => {
    resetCloaker();
    loadSource('src/platforms/chatgpt/selectors.js');
    loadSource('src/platforms/claude/selectors.js');
    loadSource('src/platforms/gemini/selectors.js');
  });

  test('all three platforms add their selectors', () => {
    // ChatGPT + Claude + Gemini + generic fallbacks
    expect(C.inputSelectors.length).toBeGreaterThanOrEqual(6);
    expect(C.sendButtonSelectors.length).toBeGreaterThanOrEqual(3);
  });

  test('no duplicate selectors', () => {
    const uniqueInputs = new Set(C.inputSelectors);
    expect(uniqueInputs.size).toBe(C.inputSelectors.length);

    const uniqueButtons = new Set(C.sendButtonSelectors);
    expect(uniqueButtons.size).toBe(C.sendButtonSelectors.length);
  });
});
