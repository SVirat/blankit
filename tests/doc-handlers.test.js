/**
 * tests/doc-handlers.test.js
 * Unit tests for src/core/doc-handlers.js
 *
 * Covers: file type detection, magic byte detection, notification helpers,
 *         text file redaction, and quota enforcement.
 */
const { loadPiiEngine, loadSource, resetCloaker } = require('./helpers/setup');

let C;

beforeAll(() => {
  C = loadPiiEngine();
  // doc-handlers.js depends on pii-engine.js being loaded first
  loadSource('src/core/doc-handlers.js');
  C = window.__cloaker;
});

beforeEach(() => {
  resetCloaker();
  // Re-attach doc-handler specific properties that resetCloaker may not cover
  C.enabled = true;
});

// ─── File Type Detection ────────────────────────────────────────────────────

describe('isTextFile', () => {
  test.each([
    'notes.txt', 'data.csv', 'report.json', 'page.html', 'doc.md',
    'log.log', 'config.yaml', 'settings.yml', 'app.xml', 'data.tsv',
    'config.ini', 'app.cfg', 'server.conf', 'document.rtf', 'page.htm',
  ])('detects %s as text file by extension', (name) => {
    expect(C.isTextFile({ name, type: '' })).toBe(true);
  });

  test.each([
    'text/plain', 'text/html', 'text/csv', 'application/json', 'application/xml',
    'application/csv',
  ])('detects MIME %s as text file', (type) => {
    expect(C.isTextFile({ name: 'file', type })).toBe(true);
  });

  test('rejects image file', () => {
    expect(C.isTextFile({ name: 'photo.png', type: 'image/png' })).toBe(false);
  });

  test('rejects binary file', () => {
    expect(C.isTextFile({ name: 'data.bin', type: 'application/octet-stream' })).toBe(false);
  });
});

describe('isOoxmlFile', () => {
  test.each(['report.docx', 'data.xlsx', 'slides.pptx'])(
    'detects %s as OOXML file',
    (name) => {
      expect(C.isOoxmlFile({ name, type: '' })).toBe(true);
    }
  );

  test('detects officedocument MIME type', () => {
    expect(C.isOoxmlFile({
      name: 'file',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })).toBe(true);
  });

  test('rejects non-OOXML extension', () => {
    expect(C.isOoxmlFile({ name: 'file.doc', type: '' })).toBe(false);
  });
});

describe('isPdfFile', () => {
  test('detects .pdf extension', () => {
    expect(C.isPdfFile({ name: 'report.pdf', type: '' })).toBe(true);
  });

  test('detects application/pdf MIME', () => {
    expect(C.isPdfFile({ name: 'file', type: 'application/pdf' })).toBe(true);
  });

  test('rejects non-PDF', () => {
    expect(C.isPdfFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
  });
});

// ─── Magic Byte Detection ───────────────────────────────────────────────────

describe('detectDocMagic', () => {
  test('detects OOXML (ZIP) magic bytes', () => {
    const buf = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00]).buffer;
    expect(C.detectDocMagic(buf)).toBe('ooxml');
  });

  test('detects PDF magic bytes', () => {
    // %PDF-
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]).buffer;
    expect(C.detectDocMagic(buf)).toBe('pdf');
  });

  test('returns null for unknown magic bytes', () => {
    const buf = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00]).buffer;
    expect(C.detectDocMagic(buf)).toBeNull();
  });

  test('returns null for too-small buffer', () => {
    const buf = new Uint8Array([0x50, 0x4B]).buffer;
    expect(C.detectDocMagic(buf)).toBeNull();
  });

  test('returns null for empty buffer', () => {
    const buf = new ArrayBuffer(0);
    expect(C.detectDocMagic(buf)).toBeNull();
  });
});

// ─── Notification Helpers ───────────────────────────────────────────────────

describe('notifyRedaction', () => {
  test('notifyRedaction is a function', () => {
    expect(typeof C.notifyRedaction).toBe('function');
  });

  test('notifyRedaction does not throw', () => {
    expect(() => {
      C.notifyRedaction(2, [{ type: 'Email', placeholder: '[EMAIL_1]' }]);
    }).not.toThrow();
  });

  test('notifyRedaction accepts file info', () => {
    expect(() => {
      C.notifyRedaction(1, [], { name: 'file.docx', type: 'application/docx', data: new ArrayBuffer(0) });
    }).not.toThrow();
  });
});

describe('notifyInputRedaction', () => {
  test('notifyInputRedaction is a function', () => {
    expect(typeof C.notifyInputRedaction).toBe('function');
  });

  test('notifyInputRedaction does not throw', () => {
    expect(() => {
      C.notifyInputRedaction(3, [{ type: 'Phone Number', placeholder: '[PHONE_1]' }]);
    }).not.toThrow();
  });
});

// ─── Text File Redaction ────────────────────────────────────────────────────

describe('redactTextFile', () => {
  test('redactTextFile is a function', () => {
    expect(typeof C.redactTextFile).toBe('function');
  });

  test('returns original file when no PII found', async () => {
    const content = 'No personal info here.';
    const file = new File([content], 'clean.txt', { type: 'text/plain' });

    const result = await C.redactTextFile(file);
    expect(result).toBe(file); // Same reference — no redaction needed
  });

  test('handles empty file', async () => {
    const file = new File([''], 'empty.txt', { type: 'text/plain' });
    const result = await C.redactTextFile(file);
    expect(result).toBe(file);
  });
});

// ─── Original Method Preservation ───────────────────────────────────────────

