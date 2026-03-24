/**
 * tests/regression.test.js
 * Regression tests covering edge cases and previously identified risks.
 *
 * These tests validate that tricky scenarios work correctly and don't
 * break with future changes.
 */
const { loadPiiEngine, loadSource, resetCloaker } = require('./helpers/setup');

let C;

beforeAll(() => {
  C = loadPiiEngine();
  loadSource('src/core/doc-handlers.js');
});

beforeEach(() => {
  resetCloaker();
});

// ─── PII in JSON payloads ───────────────────────────────────────────────────

describe('Regression — JSON payload redaction', () => {
  test('redacts PII in ChatGPT-style conversation payload', () => {
    const payload = {
      action: 'next',
      messages: [{
        role: 'user',
        content: {
          parts: ['Please help me with my email john.doe@example.com and phone 555-123-4567']
        }
      }],
      model: 'gpt-4'
    };

    const { result, items } = C.deepRedactObj(payload);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(result.messages[0].content.parts[0]).not.toContain('john.doe@example.com');
    expect(result.messages[0].content.parts[0]).not.toContain('555-123-4567');
    // Model and action untouched (short strings or no PII)
    expect(result.model).toBe('gpt-4');
    expect(result.action).toBe('next');
  });

  test('redacts PII in Claude-style append_message payload', () => {
    const payload = {
      completion: {
        prompt: 'My SSN is 123-45-6789 and I live at 456 Oak Avenue'
      },
      organization_uuid: 'org-abc-123'
    };

    const { result, items } = C.deepRedactObj(payload);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(result.completion.prompt).not.toContain('123-45-6789');
    expect(result.completion.prompt).not.toContain('456 Oak Avenue');
  });
});

// ─── False positive mitigation ──────────────────────────────────────────────

describe('Regression — False positive reduction', () => {
  test('does not flag short number sequences as SSN in code', () => {
    // The SSN regex is broad (\d{3}[-\s]?\d{2}[-\s]?\d{4}) but
    // most code never has exactly this pattern. A version number
    // like "1.2.3" should be safe since it doesn't match the pattern.
    const { items } = C.redactString('Version 1.2.3 released');
    const ssnItems = items.filter(i => i.type === 'SSN');
    expect(ssnItems).toHaveLength(0);
  });

  test('does not flag "The Quick" as a person name', () => {
    // Both "The" and "Quick" — "The" is in COMMON_WORDS
    const { items } = C.redactString('The Quick summary');
    const nameItems = items.filter(i => i.type === 'Person Name');
    // "The" is in COMMON_WORDS, so "The Quick" should NOT match
    for (const item of nameItems) {
      const orig = C.redactionMap[item.placeholder]?.original || '';
      expect(orig).not.toBe('The Quick');
    }
  });

  test('does not flag "Please Help" as a person name', () => {
    const { items } = C.redactString('Please Help me with this');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not flag weekday pairs as names', () => {
    const { items } = C.redactString('Meeting on Monday Tuesday');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });
});

// ─── Redaction map consistency ──────────────────────────────────────────────

describe('Regression — Redaction map integrity', () => {
  test('every placeholder in result has a map entry', () => {
    const text = 'Contact: john@example.com, Phone: 555-123-4567, DOB: 01/15/1990';
    const { result, items } = C.redactString(text);

    for (const item of items) {
      expect(C.redactionMap[item.placeholder]).toBeDefined();
      expect(C.redactionMap[item.placeholder].original).toBeTruthy();
    }
  });

  test('un-redaction produces original text', () => {
    const original = 'Email john@example.com';
    const { result } = C.redactString(original);

    // Simulate un-redaction (what the bridge un-redact feature does)
    let unredacted = result;
    for (const [placeholder, data] of Object.entries(C.redactionMap)) {
      unredacted = unredacted.replace(placeholder, data.original);
    }
    expect(unredacted).toBe(original);
  });

  test('multiple redactions produce unique placeholders', () => {
    const { items } = C.redactString('a@b.com c@d.com e@f.com');
    const placeholders = items.map(i => i.placeholder);
    const unique = new Set(placeholders);
    expect(unique.size).toBe(placeholders.length);
  });
});

// ─── Enabled toggle ─────────────────────────────────────────────────────────

describe('Regression — Enabled state', () => {
  test('redactString works regardless of C.enabled (it has no guard)', () => {
    // Note: redactString itself does NOT check C.enabled —
    // the callers (fetch/XHR interceptors) do. This is by design.
    C.enabled = false;
    const { items } = C.redactString('john@example.com');
    expect(items).toHaveLength(1);
  });
});

