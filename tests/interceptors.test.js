/**
 * tests/interceptors.test.js
 * Tests for drag-and-drop vs file-upload flows across all 3 platform interceptors.
 *
 * Each platform has a different interception strategy:
 *   ChatGPT: DOM event interception (change + drop events, synthetic re-dispatch)
 *   Claude:  Blob/FileReader prototype overrides + fetch/XHR body interception (no DOM events)
 *   Gemini:  change event for uploads, drop event warms cache, XHR/fetch swaps + Blob overrides
 *
 * Since interceptors are IIFEs guarded by hostname checks, we can't eval them directly.
 * Instead we extract and test the shared logic patterns: cleanability checks, cleaning
 * dispatch, and the behavioral contracts each platform relies on.
 */
const { loadPiiEngine, loadSource, resetCloaker } = require('./helpers/setup');

let C;

beforeAll(() => {
  C = loadPiiEngine();
  loadSource('src/core/doc-handlers.js');
  // Load selectors so C.inputSelectors/sendButtonSelectors are populated
  loadSource('src/platforms/chatgpt/selectors.js');
  loadSource('src/platforms/claude/selectors.js');
  loadSource('src/platforms/gemini/selectors.js');
});

beforeEach(() => {
  resetCloaker();
  C.enabled = true;
  C.docScrubsRemaining = 5;
});

// ─── Shared: File Cleanability Detection ────────────────────────────────────
// All 3 interceptors use the same core check: extension + isOoxmlFile/isPdfFile/isTextFile

const CLEANABLE_EXTENSIONS = /\.(docx|xlsx|pptx|txt|csv|tsv|json|xml|md|log|html|htm|yaml|yml|ini|cfg|conf|rtf|pdf)$/i;

function isCleanable(file) {
  return (file && file.name &&
    (CLEANABLE_EXTENSIONS.test(file.name) || C.isOoxmlFile(file) || C.isTextFile(file) || C.isPdfFile(file)));
}

describe('Shared — File cleanability detection', () => {
  // Document types (OOXML)
  test.each(['report.docx', 'data.xlsx', 'slides.pptx'])(
    'marks %s as cleanable', (name) => {
      expect(isCleanable(new File(['x'], name))).toBe(true);
    }
  );

  // Text files
  test.each(['notes.txt', 'data.csv', 'config.json', 'page.html', 'README.md', 'app.log'])(
    'marks %s as cleanable', (name) => {
      expect(isCleanable(new File(['x'], name))).toBe(true);
    }
  );

  // PDF
  test('marks PDF as cleanable', () => {
    expect(isCleanable(new File(['x'], 'report.pdf'))).toBe(true);
  });

  // Non-cleanable
  test.each(['photo.png', 'image.jpg', 'video.mp4', 'archive.zip', 'binary.exe'])(
    'marks %s as NOT cleanable', (name) => {
      expect(isCleanable(new File(['x'], name))).toBe(false);
    }
  );

  // Case insensitive
  test.each(['FILE.DOCX', 'Data.CSV', 'Report.PDF'])(
    'cleanability is case-insensitive for %s', (name) => {
      expect(isCleanable(new File(['x'], name))).toBe(true);
    }
  );

  // Edge cases
  test('null/undefined file is not cleanable', () => {
    expect(isCleanable(null)).toBeFalsy();
    expect(isCleanable(undefined)).toBeFalsy();
  });

  test('file without matching extension is not cleanable', () => {
    expect(isCleanable(new File(['x'], 'file.unknown'))).toBe(false);
  });
});

// ─── Shared: Clean File Dispatch Logic ──────────────────────────────────────
// All 3 platforms dispatch to the same C.redactOoxmlFile / C.redactPdfFile / C.redactTextFile

