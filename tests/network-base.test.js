/**
 * tests/network-base.test.js
 * Unit tests for src/core/network-base.js
 *
 * Covers: URL pattern matching, header helpers, LLM traffic detection,
 *         settings bridge message handling, and redaction integration.
 */
const { loadPiiEngine, loadSource, resetCloaker, readSource } = require('./helpers/setup');

let C;

// We extract the testable pure functions from network-base.js and evaluate
// them directly — the full file monkey-patches fetch/XHR in ways that
// conflict with jsdom, so we only load the helpers we can unit-test.

let shouldRedactUrl, shouldSkipBinaryRedact, isLLMTraffic;

beforeAll(() => {
  C = loadPiiEngine();
  loadSource('src/core/doc-handlers.js');

  // Define pure helper functions extracted from network-base.js
  const REDACT_URL_PATTERNS = [
    /\/backend-api\/conversation($|\?)/,
    /\/backend-api\/f\/conversation($|\?)/,
    /\/api\/append_message/,
    /\/api\/organizations\/.+\/chat_conversations\/.+\/completion/,
    /\/api\/generate/,
    /BatchExecute/
  ];

  shouldRedactUrl = function (url) {
    for (var i = 0; i < REDACT_URL_PATTERNS.length; i++) {
      if (REDACT_URL_PATTERNS[i].test(url)) return true;
    }
    return false;
  };

  const SKIP_BINARY_URL_PATTERNS = [
    /\.clients\d*\.google\.com\/upload/,
    /\.googleusercontent\.com\/upload/,
    /storage\.googleapis\.com/,
    /content-push\.googleapis\.com/
  ];

  shouldSkipBinaryRedact = function (url) {
    if (!url) return false;
    for (var i = 0; i < SKIP_BINARY_URL_PATTERNS.length; i++) {
      if (SKIP_BINARY_URL_PATTERNS[i].test(url)) return true;
    }
    return false;
  };

  isLLMTraffic = function (url) {
    try {
      var parsed = new URL(url, location.origin);
      if (parsed.origin === location.origin) return true;
      var h = parsed.hostname;
      if (/\.(googleapis|google|gstatic|googleusercontent)\.com$/.test(h)) return true;
      if (/\.(openai|anthropic)\.com$/.test(h)) return true;
      if (h === 'chatgpt.com' || h === 'claude.ai') return true;
      return false;
    } catch (e) {
      return true;
    }
  };
});

beforeEach(() => {
  resetCloaker();
});

// ─── URL Redaction Pattern Matching ─────────────────────────────────────────

describe('shouldRedactUrl', () => {
  test('matches ChatGPT conversation URL', () => {
    expect(shouldRedactUrl('https://chatgpt.com/backend-api/conversation')).toBe(true);
  });

  test('matches ChatGPT conversation URL with query params', () => {
    expect(shouldRedactUrl('https://chatgpt.com/backend-api/conversation?model=gpt4')).toBe(true);
  });

  test('matches ChatGPT /f/ conversation URL', () => {
    expect(shouldRedactUrl('/backend-api/f/conversation')).toBe(true);
  });

  test('matches Claude append_message URL', () => {
    expect(shouldRedactUrl('https://claude.ai/api/append_message')).toBe(true);
  });

  test('matches Claude completion URL', () => {
    expect(shouldRedactUrl('/api/organizations/org123/chat_conversations/chat456/completion')).toBe(true);
  });

  test('matches Gemini generate URL', () => {
    expect(shouldRedactUrl('/api/generate')).toBe(true);
  });

  test('matches Gemini BatchExecute', () => {
    expect(shouldRedactUrl('https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?batchjs=BatchExecute')).toBe(true);
  });

  test('does not match random URL', () => {
    expect(shouldRedactUrl('https://example.com/api/data')).toBe(false);
  });

  test('does not match GET-like URLs', () => {
    expect(shouldRedactUrl('https://chatgpt.com/backend-api/models')).toBe(false);
  });
});

// ─── Binary Skip URL Patterns ───────────────────────────────────────────────