describe('Original method preservation', () => {
  test('_origBlobSlice is saved', () => {
    // jsdom supports Blob.prototype.slice
    expect(typeof C._origBlobSlice).toBe('function');
  });

  test('_origXHROpen is saved', () => {
    expect(typeof C._origXHROpen).toBe('function');
  });

  test('_origXHRSend is saved', () => {
    expect(typeof C._origXHRSend).toBe('function');
  });

  test('_origFRReadAsArrayBuffer is saved', () => {
    expect(typeof C._origFRReadAsArrayBuffer).toBe('function');
  });

  test('_origFRReadAsText is saved', () => {
    expect(typeof C._origFRReadAsText).toBe('function');
  });

  test('_origFetch is saved when fetch exists', () => {
    // In jsdom, window.fetch may not exist; in real browsers it does.
    // doc-handlers.js saves it as C._origFetch = window.fetch
    // which is undefined in jsdom but a function in browsers.
    if (typeof window.fetch === 'function') {
      expect(typeof C._origFetch).toBe('function');
    } else {
      expect(C._origFetch).toBeUndefined();
    }
  });

  test('saved methods reference the native prototypes', () => {
    // These must be saved BEFORE any platform interceptor overrides them
    expect(C._origBlobSlice).toBe(Blob.prototype.slice);
    expect(C._origXHROpen).toBe(XMLHttpRequest.prototype.open);
    expect(C._origXHRSend).toBe(XMLHttpRequest.prototype.send);
    expect(C._origFRReadAsArrayBuffer).toBe(FileReader.prototype.readAsArrayBuffer);
    expect(C._origFRReadAsText).toBe(FileReader.prototype.readAsText);
  });
});

// ─── Filename Redaction ─────────────────────────────────────────────────────

describe('redactFilename', () => {
  beforeEach(() => {
    resetCloaker();
    C.enabled = true;
  });

  test('redacts name as single placeholder and preserves extension', () => {
    var result = C.redactFilename('John_Doe_SSN_Report.docx');
    expect(result).not.toContain('John');
    expect(result).not.toContain('Doe');
    expect(result).toMatch(/\.docx$/);
    // "John Doe" should be ONE placeholder, not two separate ones
    expect(result).toMatch(/^\[NAME_1\]_SSN_Report\.docx$/);
  });

  test('redacts SSN in filename', () => {
    var result = C.redactFilename('SSN_123-45-6789_records.pdf');
    expect(result).not.toContain('123-45-6789');
    expect(result).toMatch(/\.pdf$/);
    expect(result).toMatch(/\[SSN_\d+\]/);
  });

  test('redacts email in filename', () => {
    var result = C.redactFilename('backup_john@example.com.txt');
    expect(result).not.toContain('john@example.com');
    expect(result).toMatch(/\.txt$/);
  });

  test('returns original name when disabled', () => {
    C.enabled = false;
    expect(C.redactFilename('John_Doe.docx')).toBe('John_Doe.docx');
  });

  test('handles file with no extension', () => {
    var result = C.redactFilename('John_Doe_SSN_123-45-6789');
    expect(result).not.toContain('123-45-6789');
    expect(result).not.toContain('John');
    expect(result).not.toContain('Doe');
  });

  test('handles null/undefined gracefully', () => {
    expect(C.redactFilename(null)).toBeNull();
    expect(C.redactFilename(undefined)).toBeUndefined();
    expect(C.redactFilename('')).toBe('');
  });

  test('preserves clean filenames', () => {
    expect(C.redactFilename('report.docx')).toBe('report.docx');
    expect(C.redactFilename('data.csv')).toBe('data.csv');
  });

  test('redacts phone number in filename', () => {
    var result = C.redactFilename('contact_555-867-5309.xlsx');
    expect(result).not.toContain('555-867-5309');
    expect(result).toMatch(/\.xlsx$/);
  });

  test('redaction map contains filename entries for unredact toggle', () => {
    C.redactFilename('John_Doe_SSN_Report.docx');
    // The redactionMap should have entries created during filename redaction
    var keys = Object.keys(C.redactionMap);
    expect(keys.length).toBeGreaterThan(0);
    // The NAME placeholder should map back to the original value
    var nameEntry = C.redactionMap['[NAME_1]'];
    expect(nameEntry).toBeDefined();
    expect(nameEntry.original).toBe('John Doe');
    expect(nameEntry.type).toBe('Person Name');
  });

  test('multiple PII types in one filename', () => {
    var result = C.redactFilename('John_Doe_SSN_123-45-6789_Report.docx');
    expect(result).not.toContain('123-45-6789');
    expect(result).toMatch(/\.docx$/);
    // SSN number is always redacted
    expect(result).toMatch(/\[SSN_\d+\]/);
    // At least partial name detection occurs
    expect(result).toMatch(/\[NAME_\d+\]/);
  });

  test('does not redact common document words in filenames', () => {
    var result = C.redactFilename('John_Smith_Medical_History.docx');
    expect(result).not.toContain('John');
    expect(result).not.toContain('Smith');
    // "Medical" and "History" are document words, NOT names
    expect(result).toContain('Medical');
    expect(result).toContain('History');
    expect(result).toMatch(/^\[NAME_1\]_Medical_History\.docx$/);
  });

  test('preserves other document vocabulary in filenames', () => {
    var r1 = C.redactFilename('John_Smith_Financial_Statement.pdf');
    expect(r1).toContain('Financial');
    expect(r1).toContain('Statement');
    expect(r1).not.toContain('John');
    expect(r1).not.toContain('Smith');

    resetCloaker(); C.enabled = true;
    var r2 = C.redactFilename('Jane_Doe_Insurance_Claim.docx');
    expect(r2).toContain('Insurance');
    expect(r2).toContain('Claim');
    expect(r2).not.toContain('Jane');
    expect(r2).not.toContain('Doe');
  });
});