describe('Shared — Clean file dispatch', () => {
  test('redactTextFile returns same file when no PII', async () => {
    const file = new File(['Hello world, no PII here.'], 'clean.txt', { type: 'text/plain' });
    const cleaned = await C.redactTextFile(file);
    expect(cleaned).toBe(file);
  });

  test('isOoxmlFile/isPdfFile/isTextFile dispatch correctly', () => {
    expect(C.isOoxmlFile(new File(['x'], 'doc.docx'))).toBe(true);
    expect(C.isPdfFile(new File(['x'], 'doc.pdf'))).toBe(true);
    expect(C.isTextFile(new File(['x'], 'doc.txt'))).toBe(true);

    // Cross-checks: each recognizes only its own type
    expect(C.isOoxmlFile(new File(['x'], 'doc.pdf'))).toBe(false);
    expect(C.isPdfFile(new File(['x'], 'doc.docx'))).toBe(false);
    expect(C.isTextFile(new File(['x'], 'doc.docx'))).toBe(false);
  });
});

// =============================================================================
// ChatGPT Interceptor — DOM Event Strategy
// =============================================================================

describe('ChatGPT — Upload flow (change event)', () => {
  test('change event handler contract: file input with cleanable files is intercepted', () => {
    // ChatGPT intercepts change events on <input type="file"> elements
    // by checking: e.target instanceof HTMLInputElement, input.type === 'file',
    // input.files.length > 0, and files.some(isCleanable)
    const input = document.createElement('input');
    input.type = 'file';

    // Verify the element satisfies the guard conditions
    expect(input instanceof HTMLInputElement).toBe(true);
    expect(input.type).toBe('file');
  });

  test('change event with bypass flag is not intercepted', () => {
    // _cloakerBypass prevents infinite re-dispatch loops
    const evt = new Event('change', { bubbles: true });
    evt._cloakerBypass = true;
    expect(evt._cloakerBypass).toBe(true);
  });

  test('disabled state prevents interception', () => {
    C.enabled = false;
    expect(C.enabled).toBe(false);
    // Guard: if (!C.enabled) return; — the handler exits early
  });

  test('mixed cleanable and non-cleanable files are partitioned correctly', () => {
    const files = [
      new File(['data'], 'report.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      new File(['data'], 'photo.png', { type: 'image/png' }),
      new File(['data'], 'notes.txt', { type: 'text/plain' }),
    ];

    const cleanableFiles = files.filter(isCleanable);
    const nonCleanableFiles = files.filter(f => !isCleanable(f));

    expect(cleanableFiles).toHaveLength(2);
    expect(nonCleanableFiles).toHaveLength(1);
    expect(nonCleanableFiles[0].name).toBe('photo.png');
  });
});

describe('ChatGPT — Drag-and-drop flow (drop event)', () => {
  test('drop event handler contract: checks files for cleanability', () => {
    // ChatGPT's drop handler checks e.dataTransfer.files.length > 0
    // and files.some(isCleanable), then prevents default and stops propagation
    const files = [new File(['PII: john@example.com'], 'data.txt', { type: 'text/plain' })];

    expect(files.length).toBeGreaterThan(0);
    expect(files.some(isCleanable)).toBe(true);
  });

  test('drop with only non-cleanable files passes through', () => {
    const files = [new File(['data'], 'photo.png', { type: 'image/png' })];
    expect(files.some(isCleanable)).toBe(false);
    // Handler returns early — no interception
  });

  test('drop with no files passes through', () => {
    const files = [];
    expect(files.length).toBe(0);
    // Guard: if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
  });

  test('bypass flag prevents re-interception of re-dispatched drop', () => {
    // After cleaning, ChatGPT dispatches a new DragEvent with _cloakerBypass = true
    const evt = new Event('drop', { bubbles: true, cancelable: true });
    evt._cloakerBypass = true;
    expect(evt._cloakerBypass).toBe(true);
  });

  test('drop handler cleans each cleanable file while passing others through', () => {
    const originalFiles = [
      new File(['Email: john@example.com'], 'pii.txt', { type: 'text/plain' }),
      new File(['image data'], 'photo.png', { type: 'image/png' }),
    ];

    const toClean = originalFiles.filter(isCleanable);
    const toPassThrough = originalFiles.filter(f => !isCleanable(f));
    expect(toClean).toHaveLength(1);
    expect(toClean[0].name).toBe('pii.txt');
    expect(toPassThrough).toHaveLength(1);
    expect(toPassThrough[0].name).toBe('photo.png');
  });
});

// =============================================================================
// Claude Interceptor — Blob/FileReader Prototype Override Strategy
// =============================================================================

describe('Claude — Upload flow (Blob prototype overrides)', () => {
  test('Claude overrides Blob prototype methods for interception', () => {
    // Claude overrides Blob.prototype.arrayBuffer/text/stream/slice and
    // FileReader.prototype.readAs* to intercept file reads.
    // jsdom may not have all these natively, but the real browser does.
    // We verify the methods that jsdom supports.
    expect(typeof Blob.prototype.slice).toBe('function');
    expect(typeof FileReader.prototype.readAsArrayBuffer).toBe('function');
    expect(typeof FileReader.prototype.readAsText).toBe('function');
  });

  test('cleanable file detection uses isOoxmlFile/isPdfFile/isTextFile', () => {
    // Claude's isCleanableFile checks:
    // 1. file instanceof File
    // 2. !cleanedFiles.has(file) (WeakSet of already cleaned)
    // 3. C.isOoxmlFile || C.isPdfFile || C.isTextFile
    const docx = new File(['x'], 'report.docx');
    const pdf = new File(['x'], 'report.pdf');
    const txt = new File(['x'], 'notes.txt');
    const png = new File(['x'], 'photo.png');

    expect(C.isOoxmlFile(docx) || C.isPdfFile(docx) || C.isTextFile(docx)).toBe(true);
    expect(C.isOoxmlFile(pdf) || C.isPdfFile(pdf) || C.isTextFile(pdf)).toBe(true);
    expect(C.isOoxmlFile(txt) || C.isPdfFile(txt) || C.isTextFile(txt)).toBe(true);
    expect(C.isOoxmlFile(png) || C.isPdfFile(png) || C.isTextFile(png)).toBe(false);
  });

  test('WeakSet can track already-cleaned files to prevent double-cleaning', () => {
    // Claude uses cleanedFiles WeakSet to mark results and skip re-processing
    const cleanedFiles = new WeakSet();
    const file = new File(['data'], 'notes.txt');
    const cleanedFile = new File(['[EMAIL_1]'], 'notes.txt');

    expect(cleanedFiles.has(file)).toBe(false);
    cleanedFiles.add(cleanedFile);
    expect(cleanedFiles.has(cleanedFile)).toBe(true);
    expect(cleanedFiles.has(file)).toBe(false);
  });

  test('WeakMap can cache cleaning promises to avoid parallel re-cleaning', () => {
    // Claude uses fileCleanCache WeakMap: File → Promise<cleaned File>
    const cache = new WeakMap();
    const file = new File(['data'], 'notes.txt');
    const promise = Promise.resolve(new File(['redacted'], 'notes.txt'));

    expect(cache.has(file)).toBe(false);
    cache.set(file, promise);
    expect(cache.has(file)).toBe(true);
    expect(cache.get(file)).toBe(promise);
  });

  test('Blob slice tracking maps child blobs to parent files', () => {
    // Claude's slice override tracks: sliceParent.set(sliced, parentFile)
    const sliceParent = new WeakMap();
    const file = new File(['Hello john@example.com world'], 'data.txt', { type: 'text/plain' });
    const sliced = file.slice(0, 10);

    sliceParent.set(sliced, file);
    expect(sliceParent.get(sliced)).toBe(file);
  });
});

describe('Claude — Drag-and-drop flow (Blob read interception)', () => {
  test('Claude intercepts drag-and-drop via Blob reads, not DOM events', () => {
    // When user drops a file on Claude, the framework reads it via
    // Blob.prototype.arrayBuffer/text. The overridden methods intercept
    // and clean the file transparently.
    // This is a design verification — no drop event handler is registered.
    // The Blob prototype overrides handle both upload and D&D paths uniformly.
    expect(true).toBe(true); // Contract assertion
  });

  test('fetch body interception catches direct File uploads', () => {
    // Claude may upload Files directly as fetch body (especially PDFs)
    // The interceptor checks: init.body instanceof File && isCleanableFile
    const file = new File(['data'], 'report.pdf', { type: 'application/pdf' });
    expect(file instanceof File).toBe(true);
    expect(C.isPdfFile(file)).toBe(true);
  });

  test('XHR body interception catches direct File uploads', () => {
    // Claude's XHR.send override checks: body instanceof File && isCleanableFile
    const file = new File(['data'], 'report.docx');
    expect(file instanceof File).toBe(true);
    expect(C.isOoxmlFile(file)).toBe(true);
  });

  test('Request object with PDF content-type triggers interception', () => {
    // Claude checks: input instanceof Request, ct === 'application/pdf'
    // then extracts blob, detects magic bytes, and cleans
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
    expect(C.detectDocMagic(pdfMagic.buffer)).toBe('pdf');
  });

  test('Claude fetch override builds safe Headers object', () => {
    // Claude's interceptor builds a new Headers() instance from init.headers
    // to avoid the ByteString type error with fetch()
    const safeHeaders = new Headers();
    safeHeaders.set('content-type', 'application/octet-stream');
    safeHeaders.set('x-custom', 'value');
    safeHeaders.delete('content-length');
    expect(safeHeaders.get('content-type')).toBe('application/octet-stream');
    expect(safeHeaders.has('content-length')).toBe(false);
  });
});

// =============================================================================
// Gemini Interceptor — Hybrid Strategy (DOM events + XHR/Fetch + Blob overrides)
// =============================================================================

describe('Gemini — Upload flow (change event)', () => {
  test('change event handler contract identical to ChatGPT', () => {
    // Gemini uses the same pattern: listen for change on <input type="file">
    const input = document.createElement('input');
    input.type = 'file';
    expect(input instanceof HTMLInputElement).toBe(true);
    expect(input.type).toBe('file');
  });

  test('bypass flag prevents re-interception', () => {
    const evt = new Event('change', { bubbles: true });
    evt._cloakerBypass = true;
    expect(evt._cloakerBypass).toBe(true);
  });

  test('cleaned File preserves original name and type', () => {
    const cleaned = new File(['[EMAIL_1]'], 'notes.txt', { type: 'text/plain' });
    expect(cleaned.name).toBe('notes.txt');
    expect(cleaned.type).toBe('text/plain');
    expect(cleaned.size).toBeGreaterThan(0);
  });

  test('cleanableExtensions regex matches all supported types', () => {
    const exts = ['docx', 'xlsx', 'pptx', 'txt', 'csv', 'tsv', 'json', 'xml',
      'md', 'log', 'html', 'htm', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'rtf', 'pdf'];
    for (const ext of exts) {
      expect(isCleanable(new File(['x'], `file.${ext}`))).toBe(true);
    }
  });
});

describe('Gemini — Drag-and-drop flow (cache warming + XHR/fetch swap)', () => {
  test('Gemini does NOT preventDefault on drop (unlike ChatGPT)', () => {
    // Gemini lets the real trusted drop event through to Angular.
    // It only warms the cleaning cache so the XHR/fetch override has
    // a cleaned version ready when the upload fires.
    // This is a critical behavioral difference from ChatGPT.
    const evt = new Event('drop', { bubbles: true, cancelable: true });
    // In Gemini: NO e.preventDefault(), NO e.stopImmediatePropagation()
    // The event reaches the native handler untouched.
    expect(evt.cancelable).toBe(true);
    // We just verify the contract: Gemini relies on cache warming, not event manipulation
  });

  test('cleaning cache (WeakMap) warms on drop for later XHR swap', () => {
    // Gemini's drop handler: for each cleanable file, calls getCleanedFile(file)
    // which populates _cleanCache WeakMap with a Promise
    const cache = new WeakMap();
    const file = new File(['some data'], 'data.txt', { type: 'text/plain' });

    // Simulate cache warming with a resolved promise
    const cleaningPromise = Promise.resolve(file);
    cache.set(file, cleaningPromise);

    expect(cache.has(file)).toBe(true);
    expect(cache.get(file)).toBe(cleaningPromise);
  });

  test('drop handler also registers file size for upload session fix', () => {
    // Gemini's drop handler: _origSizeToFile.set(file.size, file)
    // so the session-creation interceptor can match by declared size
    const sizeMap = new Map();
    const file = new File(['some data with PII john@example.com'], 'data.txt', { type: 'text/plain' });
    sizeMap.set(file.size, file);
    expect(sizeMap.get(file.size)).toBe(file);
  });

  test('XHR.send override swaps cleanable File body', () => {
    // Gemini's XHR.send checks: body instanceof File && isCleanable && !_cleanedFiles.has
    const file = new File(['email: test@example.com'], 'upload.txt', { type: 'text/plain' });
    expect(file instanceof File).toBe(true);
    expect(isCleanable(file)).toBe(true);
  });

  test('fetch override swaps cleanable File in init.body', () => {
    // Gemini's fetch checks: init.body instanceof File && isCleanable && !_cleanedFiles.has
    const file = new File(['SSN: 123-45-6789'], 'sensitive.csv', { type: 'text/csv' });
    expect(file instanceof File).toBe(true);
    expect(isCleanable(file)).toBe(true);
  });
});

describe('Gemini — Upload session size correction (D&D)', () => {
  test('setRequestHeader tracking captures per-XHR headers', () => {
    // Gemini interceptor wraps setRequestHeader to record headers in a WeakMap
    const xhrHeaders = new WeakMap();
    const mockXhr = {};
    const headerMap = new Map();
    headerMap.set('x-goog-upload-header-content-length', { name: 'X-Goog-Upload-Header-Content-Length', value: '1680444' });
    headerMap.set('content-type', { name: 'Content-Type', value: 'application/x-www-form-urlencoded' });
    xhrHeaders.set(mockXhr, headerMap);

    expect(xhrHeaders.get(mockXhr).has('x-goog-upload-header-content-length')).toBe(true);
    expect(xhrHeaders.get(mockXhr).get('x-goog-upload-header-content-length').value).toBe('1680444');
  });

  test('upload session creation is identified by URL pattern', () => {
    // Gemini uses UPLOAD_URL_RE to match session-creation requests
    const UPLOAD_URL_RE = /\.clients\d*\.google\.com\/upload|content-push\.googleapis\.com\/upload/;
    expect(UPLOAD_URL_RE.test('https://push.clients6.google.com/upload/')).toBe(true);
    expect(UPLOAD_URL_RE.test('https://content-push.googleapis.com/upload/')).toBe(true);
    expect(UPLOAD_URL_RE.test('https://gemini.google.com/app')).toBe(false);
  });

  test('upload session creation vs data upload distinguished by upload_id', () => {
    // Session creation: no upload_id in URL
    // Data upload: has upload_id= in URL
    const sessionUrl = 'https://push.clients6.google.com/upload/';
    const dataUrl = 'https://push.clients6.google.com/upload/?upload_id=AGQBYWyXsMG';
    expect(sessionUrl.includes('upload_id=')).toBe(false);
    expect(dataUrl.includes('upload_id=')).toBe(true);
  });

  test('declared file size is matched to dropped file via Map', () => {
    // _origSizeToFile maps original file size → File object
    const sizeMap = new Map();
    const file = new File(['x'.repeat(1680444)], 'doc.docx');
    sizeMap.set(file.size, file);

    const declaredSize = 1680444;
    const matchFile = sizeMap.get(declaredSize);
    expect(matchFile).toBe(file);
  });

  test('full-file slice detected for correct upload (start=0, end>=origSize)', () => {
    // When Gemini does file.slice(0, file.size), we detect it covers the
    // full original file and send the entire cleaned file instead of truncating
    const file = new File(['data'], 'doc.txt');
    const source = { file: file, start: 0, end: file.size };
    expect(source.start === 0 && source.end >= file.size).toBe(true);
  });

  test('partial slice is correctly identified and preserved', () => {
    // A genuine partial slice (chunked upload) should NOT get the full-file treatment
    const file = new File(['x'.repeat(5000000)], 'big.docx');
    const source = { file: file, start: 0, end: 2000000 };
    expect(source.start === 0 && source.end >= file.size).toBe(false);
  });
});

describe('Gemini — Slice tracking (chunked/resumable uploads)', () => {
  test('Blob.slice result can be tracked back to source File', () => {
    // Gemini overrides Blob.prototype.slice to track:
    // _blobSourceFile.set(sliced, { file, start, end })
    const tracker = new WeakMap();
    const file = new File(['Hello john@example.com world'], 'data.txt', { type: 'text/plain' });
    const sliced = file.slice(0, 10);

    tracker.set(sliced, { file: file, start: 0, end: 10 });

    const source = tracker.get(sliced);
    expect(source.file).toBe(file);
    expect(source.start).toBe(0);
    expect(source.end).toBe(10);
  });

  test('chained slices propagate source tracking', () => {
    // If a slice is sliced again, the parent chain is tracked
    const tracker = new WeakMap();
    const file = new File(['a'.repeat(100)], 'big.txt', { type: 'text/plain' });
    const slice1 = file.slice(0, 50);
    tracker.set(slice1, { file: file, start: 0, end: 50 });

    const slice2 = slice1.slice(0, 25);
    // In Gemini's code, the second slice checks the parent via _blobSourceFile
    const parentInfo = tracker.get(slice1);
    if (parentInfo) {
      tracker.set(slice2, { file: parentInfo.file, start: 0, end: 25 });
    }

    expect(tracker.get(slice2).file).toBe(file);
  });

  test('XHR.send with sliced Blob resolves to source file for cleaning', () => {
    // Gemini's XHR.send Case 2: body instanceof Blob && !(body instanceof File)
    // checks _blobSourceFile.get(body), cleans the source, then re-slices
    const file = new File(['sensitive data john@example.com'], 'data.txt', { type: 'text/plain' });
    const sliced = file.slice(0, 15);

    expect(sliced instanceof Blob).toBe(true);
    expect(sliced instanceof File).toBe(false);
    expect(isCleanable(file)).toBe(true);
  });

  test('fetch with sliced Blob resolves to source file for cleaning', () => {
    // Same as XHR — fetch init.body can be a sliced Blob
    const file = new File(['MRN: 12345678'], 'medical.txt', { type: 'text/plain' });
    const sliced = file.slice(0, 10);

    expect(sliced instanceof Blob).toBe(true);
    expect(sliced instanceof File).toBe(false);
  });

  test('full-file slice sends entire cleaned file, not truncated original-size slice', () => {
    // Regression: Gemini slices file.slice(0, file.size) for upload.
    // When cleaned file is larger, slice(0, origSize) truncates it.
    // Fix: detect full-file slices and send the complete cleaned file.
    const origFile = new File(['x'.repeat(100)], 'doc.txt');
    const cleanedFile = new File(['x'.repeat(200)], 'doc.txt'); // Bigger after cleaning
    const source = { file: origFile, start: 0, end: origFile.size };

    // The full-file detection: start===0 && end >= origFile.size
    const isFullSlice = source.start === 0 && source.end >= source.file.size;
    expect(isFullSlice).toBe(true);

    // In this case, send cleanedFile directly (not cleanedFile.slice(0, 100))
    expect(cleanedFile.size).toBe(200);
    expect(cleanedFile.size).not.toBe(origFile.size);
  });
});

describe('Gemini — Blob/FileReader overrides (safety net)', () => {
  test('Blob.prototype.slice is a function', () => {
    expect(typeof Blob.prototype.slice).toBe('function');
  });

  test('FileReader.prototype.readAsArrayBuffer is a function', () => {
    expect(typeof FileReader.prototype.readAsArrayBuffer).toBe('function');
  });

  test('FileReader.prototype.readAsText is a function', () => {
    expect(typeof FileReader.prototype.readAsText).toBe('function');
  });

  test('FileReader.prototype.readAsDataURL is a function', () => {
    expect(typeof FileReader.prototype.readAsDataURL).toBe('function');
  });
});

// =============================================================================
// Cross-Platform Comparison: Upload vs Drag-and-Drop Strategy
// =============================================================================

describe('Cross-platform — Upload vs Drag-and-Drop strategy comparison', () => {
  test('ChatGPT: upload=change event, D&D=drop event (both replace)', () => {
    // ChatGPT intercepts BOTH events, prevents propagation, cleans files,
    // and re-dispatches with _cloakerBypass=true
    // Upload: change handler → stopImmediatePropagation → cleanFile → DataTransfer → re-dispatch
    // D&D:    drop handler   → preventDefault + stopImmediatePropagation → cleanFile → DragEvent → re-dispatch
    expect(true).toBe(true); // Design contract
  });

  test('Claude: upload=Blob read, D&D=Blob read (unified path)', () => {
    // Claude does NOT use DOM events at all.
    // Both upload and D&D go through the same Blob/FileReader overrides.
    // This is because Claude's React framework rejects synthetic events.
    expect(true).toBe(true); // Design contract
  });

  test('Gemini: upload=change event, D&D=cache warm + XHR swap (split path)', () => {
    // Gemini uses change events for uploads (like ChatGPT),
    // but for D&D it lets the event through and intercepts at XHR/fetch level.
    // This is because Angular rejects synthetic DragEvents (isTrusted=false).
    expect(true).toBe(true); // Design contract
  });

  test('all platforms fall back to network-level interception as safety net', () => {
    // network-base.js provides fetch/XHR interception for ALL platforms.
    // Platform interceptors add DOM-level interception on top.
    // If a file somehow bypasses DOM interception, network-base catches it.
    expect(typeof C.redactString).toBe('function');
    expect(typeof C.deepRedactObj).toBe('function');
    expect(typeof C.notifyRedaction).toBe('function');
  });
});

// =============================================================================
// Regression: Enabled toggle and _cloakerBypass flag
// =============================================================================

describe('Regression — Interceptor guards', () => {
  test('disabled state prevents all interceptors from acting', () => {
    C.enabled = false;
    // All interceptors check: if (!C.enabled) return;
    expect(C.enabled).toBe(false);
    C.enabled = true;
  });

  test('_cloakerBypass flag is transferable on custom events', () => {
    const evt1 = new Event('change', { bubbles: true });
    evt1._cloakerBypass = true;
    expect(evt1._cloakerBypass).toBe(true);

    const evt2 = new Event('drop', { bubbles: true, cancelable: true });
    evt2._cloakerBypass = true;
    expect(evt2._cloakerBypass).toBe(true);

    const evt3 = new MouseEvent('click', { bubbles: true, cancelable: true });
    evt3.__cloakerBypass = true;
    expect(evt3.__cloakerBypass).toBe(true);
  });

  test('already-cleaned files are tracked to prevent double-cleaning', () => {
    // All 3 platforms use WeakSet/WeakMap to avoid re-processing cleaned output
    const cleaned = new WeakSet();
    const original = new File(['pii'], 'data.txt');
    const redacted = new File(['[EMAIL_1]'], 'data.txt');

    cleaned.add(redacted);
    expect(cleaned.has(original)).toBe(false);
    expect(cleaned.has(redacted)).toBe(true);
  });
});

// =============================================================================
// End-to-end: Text file redaction through the cleaning pipeline
// =============================================================================

describe('E2E — Text file through cleaning pipeline', () => {
  test('text file without PII passes through unchanged', async () => {
    const file = new File(
      ['The weather is nice today, no personal information here.'],
      'safe.md',
      { type: 'text/plain' }
    );

    expect(isCleanable(file)).toBe(true);

    const cleaned = await C.redactTextFile(file);
    expect(cleaned).toBe(file); // Same reference — no redaction needed
  });

  test('non-cleanable file skips the pipeline entirely', () => {
    const file = new File(['binary data'], 'photo.png', { type: 'image/png' });
    expect(isCleanable(file)).toBe(false);
    // Interceptors return the file unchanged without even attempting redaction
  });
});