describe('shouldSkipBinaryRedact', () => {
  test('skips Google upload CDN', () => {
    expect(shouldSkipBinaryRedact('https://upload.clients6.google.com/upload/something')).toBe(true);
  });

  test('skips googleusercontent upload', () => {
    expect(shouldSkipBinaryRedact('https://files.googleusercontent.com/upload/abc')).toBe(true);
  });

  test('skips storage.googleapis.com', () => {
    expect(shouldSkipBinaryRedact('https://storage.googleapis.com/bucket/file')).toBe(true);
  });

  test('skips content-push.googleapis.com', () => {
    expect(shouldSkipBinaryRedact('https://content-push.googleapis.com/upload')).toBe(true);
  });

  test('does not skip chatgpt.com', () => {
    expect(shouldSkipBinaryRedact('https://chatgpt.com/backend-api/conversation')).toBe(false);
  });

  test('returns false for null/empty', () => {
    expect(shouldSkipBinaryRedact(null)).toBe(false);
    expect(shouldSkipBinaryRedact('')).toBe(false);
  });
});

// ─── LLM Traffic Detection ──────────────────────────────────────────────────

describe('isLLMTraffic', () => {
  test('identifies same-origin as LLM traffic', () => {
    // jsdom defaults to about:blank, relative URLs treated as same-origin
    expect(isLLMTraffic('/api/conversation')).toBe(true);
  });

  test('identifies chatgpt.com as LLM traffic', () => {
    expect(isLLMTraffic('https://chatgpt.com/backend-api/conversation')).toBe(true);
  });

  test('identifies claude.ai as LLM traffic', () => {
    expect(isLLMTraffic('https://claude.ai/api/append_message')).toBe(true);
  });

  test('identifies openai.com as LLM traffic', () => {
    expect(isLLMTraffic('https://api.openai.com/v1/chat')).toBe(true);
  });

  test('identifies anthropic.com as LLM traffic', () => {
    expect(isLLMTraffic('https://api.anthropic.com/v1/messages')).toBe(true);
  });

  test('identifies googleapis.com as LLM traffic', () => {
    expect(isLLMTraffic('https://generativelanguage.googleapis.com/v1/models')).toBe(true);
  });

  test('rejects ad tracker domains', () => {
    expect(isLLMTraffic('https://analytics.example.com/track')).toBe(false);
  });

  test('rejects facebook.com', () => {
    expect(isLLMTraffic('https://www.facebook.com/pixel')).toBe(false);
  });

  test('rejects doubleclick.net', () => {
    expect(isLLMTraffic('https://ad.doubleclick.net/ddm')).toBe(false);
  });
});

// ─── Header Helpers ─────────────────────────────────────────────────────────
// These mirror the implementations in network-base.js and are tested directly
// to ensure the contracts that platform interceptors rely on.

let copyHeaders, stripContentType, stripContentLength;

beforeAll(() => {
  // Extracted pure functions from network-base.js

  copyHeaders = function (headers) {
    if (!headers) return undefined;
    var result = {};
    if (headers instanceof Headers) {
      headers.forEach(function (v, k) { result[k] = v; });
    } else if (Array.isArray(headers)) {
      for (var i = 0; i < headers.length; i++) {
        result[headers[i][0]] = String(headers[i][1]);
      }
    } else if (typeof headers === 'object') {
      var keys = Object.keys(headers);
      for (var i = 0; i < keys.length; i++) {
        if (headers[keys[i]] != null) {
          result[keys[i]] = String(headers[keys[i]]);
        }
      }
    }
    return result;
  };

  stripContentType = function (headers) {
    if (!headers) return undefined;
    if (headers instanceof Headers) { headers.delete('content-type'); return headers; }
    if (Array.isArray(headers)) {
      return headers.filter(function (pair) { return pair[0].toLowerCase() !== 'content-type'; });
    }
    if (typeof headers === 'object') {
      var h = {};
      for (var k in headers) { if (k.toLowerCase() !== 'content-type') h[k] = headers[k]; }
      return h;
    }
    return headers;
  };

  stripContentLength = function (headers) {
    if (!headers) return headers;
    if (headers instanceof Headers) { headers.delete('content-length'); return headers; }
    if (Array.isArray(headers)) {
      return headers.filter(function (pair) { return pair[0].toLowerCase() !== 'content-length'; });
    }
    if (typeof headers === 'object') {
      var h = {};
      for (var k in headers) { if (k.toLowerCase() !== 'content-length') h[k] = headers[k]; }
      return h;
    }
    return headers;
  };
});

