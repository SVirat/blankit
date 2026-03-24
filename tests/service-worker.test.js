/**
 * tests/service-worker.test.js
 * Unit tests for service worker helper functions.
 *
 * Since the service worker uses Chrome extension APIs (chrome.storage, chrome.tabs, etc.),
 * we extract and test the pure helper functions that don't depend on chrome APIs.
 */
const vm = require('vm');

beforeAll(() => {
  // Set up minimal chrome mock so the IIFE doesn't crash
  global.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://fakeid/${path}`,
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} },
      sendMessage: () => Promise.resolve(),
      lastError: null,
    },
    storage: {
      local: {
        get: (keys, cb) => { if (cb) cb({}); },
        set: (obj, cb) => { if (cb) cb(); },
        remove: (keys, cb) => { if (cb) cb(); },
      },
    },
    tabs: {
      create: (opts, cb) => { if (cb) cb({ id: 1 }); },
    },
  };

  global.self = { crypto: { randomUUID: () => 'test-uuid-1234' } };
});

afterAll(() => {
  delete global.chrome;
  delete global.self;
});

// ─── Manifest.json Structure ────────────────────────────────────────────────

describe('manifest.json', () => {
  const manifest = require('../manifest.json');

  test('uses manifest version 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  test('has required name and version', () => {
    expect(manifest.name).toBe('Blankit');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('declares only storage permission', () => {
    expect(manifest.permissions).toContain('storage');
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.permissions).not.toContain('alarms');
  });

  test('has host_permissions for supported platforms', () => {
    expect(manifest.host_permissions).toContain('https://chatgpt.com/*');
    expect(manifest.host_permissions).toContain('https://claude.ai/*');
    expect(manifest.host_permissions).toContain('https://gemini.google.com/*');
  });

  test('has service worker background script', () => {
    expect(manifest.background.service_worker).toBe('src/background/service-worker.js');
  });

  test('has MAIN world content scripts for LLM platforms', () => {
    const mainScript = manifest.content_scripts.find(cs => cs.world === 'MAIN');
    expect(mainScript).toBeDefined();
    expect(mainScript.js).toContain('src/core/pii-engine.js');
    expect(mainScript.js).toContain('src/core/doc-handlers.js');
    expect(mainScript.js).toContain('src/core/network-base.js');
    expect(mainScript.run_at).toBe('document_start');
  });

  test('has ISOLATED world content script for bridge', () => {
    const isolatedScript = manifest.content_scripts.find(cs => cs.world === 'ISOLATED');
    expect(isolatedScript).toBeDefined();
    expect(isolatedScript.js).toContain('src/content/bridge.js');
    expect(isolatedScript.run_at).toBe('document_idle');
  });

  test('does not include razorpay content script or host permissions', () => {
    const rpScript = manifest.content_scripts.find(cs =>
      cs.matches && cs.matches.some(m => m.includes('razorpay'))
    );
    expect(rpScript).toBeUndefined();
    const rpHost = manifest.host_permissions.find(h => h.includes('razorpay') || h.includes('rzp.io'));
    expect(rpHost).toBeUndefined();
  });

  test('loads scripts in correct order (pii-engine before doc-handlers before network-base)', () => {
    const mainScript = manifest.content_scripts.find(cs => cs.world === 'MAIN');
    const piiIdx = mainScript.js.indexOf('src/core/pii-engine.js');
    const docIdx = mainScript.js.indexOf('src/core/doc-handlers.js');
    const netIdx = mainScript.js.indexOf('src/core/network-base.js');
    expect(piiIdx).toBeLessThan(docIdx);
    expect(docIdx).toBeLessThan(netIdx);
  });

  test('loads JSZip before pii-engine', () => {
    const mainScript = manifest.content_scripts.find(cs => cs.world === 'MAIN');
    const jszipIdx = mainScript.js.indexOf('lib/jszip.min.js');
    const piiIdx = mainScript.js.indexOf('src/core/pii-engine.js');
    expect(jszipIdx).toBeLessThan(piiIdx);
  });

  test('loads compromise.js before pii-engine', () => {
    const mainScript = manifest.content_scripts.find(cs => cs.world === 'MAIN');
    const compromiseIdx = mainScript.js.indexOf('lib/compromise.min.js');
    const piiIdx = mainScript.js.indexOf('src/core/pii-engine.js');
    expect(compromiseIdx).toBeGreaterThan(-1);
    expect(compromiseIdx).toBeLessThan(piiIdx);
  });

  test('loads selector files before interceptor files', () => {
    const mainScript = manifest.content_scripts.find(cs => cs.world === 'MAIN');
    const js = mainScript.js;
    // Each platform's selectors should come before its interceptor
    for (const platform of ['chatgpt', 'claude', 'gemini']) {
      const selIdx = js.indexOf(`src/platforms/${platform}/selectors.js`);
      const intIdx = js.indexOf(`src/platforms/${platform}/interceptor.js`);
      expect(selIdx).toBeLessThan(intIdx);
    }
  });
});