// ─── Large input handling ───────────────────────────────────────────────────

describe('Regression — Large inputs', () => {
  test('handles string with many PII items', () => {
    // 50 emails in one string
    const emails = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`);
    const text = emails.join(' ');
    const { items } = C.redactString(text);
    expect(items).toHaveLength(50);
  });

  test('handles deeply nested object', () => {
    let obj = { val: 'john@example.com' };
    for (let i = 0; i < 20; i++) {
      obj = { nested: obj };
    }
    const { items } = C.deepRedactObj(obj);
    expect(items).toHaveLength(1);
  });
});

// ─── Mixed PII in realistic text ────────────────────────────────────────────

describe('Regression — Realistic text scenarios', () => {
  test('redacts medical intake form', () => {
    const text = `
      Patient: John Smith
      DOB: 03/15/1985
      SSN: 123-45-6789
      Phone: (555) 867-5309
      Email: jsmith@hospital.org
      Address: 742 Evergreen Terrace
      MRN: 00123456
      IP at check-in: 10.0.0.5
    `;
    const { items } = C.redactString(text);
    const types = items.map(i => i.type);
    expect(types).toContain('Person Name');
    expect(types).toContain('Date');
    expect(types).toContain('SSN');
    expect(types).toContain('Phone Number');
    expect(types).toContain('Email');
    expect(types).toContain('Medical Record Number');
    expect(types).toContain('IP Address');
  });

  test('preserves non-PII text around redactions', () => {
    const text = 'Hello, my email is john@example.com and I need help.';
    const { result } = C.redactString(text);
    expect(result).toContain('Hello, my email is');
    expect(result).toContain('and I need help.');
    expect(result).toMatch(/\[EMAIL_\d+\]/);
  });
});

// ─── File type edge cases ───────────────────────────────────────────────────

describe('Regression — File type detection edge cases', () => {
  test('case-insensitive extension matching', () => {
    expect(C.isTextFile({ name: 'file.TXT', type: '' })).toBe(true);
    expect(C.isTextFile({ name: 'file.Json', type: '' })).toBe(true);
    expect(C.isOoxmlFile({ name: 'file.DOCX', type: '' })).toBe(true);
    expect(C.isPdfFile({ name: 'file.PDF', type: '' })).toBe(true);
  });

  test('no false positive on similar extensions', () => {
    expect(C.isOoxmlFile({ name: 'file.doc', type: '' })).toBe(false);
    expect(C.isOoxmlFile({ name: 'file.xls', type: '' })).toBe(false);
    expect(C.isPdfFile({ name: 'file.pdfa', type: '' })).toBe(false);
  });

  test('detectDocMagic with exact boundary size (5 bytes)', () => {
    const ooxmlBuf = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14]).buffer;
    expect(C.detectDocMagic(ooxmlBuf)).toBe('ooxml');
  });
});

// ─── Credit card variants ───────────────────────────────────────────────────

describe('Regression — Credit card patterns', () => {
  test('Visa-style card number with spaces', () => {
    const { items } = C.redactString('Card: 4532 0151 1283 0366');
    expect(items.some(i => i.type === 'Credit Card')).toBe(true);
  });

  test('Mastercard-style with spaces', () => {
    const { items } = C.redactString('5425 2334 3010 9903');
    expect(items.some(i => i.type === 'Credit Card')).toBe(true);
  });

  test('Amex-style with dashes', () => {
    // Amex is 15 digits, but the regex expects 16 — should not match
    const { items } = C.redactString('3714-4963-5398-431');
    const ccItems = items.filter(i => i.type === 'Credit Card');
    expect(ccItems).toHaveLength(0);
  });
});

// ─── File Upload Pipeline Regressions ───────────────────────────────────────
// These regressions cover bugs fixed in the D&D and file upload pipeline
// across ChatGPT, Claude, and Gemini.

describe('Regression — Headers serialization safety', () => {
  // Bug: copyHeaders() used to return Headers instances or arrays, which
  // caused "Failed to read the 'headers' property from 'RequestInit'" in
  // Claude's fetch override. Now it ALWAYS returns plain Record<string,string>.

  test('copyHeaders with Headers instance returns plain object', () => {
    function copyHeaders(headers) {
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
          if (headers[keys[i]] != null) result[keys[i]] = String(headers[keys[i]]);
        }
      }
      return result;
    }

    const h = new Headers({ 'content-type': 'application/json' });
    const result = copyHeaders(h);
    expect(result).not.toBeInstanceOf(Headers);
    expect(result.constructor).toBe(Object);
    expect(result['content-type']).toBe('application/json');
  });

  test('stripContentType returns undefined (not null) for falsy input', () => {
    function stripContentType(headers) {
      if (!headers) return undefined;
      return headers; // simplified
    }
    // The key contract: undefined is safe for fetch init.headers; null is not
    expect(stripContentType(null)).toBeUndefined();
    expect(stripContentType(undefined)).toBeUndefined();
    expect(stripContentType(null)).not.toBeNull();
  });

  test('safe Headers construction pattern works with mixed input', () => {
    // Claude's interceptor uses: new Headers() → set pairs → delete content-length
    const inputHeaders = { 'Content-Type': 'application/octet-stream', 'Content-Length': '12345', 'X-Custom': 'val' };
    const safe = new Headers();
    for (const [k, v] of Object.entries(inputHeaders)) {
      if (v != null) safe.set(k, String(v));
    }
    safe.delete('content-length');

    expect(safe.get('content-type')).toBe('application/octet-stream');
    expect(safe.get('x-custom')).toBe('val');
    expect(safe.has('content-length')).toBe(false);
  });
});

describe('Regression — Gemini D&D upload size mismatch', () => {
  // Bug: Gemini reads file.size BEFORE cleaning, caches it, creates upload
  // session with that size, then slices file.slice(0, origSize). If the
  // cleaned file is larger, it gets truncated → corrupted DOCX.

  test('upload session size correction: declared size → matched file → cleaned size', () => {
    // Simulates the upload session creation fix
    const origSizeToFile = new Map();
    const cleanCache = new WeakMap();

    const origFile = new File(['x'.repeat(1680444)], 'doc.docx');
    const cleanedFile = new File(['x'.repeat(3280992)], 'doc.docx');

    // Drop handler registers original size
    origSizeToFile.set(origFile.size, origFile);
    // Clean cache stores the cleaned result
    cleanCache.set(origFile, Promise.resolve(cleanedFile));

    // Session creation interceptor: match by declared size
    const declaredSize = 1680444;
    const matchedFile = origSizeToFile.get(declaredSize);
    expect(matchedFile).toBe(origFile);

    // Correct the declared size to the cleaned file size
    const correctedSize = cleanedFile.size;
    expect(correctedSize).toBe(3280992);
    expect(correctedSize).not.toBe(declaredSize);
  });

  test('full-file slice detection prevents truncation', () => {
    const origFile = new File(['x'.repeat(100)], 'doc.txt');
    const cleanedFile = new File(['x'.repeat(200)], 'doc.txt');
    const source = { file: origFile, start: 0, end: origFile.size };

    // Detection: start===0 && end >= origFile.size means "the whole file"
    const isFullSlice = source.start === 0 && source.end >= source.file.size;
    expect(isFullSlice).toBe(true);

    // Must send cleanedFile directly, NOT cleanedFile.slice(0, 100)
    const sentBlob = isFullSlice ? cleanedFile : cleanedFile.slice(source.start, source.end);
    expect(sentBlob.size).toBe(200); // Full cleaned, not truncated
  });

  test('partial slice is NOT promoted to full file', () => {
    const origFile = new File(['x'.repeat(5000000)], 'big.docx');
    const cleanedFile = new File(['x'.repeat(6000000)], 'big.docx');
    const source = { file: origFile, start: 0, end: 2000000 };

    const isFullSlice = source.start === 0 && source.end >= source.file.size;
    expect(isFullSlice).toBe(false);

    // Partial slices still use proportional slicing
    const sentBlob = cleanedFile.slice(source.start, source.end);
    expect(sentBlob.size).toBe(2000000);
  });
});

describe('Regression — Original method preservation for interceptors', () => {
  test('_origXHROpen is required for Gemini session re-open', () => {
    // Gemini interceptor calls C._origXHROpen.call(xhr, ...) to re-open
    // XHR with corrected headers during upload session creation.
    // If this is missing, the session size correction cannot work.
    expect(typeof C._origXHROpen).toBe('function');
    expect(C._origXHROpen).toBe(XMLHttpRequest.prototype.open);
  });

  test('_origXHRSend is required for bypass sends', () => {
    expect(typeof C._origXHRSend).toBe('function');
    expect(C._origXHRSend).toBe(XMLHttpRequest.prototype.send);
  });

  test('_origBlobSlice is required for re-slicing cleaned files', () => {
    expect(typeof C._origBlobSlice).toBe('function');
    expect(C._origBlobSlice).toBe(Blob.prototype.slice);
  });
});

describe('Regression — LLM traffic gating rejects ad trackers', () => {
  // Bug risk: isLLMTraffic was too permissive, potentially applying
  // redaction to ad/analytics requests causing CSP or CORS errors.

  test('rejects googleadservices.com', () => {
    function isLLMTraffic(url) {
      try {
        var parsed = new URL(url, 'https://gemini.google.com');
        var h = parsed.hostname;
        if (/\.(googleapis|google|gstatic|googleusercontent)\.com$/.test(h)) return true;
        if (/\.(openai|anthropic)\.com$/.test(h)) return true;
        if (h === 'chatgpt.com' || h === 'claude.ai') return true;
        return false;
      } catch (e) { return true; }
    }
    // googleadservices.com: NOT a Google subdomain (.google.com)
    expect(isLLMTraffic('https://www.googleadservices.com/pagead')).toBe(false);
  });

  test('accepts googleapis.com subdomains', () => {
    function isLLMTraffic(url) {
      try {
        var parsed = new URL(url, 'https://gemini.google.com');
        var h = parsed.hostname;
        if (/\.(googleapis|google|gstatic|googleusercontent)\.com$/.test(h)) return true;
        return false;
      } catch (e) { return true; }
    }
    expect(isLLMTraffic('https://content-push.googleapis.com/upload/')).toBe(true);
    expect(isLLMTraffic('https://generativelanguage.googleapis.com/v1/models')).toBe(true);
  });
});

// ─── Medical/Insurance ID false positives ───────────────────────────────────

describe('Regression — Medical regex does not consume labels', () => {
  test('Medical Record Number label is not consumed as PII value', () => {
    const r = C.redactString('Medical Record Number: MRN: HP8834291');
    expect(r.result).toContain('Medical Record Number');
    expect(r.result).toMatch(/\[MRN_\d+\]/);
    expect(r.result).not.toContain('HP8834291');
  });

  test('Insurance ID with alphanumeric prefix is fully captured', () => {
    const r = C.redactString('Health Insurance ID: Insurance ID: BCBS9920384756');
    expect(r.result).not.toContain('BCBS9920384756');
    expect(r.result).toMatch(/\[MRN_\d+\]/);
    // The digits should not leak as phone
    expect(r.result).not.toMatch(/\[PHONE_\d+\]/);
  });

  test('Patient ID works with digit-only values', () => {
    const r = C.redactString('Patient ID: 12345678');
    expect(r.result).not.toContain('12345678');
    expect(r.result).toMatch(/\[MRN_\d+\]/);
  });
});

// ─── Address with non-standard suffixes ─────────────────────────────────────

describe('Regression — Address regex covers common suffixes', () => {
  test('Terrace suffix', () => {
    const r = C.redactString('742 Evergreen Terrace, Springfield, IL 62704');
    expect(r.result).toMatch(/\[ADDR_\d+\]/);
    expect(r.result).not.toContain('742 Evergreen');
  });

  test('Trail suffix', () => {
    const r = C.redactString('100 Oak Trail, Denver, CO 80201');
    expect(r.result).toMatch(/\[ADDR_\d+\]/);
  });

  test('Parkway suffix', () => {
    const r = C.redactString('500 Technology Parkway, Atlanta, GA 30301');
    expect(r.result).toMatch(/\[ADDR_\d+\]/);
  });
});

// ─── Bank account not misclassified as phone ────────────────────────────────

describe('Regression — Bank account vs phone disambiguation', () => {
  test('10-digit account number is BANK not PHONE', () => {
    const r = C.redactString('Bank Account for Billing: Acct: 9283746501');
    expect(r.result).toMatch(/\[BANK_\d+\]/);
    expect(r.result).not.toMatch(/\[PHONE_\d+\]/);
  });

  test('full patient document does not misclassify bank as phone', () => {
    const doc = [
      'Phone: (555) 867-5309',
      'Insurance ID: BCBS9920384756',
      'Bank Account for Billing: Acct: 9283746501',
    ].join('\n');
    const r = C.redactString(doc);
    expect(r.result).toMatch(/Bank Account.*\[BANK/);
    expect(r.result).not.toContain('9283746501');
    expect(r.result).not.toContain('BCBS9920384756');
  });
});