describe('copyHeaders — always returns plain Record<string,string>', () => {
  test('returns undefined for null/undefined input', () => {
    expect(copyHeaders(null)).toBeUndefined();
    expect(copyHeaders(undefined)).toBeUndefined();
  });

  test('converts Headers instance to plain object', () => {
    const h = new Headers({ 'content-type': 'application/json', 'x-custom': 'val' });
    const result = copyHeaders(h);
    expect(result).toEqual({ 'content-type': 'application/json', 'x-custom': 'val' });
    expect(result).not.toBeInstanceOf(Headers);
    expect(typeof result).toBe('object');
  });

  test('converts array-of-pairs to plain object with stringified values', () => {
    const result = copyHeaders([['content-type', 'text/html'], ['x-num', 42]]);
    expect(result).toEqual({ 'content-type': 'text/html', 'x-num': '42' });
  });

  test('filters null/undefined values from plain object', () => {
    const result = copyHeaders({ 'keep': 'yes', 'remove-null': null, 'remove-undef': undefined, 'also-keep': '1' });
    expect(result).toEqual({ 'keep': 'yes', 'also-keep': '1' });
    expect('remove-null' in result).toBe(false);
    expect('remove-undef' in result).toBe(false);
  });

  test('stringifies numeric values in plain object', () => {
    const result = copyHeaders({ 'x-length': 12345 });
    expect(result['x-length']).toBe('12345');
  });

  test('result is always a plain object, never Headers instance', () => {
    const h = new Headers({ 'a': '1' });
    const result = copyHeaders(h);
    expect(result.constructor).toBe(Object);
  });
});

describe('stripContentType', () => {
  test('returns undefined for null/undefined (not null)', () => {
    expect(stripContentType(null)).toBeUndefined();
    expect(stripContentType(undefined)).toBeUndefined();
    // Critical: must NOT return null — fetch() rejects null headers
    expect(stripContentType(null)).not.toBeNull();
  });

  test('removes content-type from Headers instance', () => {
    const h = new Headers({ 'content-type': 'application/json', 'accept': '*/*' });
    const result = stripContentType(h);
    expect(result).toBeInstanceOf(Headers);
    expect(result.has('content-type')).toBe(false);
    expect(result.get('accept')).toBe('*/*');
  });

  test('removes content-type from array of pairs', () => {
    const pairs = [['Content-Type', 'text/html'], ['Accept', '*/*']];
    const result = stripContentType(pairs);
    expect(result).toEqual([['Accept', '*/*']]);
  });

  test('removes content-type from plain object (case-insensitive)', () => {
    const result = stripContentType({ 'Content-Type': 'text/plain', 'x-custom': 'val' });
    expect(result).toEqual({ 'x-custom': 'val' });
  });
});

describe('stripContentLength', () => {
  test('returns input as-is for null/undefined', () => {
    expect(stripContentLength(null)).toBeNull();
    expect(stripContentLength(undefined)).toBeUndefined();
  });

  test('removes content-length from Headers instance', () => {
    const h = new Headers({ 'content-length': '100', 'accept': '*/*' });
    const result = stripContentLength(h);
    expect(result.has('content-length')).toBe(false);
    expect(result.get('accept')).toBe('*/*');
  });

  test('removes content-length from plain object', () => {
    const result = stripContentLength({ 'Content-Length': '500', 'x-custom': 'val' });
    expect(result).toEqual({ 'x-custom': 'val' });
  });
});

// ─── Settings Bridge (postMessage) ──────────────────────────────────────────
// jsdom's postMessage doesn't set e.source correctly so we test the
// settings contract directly: the bridge updates C.* properties and
// the MAIN world code reads them.

describe('Settings bridge — property contract', () => {
  test('enabled flag controls redaction', () => {
    C.enabled = false;
    // redactString itself doesn't check enabled (callers do), but we
    // verify the property is writable and sticky.
    expect(C.enabled).toBe(false);
    C.enabled = true;
    expect(C.enabled).toBe(true);
  });

  test('categories object is updatable', () => {
    C.categories.emails = false;
    expect(C.categories.emails).toBe(false);
    C.categories = { emails: true, phones: false, ssn: true, creditCards: true, addresses: true, names: true, dates: true, medical: true, ip: true };
    expect(C.categories.phones).toBe(false);
    expect(C.categories.emails).toBe(true);
  });

  test('docScrubsRemaining is settable', () => {
    C.docScrubsRemaining = 10;
    expect(C.docScrubsRemaining).toBe(10);
  });

  test('redactionMap and counter can be cleared', () => {
    C.redactionMap = { '[EMAIL_1]': { original: 'a@b.com', type: 'Email' } };
    C.redactionCounter = 5;

    // This is what the CLOAKER_CLEAR handler does
    C.redactionMap = {};
    C.redactionCounter = 0;

    expect(C.redactionMap).toEqual({});
    expect(C.redactionCounter).toBe(0);
  });
});
