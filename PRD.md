# Blankit <img width="30" height="30" alt="icon48" src="https://github.com/user-attachments/assets/5e77145a-1ca4-49de-8ddf-54accbd1916d" /> : Product Requirements Document (PRD)

**Version:** 1.0.2  
**Last Updated:** March 24, 2026  
**Status:** 🟢 [Live](https://chromewebstore.google.com/detail/crossout/oihdkggpbopimdndhephiechoegagoeb)<br>
**Platform:** Google Chrome Extension 

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Target Users](#4-target-users)
5. [Supported Platforms](#5-supported-platforms)
6. [Architecture Overview](#6-architecture-overview)
7. [Core Feature Specifications](#7-core-feature-specifications)
   - 7.1 [PII/PHI Detection Engine](#71-piiphi-detection-engine)
   - 7.2 [Network-Level Interception (API Override Hook)](#72-network-level-interception-api-override-hook)
   - 7.3 [UI Input Interception](#73-ui-input-interception)
   - 7.4 [Document Upload Redaction](#74-document-upload-redaction)
   - 7.5 [Redaction Map & Reversibility](#75-redaction-map--reversibility)
   - 7.6 [Popup Control Panel](#76-popup-control-panel)
   - 7.7 [In-Page Visual Indicators](#77-in-page-visual-indicators)
   - 7.8 [Audit Log](#78-audit-log)
   - 7.9 [Settings & Persistence](#79-settings--persistence)
8. [Detailed Detection Categories](#8-detailed-detection-categories)
9. [Document Format Support](#9-document-format-support)
10. [Communication Architecture](#10-communication-architecture)
11. [Data Storage Schema](#11-data-storage-schema)
12. [UI/UX Specifications](#12-uiux-specifications)
13. [Security & Privacy Model](#13-security--privacy-model)
14. [Technical Constraints & Limits](#14-technical-constraints--limits)
15. [External Dependencies](#15-external-dependencies)
16. [File Structure](#16-file-structure)
17. [Glossary](#17-glossary)

---

## 1. Executive Summary

**Blankit** is a Chrome browser extension that provides real-time, local-first redaction of Personally Identifiable Information (PII) and Protected Health Information (PHI) when users interact with cloud-based Large Language Models (LLMs). All detection and redaction processing occurs entirely within the user's browser — no data is transmitted to any external server. The extension makes **zero outgoing network calls** — there is no analytics or telemetry code. Blankit operates as a transparent safety net at the network boundary, intercepting outgoing requests to LLM APIs and scrubbing sensitive data before it leaves the browser.

### Key Capabilities

- **Real-time PII/PHI redaction** at both the UI and network layers
- **Document redaction** for DOCX, XLSX, PPTX, TXT, CSV, and 15+ text formats (PDF is partially supported)
- **In-page un-redact toggle** to reveal original values without leaving the AI interface
- **Audit log** with full redaction event history, exportable as JSON
- **Scrub bubble** with instant download of cleaned documents
- **Per-platform file upload interception** (ChatGPT via DOM events, Claude via Blob/FileReader prototypes)
- **Freemium monetization** has been removed — all features including document redaction are now completely free and unlimited
- **Zero network calls** — all processing is 100% local

---

## 2. Problem Statement

Users routinely paste or upload documents containing sensitive personal information (names, SSNs, medical records, addresses, etc.) into cloud-hosted AI assistants like ChatGPT, Claude, and Gemini. This creates significant privacy and compliance risks:

- **HIPAA violations** when healthcare data is sent to third-party AI services.
- **PII exposure** when user data in prompts or uploaded documents reaches cloud servers.
- **Regulatory non-compliance** with GDPR, CCPA, and other data protection frameworks.
- **Accidental disclosure** by users who are unaware their prompts contain sensitive data.

Existing solutions require server-side processing, manual review, or enterprise DLP tools that don't integrate with consumer AI products. There is no lightweight, client-side solution that operates transparently within the LLM interface itself.

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Description |
|---|------|-------------|
| G1 | **100% local processing** | All PII/PHI detection and redaction must occur entirely in the browser. Zero data exfiltration. |
| G2 | **Transparent interception** | Users should be able to use LLM interfaces normally; redaction happens automatically without disrupting workflows. |
| G3 | **Multi-format support** | Redact PII in plain text prompts, JSON API payloads, and uploaded documents (DOCX, XLSX, PPTX, TXT, CSV, and 15+ text formats). PDF is partially supported. |
| G4 | **Reversible redaction** | Maintain a session-local mapping of placeholders → original values so users can reconstruct original data if needed. In-page un-redact toggle allows revealing original values without leaving the AI interface. |
| G5 | **Granular control** | Users can toggle individual detection categories on/off and enable/disable the entire extension with one click. |
| G6 | **Network-level guarantee** | Even if UI-level interception is bypassed, the network interceptor must catch and redact PII before any API request leaves the browser. |
| G7 | **Audit trail** | Maintain a full audit log of all redaction events with timestamps, platforms, categories, and source details. Exportable as JSON. |

### Non-Goals

| # | Non-Goal | Rationale |
|---|----------|-----------|
| N1 | Server-side processing | All redaction is client-side. No backend server required. |
| N2 | Support for non-Chromium browsers | Initial scope is Chrome only (Manifest V3). |
| N3 | Real-time de-redaction of AI responses | Cloaker redacts outgoing data only; it does not modify incoming responses. |
| N4 | Enterprise-grade DLP policy management | This is a consumer/individual tool, not an enterprise admin console. |
| N5 | Image/video/audio PII detection | Only text-based PII in text, documents, and structured data is in scope. |
| N6 | Custom regex / user-defined patterns | Custom words now support auto-detected regex patterns containing metacharacters. |

---

## 4. Target Users

| Persona | Description |
|---------|-------------|
| **Healthcare Professional** | Doctors, nurses, medical coders who use AI assistants for research, documentation, or coding queries and may inadvertently include patient data. |
| **Knowledge Worker** | Employees who paste internal documents, emails, or spreadsheets into AI tools for summarization, translation, or analysis. |
| **Developer** | Engineers who paste code snippets, logs, or configuration files containing API keys, IP addresses, or personal data. |
| **Student / Researcher** | Users who upload research documents or datasets containing subject PII into AI assistants. |
| **Privacy-Conscious Individual** | Anyone who wants an automatic safety net when interacting with cloud AI services. |

---

## 5. Supported Platforms

| Platform | URL Pattern | File Upload Status | Text Redaction Status |
|----------|-------------|--------------------|-----------------------|
| **ChatGPT** | `https://chatgpt.com/*` | ✅ Working | ✅ Working |
| **Claude** | `https://claude.ai/*` | ✅ Working | ✅ Working |
| **Gemini** | `https://gemini.google.com/*` | ✅ Working | ✅ Working |

All three platforms are configured as `host_permissions` and `content_scripts.matches` targets in the extension manifest.

### 5.1 Per-Platform Isolation (Anti-Regression Architecture)

Each platform uses a **completely independent file upload interception strategy**, decoupled into its own section of the codebase. This prevents changes for one platform from causing regressions on another. The strategies differ because each LLM site uses fundamentally different upload mechanisms:

| Platform | Upload Mechanism | Interception Strategy | Why This Works |
|----------|-----------------|----------------------|----------------|
| **ChatGPT** | `<input type="file">` change event → FormData via fetch | **DOM event interception**: Capture-phase `change` listener blocks the event, cleans files async, swaps `input.files` via `DataTransfer`, re-dispatches with bypass flag | ChatGPT (React) re-reads `input.files` on each change event; the re-dispatched event is trusted because the native input element fires it |
| **Claude** | `<input type="file">` → `Blob.prototype.arrayBuffer()` / `FileReader` for content reading | **Blob/FileReader prototype override**: Overrides `Blob.prototype.arrayBuffer()`, `.text()`, `.stream()`, and all `FileReader.read*()` methods so any code reading file content transparently gets the cleaned version | Claude's framework reads file content via standard Blob/FileReader APIs; intercepting at this level works regardless of the framework's internal upload mechanism |
| **Gemini** | `<input type="file">` change event + Base64 inline data in JSON body / Files API resumable upload via XHR | **Hybrid: DOM event interception + XHR/Fetch upload swap + File.prototype.name override + resumable upload size correction**: Capture-phase `change` listener cleans files before Gemini sees them. For drag-and-drop, the real trusted `drop` event passes through (Angular rejects synthetic DragEvents) while the cleaning cache is pre-warmed and `File.prototype.name` is overridden to return the redacted filename synchronously — so Gemini reads the redacted name even from the original File object. A key-based dedup cache (`name|size|lastModified`) prevents double-cleaning when Gemini creates separate JS references to the same file. Outgoing XHR/fetch uploads are intercepted and swapped with cleaned versions. For resumable uploads, `x-goog-upload-header-content-length` headers are corrected to match the cleaned file size. Blob slicing is tracked via WeakMap so chunked uploads use cleaned content. | Gemini (Angular) rejects synthetic events, so file-input interception uses DataTransfer swap (like ChatGPT) while drag-and-drop relies on intercepting the actual upload XHR/fetch layer plus `File.prototype.name` override for filename redaction |

---

## 6. Architecture Overview

### Dual-World Content Script Architecture

Cloaker uses Chrome's Manifest V3 content script worlds to achieve both network-level interception and Chrome API access:

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Chrome)                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              LLM Website (e.g., chatgpt.com)          │   │
│  │                                                        │   │
│  │  ┌─────────────────────┐  window.postMessage          │   │
│  │  │   MAIN World        │◄────────────────────┐        │   │
│  │  │   (intercept.js)    │                     │        │   │
│  │  │                     │────────────────────►│        │   │
│  │  │  • fetch patch      │   CLOAKER_READY     │        │   │
│  │  │  • XHR patch        │   CLOAKER_*_REDACT  │        │   │
│  │  │  • UI interception  │                     │        │   │
│  │  │  • PII engine       │  ┌──────────────────┴──┐     │   │
│  │  │  • Doc handlers     │  │  ISOLATED World     │     │   │
│  │  └─────────────────────┘  │  (content.js)       │     │   │
│  │                           │                     │     │   │
│  │                           │  • chrome.storage   │     │   │
│  │                           │  • chrome.runtime   │     │   │
│  │                           │  • Banner UI        │     │   │
│  │                           │  • Badge UI         │     │   │
│  │                           │  • Stats tracking   │     │   │
│  │                           └──────────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────┐    ┌─────────────────┐                     │
│  │ background.js│    │  popup.html/js   │                     │
│  │ (service wkr)│◄──►│  (control panel) │                     │
│  └─────────────┘    └─────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

| World | Script(s) | Run At | Purpose |
|-------|-----------|--------|---------|
| **MAIN** | `jszip-pre.js`, `jszip.min.js`, `jszip-post.js`, `compromise.min.js`, `pii-engine.js`, `doc-handlers.js`, `*/selectors.js`, `network-base.js`, `*/interceptor.js` | `document_start` | Runs in the page's own JavaScript context. Can monkey-patch `window.fetch` and `XMLHttpRequest.prototype` before any page code loads. Has direct access to all native browser APIs as the page sees them. |
| **ISOLATED** | `bridge.js`, `styles.css` | `document_idle` | Runs in Chrome's isolated content script world. Has access to `chrome.storage`, `chrome.runtime`, and other extension APIs. Cannot directly access `window.fetch` or page JS objects. Manages UI overlays (banner, badge, un-redact toggle, scrub bubble) and bridges settings to the MAIN world via `window.postMessage`. |

#### JSZip Isolation Wrappers

JSZip's minified build overwrites `window.postMessage` with a Zone.js-aware wrapper on sites like Gemini (which uses Angular). To prevent this, JSZip is sandwiched between two wrapper scripts:

- **`jszip-pre.js`**: Saves a reference to the original `window.postMessage` before JSZip loads.
- **`jszip-post.js`**: Restores the original `window.postMessage` after JSZip finishes loading.

This ensures that the extension's `window.postMessage` bridge (used for MAIN ↔ ISOLATED world communication) is never corrupted by JSZip's initialization.

### Why Two Worlds?

| Requirement | Solution |
|-------------|----------|
| Intercept `fetch`/`XHR` before the site's own code | MAIN world injection at `document_start` |
| Access `chrome.storage` for persisting settings and stats | ISOLATED world content script |
| Bridge settings changes from popup → network interceptor | `chrome.tabs.sendMessage` → ISOLATED → `window.postMessage` → MAIN |

---

## 7. Core Feature Specifications

### 7.1 PII/PHI Detection Engine

**Location:** `src/core/pii-engine.js` — functions `redactString()` and `deepRedactObj()`

#### 7.1.1 `redactString(text)`

The primary detection function. Takes an arbitrary string and returns:

```typescript
{ result: string, items: Array<{ type: string, placeholder: string }> }
```

**Behavior:**
1. Short-circuits if input is empty or < 3 characters.
2. Iterates through all 17 pattern categories (see [Section 8](#8-detailed-detection-categories)), ordered from most-specific to most-generic to prevent pattern conflicts.
3. For each enabled category, applies the regex globally to the text.
4. Each match is replaced with a deterministic placeholder token: `[LABEL_N]` (e.g., `[EMAIL_1]`, `[SSN_5]`).
5. The original value → placeholder mapping is stored in `redactionMap`.
6. Already-redacted tokens (matching `/^\[.+_\d+\]$/`) are skipped to prevent double-redaction.
7. After regex-based categories, applies **NLP-powered name detection** (if enabled): uses compromise.js for natural language person recognition, supplemented by a standalone common names pass (∼40 top Western and Indian names). Falls back to multi-word Title Case regex when NLP is unavailable.
8. After name detection, applies **custom word redaction**: iterates through `C.customWords` (user-defined words). Words containing regex metacharacters (`[ ] { } ( ) | \\ * + ?`) are auto-detected and used as regex patterns; plain words use escaped word-boundary matching. Each occurrence generates a unique random 6-character hex hash wrapped in brackets (e.g., `[a3f7x2]`), preventing reversal by trial and error.

#### 7.1.2 `deepRedactObj(obj)`

Recursively walks a JSON object/array structure, applying `redactString()` to every string value ≥ 5 characters. Used for redacting structured JSON API payloads.

#### 7.1.3 Placeholder Format

```
[TYPE_N]
```

- `TYPE`: Category label (e.g., `EMAIL`, `PHONE`, `SSN`, `CC`, `ADDR`, `NAME`, `DOB`, `MRN`, `IP`, `PASSPORT`, `DL`, `TAXID`, `BANK`, `MAC`, `URL`, `SECRET`, `UUID`)
- `N`: Monotonically increasing counter (global across all categories per page load)

Custom words use a different format: `[HASH]` where `HASH` is a non-deterministic 6-character hex string (e.g., `[a3f7x2]`).

**Examples:** `[EMAIL_1]`, `[NAME_3]`, `[SSN_7]`, `[ADDR_12]`, `[PASSPORT_2]`, `[UUID_1]`, `[a3f7x2]`

---

### 7.2 Network-Level Interception (API Override Hook)

**Location:** `src/core/network-base.js` — fetch and XHR monkey-patching

This is Blankit's core safety net. It wraps the browser's native `fetch` and `XMLHttpRequest` APIs so that every outgoing request from the LLM site is inspected and, if necessary, scrubbed before the data reaches the server.

#### 7.2.0 URL Filtering (Smart Body Consumption)

Not all POST requests carry user-generated content. Many internal API calls (telemetry, connectors, session init) should not have their bodies consumed or redacted. The interceptor uses a whitelist of URL patterns to decide which requests get JSON/text body redaction:

```javascript
const REDACT_URL_PATTERNS = [
    /\/backend-api\/conversation($|\?)/,       // ChatGPT send message
    /\/backend-api\/f\/conversation($|\?)/,     // ChatGPT file conversation
    /\/api\/append_message/,                     // Claude send message
    /\/api\/organizations\/.+\/chat_conversations\/.+\/completion/, // Claude
    /\/api\/generate/,                           // Gemini
    /BatchExecute/,                               // Gemini batch RPC
];
```

**Rules:**
- **FormData bodies** (file uploads): Always inspected, regardless of URL.
- **JSON/text string bodies**: Only redacted if the URL matches `REDACT_URL_PATTERNS`.
- **Request body consumption**: For `Request` objects (where body is in the Request, not in `init`), the body is only consumed (`await input.formData()` or `await input.text()`) if the URL matches or the content-type is multipart. This prevents breaking internal API calls that fail when their body stream is consumed.

#### 7.2.1 Fetch Interceptor

**Patched API:** `window.fetch`

**Flow:**

```
Site calls fetch(url, init) or fetch(Request)
          │
          ▼
    Is enabled? ──No──► Pass through to original fetch
          │
         Yes
          │
    Is method GET/HEAD? ──Yes──► Pass through
          │
          No
          │
    ┌─── Does init.body exist? ───┐
    │                              │
   Yes (CASE A)              No (CASE B)
    │                              │
    ▼                              ▼
  Identify body type:       Is input a Request
  • FormData                with .body?
  • Blob/File                     │
  • ArrayBuffer/TypedArray       Yes
  • String (JSON)                 │
    │                        Read content-type:
    ▼                        • JSON/text → .text()
  Redact body                • multipart → .formData()
    │                        • other → .blob()
    ▼                              │
  sendWith(newBody)                ▼
    │                        Redact body
    ▼                              │
  origFetch(url, opts)             ▼
  (decomposed, never              sendWith(newBody)
   new Request())
```

**Key Design Principle — `sendWith()` Helper:**

The `sendWith(newBody, dropCT)` function **never constructs a `new Request()` object**. Instead, it decomposes the original Request into a plain URL string and an options object:

```javascript
origFetch(url, {
    method, headers, body: newBody,
    credentials, cache, redirect,
    referrer, referrerPolicy, signal, mode
})
```

This avoids the "body already consumed" error that occurs when constructing `new Request(existingRequest, { body })` after the original Request's body stream has been read.

**Additional behaviors:**
- `Content-Length` header is always stripped (via `stripContentLength()`) so the browser recalculates it for the modified body.
- `Content-Type` header is stripped when replacing FormData bodies (so the browser generates the correct multipart boundary for the new FormData).

#### 7.2.2 XHR Interceptor

**Patched APIs:**
- `XMLHttpRequest.prototype.open` — captures HTTP method into `this._cloakerMethod`
- `XMLHttpRequest.prototype.send` — intercepts outgoing body

**Flow:**

```
Site calls xhr.send(body)
          │
          ▼
    Is enabled? ──No──► Pass through
          │
         Yes
          │
    Is method GET/HEAD or body null? ──Yes──► Pass through
          │
          No
          │
    Identify body type:
    • FormData    → redactFormData(body).then(...)
    • Blob/File   → tryRedactBlob(body).then(...)
    • ArrayBuffer → detectDocMagic(buf) → handler(file).then(...)
    • String      → JSON.parse → deepRedactObj → origXHRSend.call(xhr, ...)
```

**Note:** Because `XHR.send()` is a synchronous API, all async redaction handlers use `.then()/.catch()` chains (not `async/await`). The original `send()` call is deferred until the async redaction completes, with a `.catch()` fallback that sends the original unmodified body if redaction fails.

#### 7.2.3 Supported Body Types

| Body Type | Detection Method | Redaction Handler | Both Fetch & XHR |
|-----------|-----------------|-------------------|:---:|
| `FormData` | `instanceof FormData` | `redactFormData()` — iterates entries, routes files by type/extension | ✅ |
| `Blob` / `File` | `instanceof Blob` | `tryRedactBlob()` — format detection by extension → MIME → magic bytes | ✅ |
| `ArrayBuffer` / `TypedArray` | `instanceof ArrayBuffer` or `ArrayBuffer.isView()` | `detectDocMagic()` → `redactOoxmlFile()` | ✅ |
| `string` (JSON) | `typeof body === 'string'` + `JSON.parse()` | `deepRedactObj()` — recursive JSON walker | ✅ |
| `ReadableStream` | — | Not intercepted (pass-through) | ✅ |

---

### 7.3 UI Input Interception

**Location:** `src/core/network-base.js` — `keydown` and `click` event listeners (capture phase)

Provides a visual-feedback layer that intercepts user input at the UI level before the site's own event handlers process it.

#### 7.3.1 Enter Key Interception

- **Event:** `keydown` on `document`, capture phase (`useCapture: true`)
- **Trigger:** Enter key pressed without Shift, Ctrl, Alt, or Meta modifiers
- **Guard:** Skips if `__cloakerBypass` flag is set on the event
- **Flow:**
  1. Finds chat input element using prioritized selector list (10 selectors covering ChatGPT, Claude, Gemini, ProseMirror, Quill, etc.)
  2. Checks that the active element is within the input area
  3. Reads text from input (`.value` for textarea, `.innerText` for contenteditable)
  4. Applies `redactString()` — if no PII found, event passes through normally
  5. If PII detected: `preventDefault()` + `stopImmediatePropagation()` blocks the send
  6. Replaces text in the input area visually (using property descriptor setters for textarea, `execCommand('insertText')` for ProseMirror contenteditable)
  7. Posts `CLOAKER_INPUT_REDACTION` message to window
  8. After **900ms delay**: auto-clicks the send button (or simulates Enter) with `__cloakerBypass = true`

#### 7.3.2 Send Button Click Interception

- **Event:** `click` on `document`, capture phase
- **Trigger:** Click on any element matching send button selectors
- **Same flow** as Enter key: intercept → redact → replace text → re-dispatch click after 900ms with `__cloakerBypass`

#### 7.3.3 Input Area Selectors (Priority Order)

| # | CSS Selector | Target |
|---|-------------|--------|
| 1 | `#prompt-textarea` | ChatGPT main input |
| 2 | `div[contenteditable="true"][id="prompt-textarea"]` | ChatGPT contenteditable variant |
| 3 | `textarea[id="prompt-textarea"]` | ChatGPT textarea variant |
| 4 | `[contenteditable="true"].ProseMirror` | Claude (ProseMirror editor) |
| 5 | `div.ProseMirror[contenteditable="true"]` | Claude alternate |
| 6 | `.ql-editor[contenteditable="true"]` | Quill.js-based editors |
| 7 | `div[contenteditable="true"][role="textbox"]` | Gemini / generic ARIA textbox |
| 8 | `div[contenteditable="true"][data-placeholder]` | Gemini / generic with placeholder |
| 9 | `form textarea` | Generic fallback |
| 10 | `div[contenteditable="true"]` | Broadest fallback |

#### 7.3.4 Send Button Selectors

| CSS Selector | Target |
|-------------|--------|
| `button[data-testid="send-button"]` | ChatGPT |
| `button[data-testid="composer-send-button"]` | ChatGPT variant |
| `button[aria-label="Send message"]` | Claude |
| `button[aria-label*="Send"]:not([disabled])` | Gemini / generic |

---

### 7.4 Document Upload Redaction

**Location:** `src/core/doc-handlers.js` + `src/core/network-base.js` — functions `redactOoxmlFile()`, `redactTextFile()`, `redactFormData()`, `tryRedactBlob()`

Blankit intercepts file uploads using **platform-specific strategies** (see [Section 5.1](#51-per-platform-isolation-anti-regression-architecture)) and redacts PII within the document content before the file data reaches the LLM server.

#### 7.4.0 Per-Platform File Upload Interception

##### ChatGPT: DOM Event Interception

ChatGPT uses standard `<input type="file">` elements. Cloaker intercepts at the DOM event level:

```
User picks file → Browser fires 'change' event on <input type="file">
          │
          ▼
    Cloaker capture-phase listener fires FIRST
          │
    Any cleanable files? (.docx, .txt, etc.)
          │
         Yes ──► stopImmediatePropagation() blocks site handlers
          │
    Clean files async (redactOoxmlFile / redactTextFile)
          │
    Create DataTransfer with cleaned File objects
          │
    input.files = cleanedDataTransfer.files
          │
    Re-dispatch new Event('change') with _cloakerBypass flag
          │
    ChatGPT's React handler picks up cleaned files from input.files
          │
    Upload proceeds with redacted content ✅
```

**Also handles drag-and-drop:** Same pattern on the `drop` event — intercept, clean files, re-dispatch `DragEvent` with cleaned `DataTransfer`.

##### Claude: Blob/FileReader Prototype Override

Claude's framework reads file content via standard Web APIs (`Blob.prototype.arrayBuffer()`, `FileReader.readAsArrayBuffer()`, etc.). Cloaker overrides these at the prototype level:

```
Site JS calls file.arrayBuffer() or FileReader.readAsArrayBuffer(file)
          │
          ▼
    Cloaker's override fires
          │
    Is this a cleanable File? (DOCX, text, etc.) AND not already cleaned?
          │
         Yes ──► getCleanedFile(file) returns Promise<cleaned File>
          │       (cached in WeakMap for subsequent reads)
          │
    Return cleaned content from original Blob method on the cleaned File
          │
    Site JS receives cleaned content transparently ✅
```

**Overridden methods:**
- `Blob.prototype.arrayBuffer()` — returns cleaned content
- `Blob.prototype.text()` — returns cleaned content
- `Blob.prototype.stream()` — returns ReadableStream of cleaned content
- `Blob.prototype.slice()` — tracks parent file for sliced-chunk uploads
- `FileReader.prototype.readAsArrayBuffer()` — reads cleaned content
- `FileReader.prototype.readAsText()` — reads cleaned content
- `FileReader.prototype.readAsDataURL()` — reads cleaned content
- `FileReader.prototype.readAsBinaryString()` — reads cleaned content

**Anti-recursion safeguards:**
- Original Blob/FileReader methods are saved as `_origBlobArrayBuffer`, `_origBlobText`, etc. before overriding.
- Internal redaction functions (`redactOoxmlFile`, `redactTextFile`) use these saved references to avoid triggering the overrides.
- A `cleanedFiles` WeakSet tracks already-cleaned File objects to prevent re-processing. Both the original and cleaned files are marked immediately when cleaning starts.
- A `fileCleanCache` WeakMap caches `File → Promise<cleaned File>` mappings, so the same file is only cleaned once.
- A shared `C._cleanedFiles` WeakSet (defined in `doc-handlers.js`) is used across all platform interceptors and `network-base.js` to prevent double-processing: when a platform interceptor cleans a file, `network-base.js`'s generic Blob/File handler skips it.

##### Gemini: Hybrid DOM + Upload Interception

Gemini uses Angular (which rejects synthetic/untrusted events) and a unique upload architecture (resumable XHR uploads with declared content-length headers). Cloaker uses a hybrid strategy:

```
User picks file via <input type="file">
          │
          ▼
    Cloaker capture-phase 'change' listener fires FIRST
          │
    Any cleanable files? (.docx, .txt, .pdf, etc.)
          │
         Yes ──► stopImmediatePropagation() blocks site handlers
          │
    Clean files async (redactOoxmlFile / redactPdfFile / redactTextFile)
          │
    Create DataTransfer with cleaned File objects
          │
    input.files = cleanedDataTransfer.files
          │
    Re-dispatch new Event('change') with _cloakerBypass flag
          │
    Gemini's Angular handler picks up cleaned files from input.files
          │
    Upload proceeds with redacted content ✅
```

**Drag-and-drop strategy (special):**
```
User drops file onto page
          │
          ▼
    Synthetic DragEvents are isTrusted=false — Angular rejects them
          │
    Instead: let the real trusted drop event reach Gemini unchanged
          │
    Pre-warm cleaning cache from dropped files (getCleanedFile())
          │
    Synchronously set redacted filename via File.prototype.name override
    (Gemini reads file.name immediately — override returns redacted name)
          │
    Track original file sizes via _origSizeToFile Map
          │
    Key-based dedup cache (name|size|lastModified) ensures
    different JS references to same file reuse the same clean promise
          │
    When Gemini's XHR/fetch fires the upload:
          │
    ┌─ Upload session creation (string body with x-goog-upload-header-content-length)?
    │    └─ Wait for cleaning, re-open XHR with corrected content-length,
    │       redact filename in JSON body (display_name/name fields), re-send
    │
    ├─ Body is a File? → swap with cleaned version
    │
    └─ Body is a sliced Blob? → track via WeakMap, re-slice cleaned file
          │
    Upload proceeds with redacted content ✅
```

**Key mechanisms:**
- `File.prototype.name` override: Saves native getter as `_origNameGetter`; defines custom getter checking `_redactedNames` Map (keyed by `name|size|lastModified`) so Gemini reads a redacted filename synchronously on drop
- Key-based dedup cache (`_cleanCacheByKey` Map): Keys files by `name|size|lastModified` to deduplicate cleaning when Gemini creates multiple JS references to the same underlying file
- Upload session body redaction: Case 0 parses JSON body and walks object tree replacing `display_name`/`displayName`/`name` fields matching the original filename with the cleaned name
- Shared `C._cleanedFiles` WeakSet: Set in doc-handlers.js; checked by network-base.js fetch/XHR paths and Claude interceptor to skip files already cleaned by a platform interceptor
- `setRequestHeader` tracking: Captures all XHR headers in a WeakMap to allow re-setting after XHR re-open
- `Blob.prototype.slice` override: Tracks sliced Blobs to their source File for chunked upload interception
- Upload session size correction: Detects `x-goog-upload-header-content-length` header, waits for cleaning, re-opens XHR with corrected size
- CDN URL bypass: Skips `*.clients*.google.com/upload` and `content-push.googleapis.com/upload` in network-base.js middleware to avoid CSP violations; Gemini's own XHR/fetch overrides handle these directly

#### 7.4.1 Format Detection Pipeline

When a file/blob is encountered in a request body, format is determined in this priority order:

```
1. File extension (.docx, .txt, etc.)
       │
       ▼
2. MIME type (text/plain, application/vnd.openxmlformats-..., etc.)
       │
       ▼
3. Magic bytes — first 4 bytes of binary content:
   • PK\x03\x04 → OOXML (ZIP archive)
       │
       ▼
4. null (unknown format — pass through unmodified)
```

#### 7.4.2 PDF Redaction

**Status:** ⚠️ Partially supported. PDF text extraction works on a best-effort basis — some content (embedded images, complex layouts, scanned pages) may not be fully redacted. DOCX, XLSX, PPTX, and text formats are fully supported.

#### 7.4.3 OOXML Redaction (DOCX / XLSX / PPTX)

**Library:** `JSZip`

**Process:**
1. Read file as `ArrayBuffer`, parse as ZIP via `JSZip.loadAsync()`
2. Scan for XML files under `word/`, `xl/`, and `ppt/slides/` directories
3. For **Word documents** (`word/*.xml`):
   - Parse by splitting on `</w:p>` (paragraph close tags)
   - Extract all `<w:t>` text run contents per paragraph
   - **Join runs** within each paragraph to handle PII split across multiple XML elements (e.g., "John" in one `<w:t>`, "Smith" in another)
   - Apply `redactString()` to each complete paragraph text
   - Rebuild XML with minimal valid WordprocessingML structure:
     - `document.xml`: `<w:document><w:body><w:p><w:r><w:t>...</w:t></w:r></w:p>...</w:body></w:document>`
     - Headers: `<w:hdr>` root element
     - Footers: `<w:ftr>` root element
   - XML special characters (`&`, `<`, `>`) are properly escaped
4. For **Excel/PowerPoint** (`xl/*.xml`, `ppt/slides/*.xml`):
   - Regex-replace text content between XML tags: `/>([^<]+)</g`
   - Apply `redactString()` to each text node individually
5. If any PII found, regenerate the ZIP and return as a new `File` object

**Limitation:** Rich formatting (styles, fonts, images, tables, charts) in Word documents is lost when XML is rebuilt. Excel and PowerPoint preserve structure since only text nodes are replaced in-place.

#### 7.4.4 Plain Text File Redaction

**Supported Extensions (regex):**
```
.txt, .csv, .tsv, .json, .xml, .md, .log, .html, .htm,
.yaml, .yml, .ini, .cfg, .conf, .rtf
```

**Supported MIME Prefixes:**
```
text/*, application/json, application/xml, application/csv
```

**Process:**
1. Read file content as text via `blob.text()`
2. Apply `redactString()` to the entire text
3. Create a new `File` object with redacted content
4. Size limit: 10 MB (larger text files are passed through)

#### 7.4.5 FormData Handler

For requests with `multipart/form-data` bodies, the `redactFormData()` function iterates over all `FormData` entries:

| Entry Type | Action |
|-----------|--------|
| `File`/`Blob` with OOXML MIME or extension | Route to `redactOoxmlFile()` |
| `File`/`Blob` with text MIME or extension | Route to `redactTextFile()` |
| `File`/`Blob` with unknown type — magic byte fallback | `detectDocMagic()` on first 4 bytes → route if OOXML detected |
| `File`/`Blob` with unknown type | Pass through unmodified |
| String value | Apply `redactString()` |
| Other | Pass through |

---

### 7.5 Redaction Map & Reversibility

Every redaction creates a mapping entry stored in `redactionMap`:

```javascript
{
    "[EMAIL_1]": { original: "john.doe@example.com", type: "Email" },
    "[NAME_2]":  { original: "John Doe", type: "Person Name" },
    "[SSN_3]":   { original: "123-45-6789", type: "SSN" }
}
```

**Properties:**
- Stored in `chrome.storage.local` (persists across page navigations within a session)
- Cleared on browser startup (via `background.js` `onStartup` handler)
- Clearable manually via popup "Clear Session" button
- Viewable in the popup's "Redaction Map" modal with a sortable table

---

### 7.6 Popup Control Panel

**Location:** `popup.html`, `popup.css`, `popup.js`

A 340px-wide dark-themed popup accessible via the extension toolbar icon.

#### 7.6.1 Layout Sections

| Section | Contents |
|---------|----------|
| **Header** | Shield icon + "Blankit" title + "Local PII/PHI Redaction" subtitle |
| **Master Toggle** | Custom iOS-style switch labeled "Protection Active" |
| **Deep Sleep Toggle** | Toggle to hide the floating badge and eye toggle from LLM pages, with hint text explaining what it does |
| **Statistics Cards** | Two side-by-side cards: "Total Protected" (lifetime) and "This Session" (current) |
| **Detection Categories** | 17 individually toggleable checkboxes with descriptive labels |
| **Custom Redactions** | User-defined word→replacement pairs with add/remove controls. Stored in `chrome.storage.sync` for persistence across uninstall/reinstall. "Remove all" button appears when > 3 entries. Exportable/importable as JSON for team sharing. |
| **Action Buttons** | "Clear Session" (danger/red) + "Audit Log" (secondary) |
| **Document Quota** | Remaining document scrubs counter + "Get More" upgrade button + pricing note |
| **Audit Log Panel** | Expandable panel with redaction event history, PDF export, and clear buttons |
| **Share & Rate** | "Enjoying Blankit?" prompt with share (copies link to clipboard) and rate (Chrome Web Store link) buttons |
| **Footer** | "All processing is 100% local. No data leaves your browser." |

#### 7.6.2 Detection Category Toggles

| Checkbox `data-category` | Display Label |
|--------------------------|---------------|
| `emails` | Email Addresses |
| `phones` | Phone Numbers |
| `ssn` | SSN / Tax IDs |
| `creditCards` | Credit Card Numbers |
| `addresses` | Street Addresses |
| `names` | Person Names |
| `dates` | Dates of Birth |
| `medical` | Medical Record #s |
| `ip` | IP Addresses |
| `passport` | Passport Numbers |
| `driversLicense` | Driver’s Licenses |
| `taxId` | Tax IDs (EIN/TIN/ITIN) |
| `bankAccount` | Bank Accounts |
| `macAddress` | MAC Addresses |
| `urls` | URLs |
| `credentials` | Credentials / Secrets |
| `uuid` | UUIDs |

#### 7.6.3 Custom Redactions Section

User-defined word→replacement pairs for domain-specific or project-specific terms.

- **Layout:** Each entry is a row with a word input field, an arrow, and an auto-generated hash label, plus a red bin icon to delete
- **Add button:** Dashed "+ Add word" button appends a new empty row. The hash is generated only after the user starts typing a word.
- **Hash format:** Each custom word is replaced with a non-deterministic 6-character hex hash in brackets (e.g., `[a3f7x2]`). Every occurrence gets a unique random hash, preventing reversal by trial and error.
- **Regex auto-detection:** Custom word entries containing regex metacharacters (`[ ] { } ( ) | \\ * + ?`) are automatically treated as regex patterns. For example, `EMP-[0-9]+` will match `EMP-293445`, `EMP-100`, etc. Plain words without metacharacters use exact word-boundary matching. Invalid regex patterns are silently skipped.
- **Remove all:** A "Remove all" button appears when more than 3 entries exist
- **Storage:** Uses `chrome.storage.sync` — entries persist across uninstall/reinstall and sync across signed-in Chrome profiles
- **Integration:** Custom words are forwarded to the MAIN world via `CLOAKER_SETTINGS` and applied in `redactString()` after all built-in pattern categories
- **Audit:** Redacted custom words appear in the audit log under the "Custom Word" category tag

#### 7.6.3a Custom Word Sharing & Import

Users can export and import their custom redaction word sets:

- **Export:** Click the share/export icon in the Custom Redactions section. Downloads a JSON file in `blankit-custom-words` v1.0 format containing all defined words and their hashes.
- **Import:** Click the import icon and select a `.json` file. The extension validates the format and version, then adds only new words (duplicates are automatically skipped).
- **Format:**
  ```json
  {
    "format": "blankit-custom-words",
    "version": "1.0",
    "exportedAt": "2026-03-20T12:00:00.000Z",
    "words": [
      { "word": "ProjectX", "hash": "[k7m2x9p1]" }
    ]
  }
  ```
- **Use case:** Teams can maintain a shared set of domain-specific words to redact (project names, internal codenames, etc.) and distribute them via the export/import flow.

#### 7.6.4 Audit Log Panel

- Triggered by "Audit Log" button in the popup
- Expandable panel within the popup (not a modal overlay)
- **Header:** "AUDIT LOG" title with Export, Clear, and ✕ (close) action buttons
- **Entries:** Scrollable list of redaction events, each showing:
  - Timestamp and platform (ChatGPT / Claude / Gemini)
  - Number of items redacted and source (text input or document upload)
  - Document filename (for file redaction events)
  - PII category tags
- **Export:** Downloads a PDF compliance report via `BlankitPDF.downloadReport()` (see [Section 7.8.3](#783-export))
- **Clear:** Removes all audit entries from storage
- **Empty state:** "No redaction events logged yet."
- **Storage:** Persists across sessions via `chrome.storage.local`

#### 7.6.7 Share & Rate Section

- Located in the popup footer area, below the action buttons
- **"Enjoying Blankit?"** prompt to encourage sharing
- **Share button:** Copies a pre-formatted share message with the Chrome Web Store URL to the clipboard. Button text changes to "Copied!" temporarily.
- **Rate button:** Opens the Chrome Web Store listing for Blankit to leave a review.

#### 7.6.8 Deep Sleep Mode

- **Toggle:** iOS-style switch in the popup, positioned below the master "Protection Active" toggle
- **Label:** "Deep Sleep" with a hint below in small text: "Hides the floating badge and eye toggle on the page"
- **Behavior:** When enabled, the floating badge (bottom-right toggle button) and the un-redact eye button (👁) are hidden from LLM pages. Redaction and all other protection features continue to operate normally in the background — only the visual overlays are suppressed.
- **Storage key:** `deepSleep` in `chrome.storage.local` (default: `false`)
- **Communication:** Toggling sends a `DEEP_SLEEP` message to the active tab's content script (bridge.js), which immediately hides or shows the badge and eye button
- **Persistence:** The setting is loaded on page load from storage and applied before UI elements become visible

#### 7.6.6 Clear Session

- Resets `sessionRedacted` counter to 0
- Clears `redactionMap` to `{}`
- Updates popup UI immediately
- Sends `CLEAR_SESSION` message to content script, which forwards `CLOAKER_CLEAR` to MAIN world

---

### 7.7 In-Page Visual Indicators

**Location:** `src/content/bridge.js` + `src/content/styles.css` (ISOLATED world)

#### 7.7.1 Status Banner

- **Element:** `#cloaker-banner`
- **Position:** Fixed, top-right corner (top: 10px, right: 60px)
- **Z-index:** `2147483647` (maximum, ensures visibility above all page elements)
- **Pointer events:** `none` (non-interactive, does not block page clicks)
- **Contents:**
  - 🛡️ Shield emoji
  - "BLANKIT" label (purple, uppercase, 800 weight)
  - Dot separator
  - Status dot (7px circle: green when active, gray when paused)
  - Status text: "ACTIVE — Monitoring for PII/PHI" or "PAUSED — Protection paused"
- **Visual style:** Dark gradient background (`#1a1a2e` → `#16132b`), purple border, purple glow shadow
- **Disabled state:** Gray border, 50% opacity

#### 7.7.2 Floating Badge / Toggle Button

- **Element:** `#cloaker-badge`
- **Position:** Fixed, bottom-right corner (bottom: 20px, right: 20px)
- **Size:** 46×46px circle
- **Z-index:** `2147483647`
- **Contents:** SVG shield icon with indigo → purple → pink gradient
- **Interactive:** Click toggles protection on/off
- **States:**
  | State | Visual |
  |-------|--------|
  | Active | Dark-to-purple gradient, purple border |
  | Active + hover | Scale 1.1×, stronger shadow |
  | Active + press | Scale 0.95× |
  | Disabled | Gray gradient, gray border, 60% opacity |
  | Flash (redaction occurred) | Green border, green glow, pop animation (scale 1→1.35→0.95→1 over 0.6s) |
- **Flash duration:** 2000ms after each redaction event

#### 7.7.3 Un-redact Toggle Button (Eye Icon)

- **Element:** Eye icon button (👁)
- **Position:** Fixed, bottom-right corner — positioned above the floating badge; shifts upward when the scrub bubble is visible
- **Z-index:** `2147483647`
- **Visibility:** Hidden by default; appears only when redactions exist on the current page
- **Behavior:**
  - Click toggles between **redacted** (placeholders like `[EMAIL_1]`) and **un-redacted** (original values) states
  - Uses a DOM TreeWalker to find all text nodes matching the placeholder pattern `/\[A-Z_]+_\d+\]/g`
  - Replaces placeholders with original values from the accumulated redaction map, or vice versa
  - State persists across new DOM mutations — a MutationObserver watches for new nodes and applies the current toggle state
  - The redaction map accumulates across the session (global `accumulatedMap`), so un-redact works for all redacted items in the conversation

#### 7.7.4 Scrub Bubble (Document Redaction Notification)

- **Appears:** After a document is successfully redacted during upload
- **Position:** Fixed, bottom-right corner (above the badge/un-redact button area)
- **Contents:**
  - Count of PII items redacted + filename (e.g., "12 items redacted in report.docx")
  - **Download button:** Allows instant download of the redacted/cleaned document
  - **Dismiss button (×):** Closes the bubble
- **Auto-dismiss:** Disappears after **8 seconds** if not manually dismissed
- **Visual style:** Dark themed with purple accent, consistent with the extension's design system

---

### 7.8 Audit Log

**Location:** `popup.html` / `popup.js` (popup panel) + `src/background/service-worker.js` (storage)

The audit log provides a full, persistent history of all redaction events for compliance and review purposes.

#### 7.8.1 Event Recording

Every redaction event (text or document) is logged with:

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 timestamp of the redaction event |
| `platform` | LLM platform (ChatGPT, Claude, or Gemini) |
| `itemCount` | Number of PII items redacted in this event |
| `source` | Whether the redaction was from text input or document upload |
| `filename` | Document filename (for file redaction events only) |
| `categories` | Array of PII category tags detected (e.g., `["Email", "SSN", "Person Name"]`) |

#### 7.8.2 Audit Log UI (Popup Panel)

- Toggled by "Audit Log" button in the popup action buttons
- Inline expandable panel (not a separate page or modal)
- **Header row:** "AUDIT LOG" label + Export PDF / Clear / ✕ action buttons
- **Scrollable entry list** with individual event cards
- **Empty state:** "No redaction events logged yet."

#### 7.8.3 Export

- Exports the audit log as a downloadable **PDF compliance report** via the built-in `BlankitPDF.downloadReport()` generator (`lib/pdf-report.js`)
- The PDF report includes:
  - **Header** with generation timestamp and extension install date
  - **Executive summary** narrative (e.g., "Since install, Blankit prevented X+ instances of PII leak across N platforms")
  - **Overview statistics** (total protected, platforms secured, audit events)
  - **PII category breakdown** with horizontal bar chart
  - **Platform breakdown** (items redacted per platform)
  - **Redaction source breakdown** (text input, network, document)
  - **Recent activity table** (last 10 entries with timestamp, platform, source, categories)
  - **Footer** with version, disclaimer, and unique report ID
- PDF format: A4, Helvetica font, dark theme with purple/pink/orange accent colors
- Filename: `Blankit-Audit-Report-YYYY-MM-DD.pdf`
- Useful for compliance reporting, security audits, and organizational reporting

#### 7.8.4 Storage

- Stored in `chrome.storage.local` — persists across sessions
- Managed by the service worker via `GET_AUDIT_LOGS` and `CLEAR_AUDIT_LOGS` message handlers

---

### 7.9 Settings & Persistence

| Setting | Storage Key | Default | Persists Across Sessions |
|---------|-------------|---------|:---:|
| Protection enabled | `enabled` | `true` | ✅ |
| Detection categories | `categories` | All 17 = `true` | ✅ |
| Total redaction count | `totalRedacted` | `0` | ✅ |
| Session redaction count | `sessionRedacted` | `0` | ❌ (reset on browser start) |
| Redaction map | `redactionMap` | `{}` | ❌ (reset on browser start) |
| Audit log entries | `auditLogs` | `[]` | ✅ |
| Custom redaction words | `customWords` (sync) | `[]` | ✅ (survives uninstall via `chrome.storage.sync`) |
| Deep Sleep mode | `deepSleep` | `false` | ✅ |

---

## 8. Detailed Detection Categories

### 8.1 Email Addresses

| Property | Value |
|----------|-------|
| **Key** | `emails` |
| **Regex** | `/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g` |
| **Placeholder** | `[EMAIL_N]` |
| **Examples detected** | `john.doe@example.com`, `user+tag@sub.domain.co.uk` |

### 8.2 Phone Numbers

| Property | Value |
|----------|-------|
| **Key** | `phones` |
| **Regex** | `/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g` |
| **Placeholder** | `[PHONE_N]` |
| **Examples detected** | `(555) 123-4567`, `+1 555.123.4567`, `5551234567` |

### 8.3 Social Security Numbers

| Property | Value |
|----------|-------|
| **Key** | `ssn` |
| **Regex** | `/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g` |
| **Placeholder** | `[SSN_N]` |
| **Examples detected** | `123-45-6789`, `123 45 6789`, `123456789` |

### 8.4 Credit Card Numbers

| Property | Value |
|----------|-------|
| **Key** | `creditCards` |
| **Regex** | `/\b(?:\d{4}[-\s]?){3}\d{4}\b/g` |
| **Placeholder** | `[CC_N]` |
| **Examples detected** | `4111-1111-1111-1111`, `4111 1111 1111 1111` |

### 8.5 Street Addresses

| Property | Value |
|----------|-------|
| **Key** | `addresses` |
| **Regex** | `/\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Dr(?:ive)?|Ln|Lane|Rd|Road|Ct|Court|Pl(?:ace)?|Way|Cir(?:cle)?)\.?\b/gi` |
| **Placeholder** | `[ADDR_N]` |
| **Examples detected** | `123 Main Street`, `456 Oak Ave`, `7890 Pine Blvd.` |
| **Street suffixes recognized** | St, Street, Ave, Avenue, Blvd, Boulevard, Dr, Drive, Ln, Lane, Rd, Road, Ct, Court, Pl, Place, Way, Cir, Circle |
| **Extended matching** | Optional apartment/suite numbers, city, state, and ZIP±4 |

### 8.6 Person Names

| Property | Value |
|----------|-------|
| **Key** | `names` |
| **Detection method** | **NLP-first** (compromise.js) with regex fallback |
| **NLP path** | `nlp(text).people()` extracts person entities; post-processed to strip common words from edges; supplemented by a standalone pass matching ~40 top common Western and Indian first names |
| **Regex fallback** | `/\b[A-Z][a-zA-Z]{1,15}(?:\s+[A-Z][a-zA-Z]{1,15}){1,3}\b/g` — matches 2–4 consecutive Title Case words, excluding ~130 common English words |
| **Placeholder** | `[NAME_N]` |
| **Examples detected** | `John Smith`, `Maria Garcia`, `Priya Sharma`, `Jean-Pierre Dupont`, `Dr. Robert Johnson`, `Wei Chen` |
| **Common names set** | Top 20 Western (James, Robert, Mary, Elizabeth, …) + Top 20 Indian (Aarav, Vivaan, Priya, Raj, …) — always caught even standalone |
| **False positive prevention** | ~130+ common English words excluded (articles, pronouns, days, months, verbs, prepositions) |

### 8.7 Dates

| Property | Value |
|----------|-------|
| **Key** | `dates` |
| **Regex** | Matches MM/DD/YYYY, YYYY-MM-DD, `Month DD, YYYY`, and `DD Month YYYY` formats |
| **Placeholder** | `[DOB_N]` |
| **Examples detected** | `01/15/1990`, `2023-12-31`, `January 15, 2000`, `15 March 1985`, `Sep 3, 2021` |
| **Year range** | 1900–2099 |
| **Month names** | Full and abbreviated: Jan–Dec, January–December |

### 8.8 Medical Record Numbers

| Property | Value |
|----------|-------|
| **Key** | `medical` |
| **Regex** | `/\b(?:MRN\|MR#\|Medical Record\|Health Plan\|Beneficiary\|Patient (?:ID\|Acct\|Account)\|Insurance (?:ID\|Policy))[:\s#]*[A-Z0-9]{4,15}\b/gi` |
| **Placeholder** | `[MRN_N]` |
| **Examples detected** | `MRN: 12345678`, `Patient ID: ABC123`, `Health Plan HP998877`, `Insurance Policy INS2024001` |

### 8.9 IP Addresses

| Property | Value |
|----------|-------|
| **Key** | `ip` |
| **Regex** | Matches both IPv4 and IPv6 formats |
| **Placeholder** | `[IP_N]` |
| **Examples detected** | `192.168.1.1`, `255.255.255.255`, `2001:0db8:85a3:0000:0000:8a2e:0370:7334`, `::ffff:192.168.1.1` |

### 8.10 Passport Numbers

| Property | Value |
|----------|-------|
| **Key** | `passport` |
| **Regex** | `/\b(?:passport)(?:\s*(?:no\|number\|#\|num))?[:\s#]*[A-Z]{0,2}\d{6,9}\b/gi` |
| **Placeholder** | `[PASSPORT_N]` |
| **Examples detected** | `Passport: C12345678`, `Passport no 123456789`, `Passport #AB1234567` |
| **Note** | Requires "passport" keyword prefix to avoid false positives |

### 8.11 Driver's Licenses

| Property | Value |
|----------|-------|
| **Key** | `driversLicense` |
| **Regex** | `/\b(?:D\.?L\.?\|driver'?s?\s*(?:license\|licence\|lic))[:\s#]*[A-Z0-9]{5,15}\b/gi` |
| **Placeholder** | `[DL_N]` |
| **Examples detected** | `DL: D12345678`, `Driver's License S1234567890`, `Drivers Lic ABC12345` |

### 8.12 Tax IDs

| Property | Value |
|----------|-------|
| **Key** | `taxId` |
| **Regex** | `/\b(?:TIN\|EIN\|ITIN)[:\s#-]*\d{2}[-\s]?\d{7}\b/g` |
| **Placeholder** | `[TAXID_N]` |
| **Examples detected** | `EIN: 12-3456789`, `TIN 123456789`, `ITIN# 91-2345678` |

### 8.13 Bank Accounts

| Property | Value |
|----------|-------|
| **Key** | `bankAccount` |
| **Regex** | Matches account/acct/a/c numbers, IBAN, and SWIFT/BIC codes |
| **Placeholder** | `[BANK_N]` |
| **Examples detected** | `Acct: 12345678901234`, `IBAN: GB29NWBK60161331926819`, `SWIFT: BOFAUS3NXXX` |

### 8.14 MAC Addresses

| Property | Value |
|----------|-------|
| **Key** | `macAddress` |
| **Regex** | `/\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g` |
| **Placeholder** | `[MAC_N]` |
| **Examples detected** | `00:1A:2B:3C:4D:5E`, `aa-bb-cc-dd-ee-ff` |

### 8.15 URLs

| Property | Value |
|----------|-------|
| **Key** | `urls` |
| **Regex** | `/\bhttps?:\/\/[^\s<>"')\]]+/gi` |
| **Placeholder** | `[URL_N]` |
| **Examples detected** | `https://example.com/path?q=1`, `http://internal.corp.net/api` |

### 8.16 Credentials / Secrets

| Property | Value |
|----------|-------|
| **Key** | `credentials` |
| **Regex** | Matches password fields, API keys/secrets, Bearer tokens, and PEM private key blocks |
| **Placeholder** | `[SECRET_N]` |
| **Examples detected** | `password: MyS3cr3t!`, `api_key=sk_live_abc123...`, `Bearer eyJhbGc...`, `-----BEGIN RSA PRIVATE KEY-----` |

### 8.17 UUIDs

| Property | Value |
|----------|-------|
| **Key** | `uuid` |
| **Regex** | `/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g` |
| **Placeholder** | `[UUID_N]` |
| **Examples detected** | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |

---

## 9. Document Format Support

### Supported for Content Redaction

| Format | Extensions | MIME Types | Library | Max Size |
|--------|-----------|-----------|---------|----------|
| **Word** | `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | JSZip | 50 MB |
| **Excel** | `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | JSZip | 50 MB |
| **PowerPoint** | `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | JSZip | 50 MB |
| **Plain Text** | `.txt`, `.csv`, `.tsv`, `.json`, `.xml`, `.md`, `.log`, `.html`, `.htm`, `.yaml`, `.yml`, `.ini`, `.cfg`, `.conf`, `.rtf` | `text/*`, `application/json`, `application/xml`, `application/csv` | Native | 10 MB |
| **PDF** | `.pdf` | `application/pdf` | — | ⚠️ Partial support (best-effort text extraction; complex layouts/scanned pages may not be fully redacted) |

### Magic Byte Detection (Fallback)

For files with generic MIME types (e.g., `application/octet-stream`) or no extension, the first 4 bytes are inspected:

| Magic Bytes | Hex | Detected Format |
|------------|-----|-----------------|
| `PK\x03\x04` | `50 4B 03 04` | OOXML (ZIP archive containing .docx/.xlsx/.pptx) |

---

## 10. Communication Architecture

### Message Flow Diagram

```
┌──────────┐  chrome.tabs.sendMessage  ┌──────────────┐  window.postMessage  ┌──────────────┐
│          │ ─────────────────────────► │              │ ────────────────────► │              │
│ popup.js │  TOGGLE_CLOAKER           │  bridge.js   │  CLOAKER_SETTINGS    │  MAIN world  │
│          │  UPDATE_CATEGORIES        │  (ISOLATED)  │  CLOAKER_CLEAR       │  scripts     │
│          │  CLEAR_SESSION            │              │                      │              │
│          │                           │              │ ◄──────────────────── │              │
│          │ ◄───────────────────────  │              │  CLOAKER_READY       │              │
│          │  chrome.runtime           │              │  CLOAKER_INPUT_REDACT│              │
│          │  .sendMessage             │              │  CLOAKER_NETWORK_RED │              │
│          │  (STATS_UPDATE,           │              │  CLOAKER_DOC_REDACT  │              │
│          │   TOGGLE_CLOAKER,         │              │                      │              │
│          │   DOC_QUOTA_UPDATE)       │              │                      │              │
└──────────┘                           └──────────────┘                      └──────────────┘
      ▲                                       │
      │           ┌────────────────┐          │
      └───────────│service-worker  │◄─────────┘
   chrome.runtime │(background)    │  chrome.runtime.sendMessage
   .sendMessage   └────────────────┘  (STATS_UPDATE, AUDIT_LOG relay)
```

### Message Types Reference

| Message Type | Direction | Payload | Purpose |
|-------------|-----------|---------|---------|
| `CLOAKER_SETTINGS` | ISOLATED → MAIN | `{ enabled, categories }` | Sync settings to MAIN world |
| `CLOAKER_CLEAR` | ISOLATED → MAIN | — | Reset redaction map and counter |
| `CLOAKER_READY` | MAIN → ISOLATED | — | MAIN world interceptor loaded signal |
| `CLOAKER_INPUT_REDACTION` | MAIN → ISOLATED | `{ count, items, map }` | UI input was redacted |
| `CLOAKER_NETWORK_REDACTION` | MAIN → ISOLATED | `{ count, items, map }` | Network request was redacted |
| `CLOAKER_DOC_REDACTION` | MAIN → ISOLATED | `{ count, items, map, filename, blob }` | Document was redacted (with download) |
| `TOGGLE_CLOAKER` | Popup → Content, Content → Popup | `{ enabled }` | Toggle protection on/off |
| `UPDATE_CATEGORIES` | Popup → Content | `{ categories }` | Category settings changed |
| `UPDATE_CUSTOM_WORDS` | Popup → Content | `{ customWords }` | Custom redaction words changed |
| `CLEAR_SESSION` | Popup → Content | — | Clear session data |
| `STATS_UPDATE` | Content → Background → Popup | `{ totalRedacted, sessionRedacted }` | Live stats counter update |
| `GET_AUDIT_LOGS` | Popup → Background | — | Retrieve audit log entries |
| `CLEAR_AUDIT_LOGS` | Popup → Background | — | Clear all audit log entries |

---

## 11. Data Storage Schema

**Storage API:** `chrome.storage.local`

```jsonc
{
    // Master protection toggle
    "enabled": true,

    // Lifetime count of all redacted items (persists forever)
    "totalRedacted": 0,

    // Current session count (reset on each browser startup)
    "sessionRedacted": 0,

    // Placeholder → original value mapping (reset on each browser startup)
    "redactionMap": {
        "[EMAIL_1]": { "original": "john@example.com", "type": "Email" },
        "[NAME_2]":  { "original": "John Doe", "type": "Person Name" }
    },

    // Per-category toggles (all persist across sessions)
    "categories": {
        "emails": true,
        "phones": true,
        "ssn": true,
        "creditCards": true,
        "addresses": true,
        "names": true,
        "dates": true,
        "medical": true,
        "ip": true,
        "passport": true,
        "driversLicense": true,
        "taxId": true,
        "bankAccount": true,
        "macAddress": true,
        "urls": true,
        "credentials": true,
        "uuid": true
    },

    // Deep Sleep mode: hides floating badge and eye toggle from LLM pages
    "deepSleep": false,

    // Audit log (persistent across sessions)
    "auditLogs": [
        {
            "timestamp": "2026-03-17T10:30:00.000Z",
            "platform": "ChatGPT",
            "itemCount": 3,
            "source": "input",
            "filename": null,
            "categories": ["Email", "Person Name"]
        }
    ]
}
```

### Lifecycle

| Event | Effect on Storage |
|-------|------------------|
| Extension installed | All keys initialized to defaults |
| Browser starts (new session) | `sessionRedacted` → `0`, `redactionMap` → `{}` |
| User toggles protection | `enabled` updated |
| User changes categories | `categories` updated |
| Redaction occurs | `totalRedacted` incremented, `sessionRedacted` incremented, `redactionMap` entries added, audit log entry appended |
| Document redaction | Same as above |
| "Clear Session" clicked | `sessionRedacted` → `0`, `redactionMap` → `{}` |
| "Clear Audit" clicked | `auditLogs` → `[]` |

---

## 12. UI/UX Specifications

### 12.1 Design System

| Property | Value |
|----------|-------|
| **Theme** | Dark |
| **Popup width** | 340px |
| **Font stack** | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| **Primary accent** | `#a78bfa` (purple) |
| **Success / Active** | `#22c55e` (green) |
| **Danger** | `#7f1d1d` bg / `#fca5a5` text (red) |
| **Background** | `#0f0f14` (popup), `#1a1a2e` → `#16132b` (in-page) |
| **Border** | `#27272a` (default), `#a78bfa` (accent), `#52525b` (disabled) |
| **Text primary** | `#e4e4e7` |
| **Text secondary** | `#71717a` |
| **Border radius** | 6–15px depending on element |

### 12.2 Animations

| Animation | Keyframes | Duration | Easing | Used By |
|-----------|-----------|----------|--------|---------|
| Badge pop | Scale 1 → 1.35 → 0.95 → 1 | 0.6s | ease-out | Badge flash on redaction |
| Badge hover | Scale 1 → 1.1 | CSS transition | — | Badge hover state |
| Badge press | Scale 1 → 0.95 | CSS transition | — | Badge active state |

### 12.3 User Interaction Flows

**Flow 1: Normal Chat (PII Detected)**
```
User types message with PII → Presses Enter
    → Cloaker intercepts keydown (capture phase)
    → PII detected → Event blocked
    → Text in input replaced with redacted version (user sees change)
    → Badge flashes green
    → 900ms later: send button auto-clicked with bypass flag
    → Network interceptor also catches the request (double safety)
    → Redaction map updated, stats incremented
```

**Flow 2: Document Upload — ChatGPT (PII Detected)**
```
User picks file via <input type="file">
    → Cloaker capture-phase 'change' listener fires first
    → stopImmediatePropagation() blocks ChatGPT's handler
    → File type detected (DOCX, text, etc.)
    → File content parsed and text extracted
    → PII detected and redacted
    → Cleaned file auto-downloaded as "filename_cleaned.docx"
    → DataTransfer created with cleaned File
    → input.files = cleanedFiles
    → New 'change' event dispatched with _cloakerBypass flag
    → ChatGPT's React handler picks up cleaned file from input.files
    → Upload proceeds with redacted content
    → Badge flashes green, stats updated
```

**Flow 2b: Document Upload — Claude (PII Detected)**
```
User picks file via <input type="file">
    → Claude's framework JS calls file.arrayBuffer() or FileReader.readAsArrayBuffer(file)
    → Cloaker's Blob.prototype.arrayBuffer override fires
    → File is cleanable → getCleanedFile(file) returns cleaned version
    → Cleaned file auto-downloaded as "filename_cleaned.docx"
    → Cleaned content returned to Claude's JS transparently
    → Upload proceeds with redacted content
    → Badge flashes green, stats updated
```

**Flow 3: Toggle Protection Off**
```
User clicks badge (in-page) or toggle switch (popup)
    → enabled = false saved to chrome.storage.local
    → Banner updates: "PAUSED", gray dot
    → Badge grays out
    → CLOAKER_SETTINGS { enabled: false } sent to MAIN world
    → All interceptors pass-through (first line: if !enabled → return original)
```

**Flow 4: Un-redact Toggle**
```
User clicks eye icon (👁) on the LLM page
    → DOM TreeWalker scans all text nodes for placeholder patterns [TYPE_N]
    → Each placeholder replaced with original value from accumulatedMap
    → MutationObserver watches for new DOM nodes to maintain un-redacted state
    → Clicking again re-applies redacted placeholders
```

**Flow 5: Audit Log Review**
```
User clicks "Audit Log" in popup
    → GET_AUDIT_LOGS sent to service worker
    → Service worker reads audit entries from chrome.storage.local
    → Entries rendered in scrollable panel with timestamps, platforms, categories
    → "Export" downloads JSON file with schema metadata
    → "Clear" removes all entries from storage
```

---

## 13. Security & Privacy Model

### 13.1 Core Privacy Guarantees

| Guarantee | Implementation |
|-----------|---------------|
| **No analytics or telemetry** | There is no analytics or telemetry code in the extension. Zero network calls are made by the extension to any external service. |
| **No external dependencies** | JSZip is included as a local `.min.js` file, not loaded from CDNs. |
| **No data persistence beyond session** | `redactionMap` and `sessionRedacted` are cleared on every browser startup. Audit logs persist but contain only metadata (no original PII values). |
| **No data leaves to extension author** | Zero outgoing requests are made by the extension. No telemetry, crash reporting, or update-check endpoints exist. |
| **Processing is 100% in-browser** | All regex matching, document parsing, and file generation occur in the browser's JavaScript engine. |
| **Audit log privacy** | Audit log entries store only metadata (timestamp, platform, category tags, item counts) — never the original PII values or the redacted text content. |

### 13.2 Extension Permissions (Minimal)

| Permission | Justification |
|------------|---------------|
| `storage` | Persist settings, stats, and redaction map locally |
| `host_permissions` (3 LLM domains) | Required to inject content scripts into LLM websites |

No analytics or telemetry permissions are present.

### 13.3 XSS Prevention

- Popup uses `escapeHtml()` (via `div.textContent` → `div.innerHTML` pattern) when rendering redaction map values
- Content scripts use DOM APIs (not `innerHTML`) for UI construction

### 13.4 Failure Mode

If any redaction handler throws an error:
- The error is caught and logged to console (`console.warn`)
- The **original unmodified request is sent through** — Cloaker fails open, not closed
- This ensures the extension never breaks site functionality

---

## 14. Technical Constraints & Limits

| Constraint | Value | Rationale |
|-----------|-------|-----------|
| PDF / OOXML max file size | 50 MB | Prevent memory issues from parsing very large documents in-browser |
| Plain text max file size | 10 MB | Reasonable upper bound for text redaction |
| Minimum string for `redactString()` | 3 characters | Below this, no meaningful PII can exist |
| Minimum string for `deepRedactObj()` | 5 characters | Skip short object values (keys, booleans) |
| Minimum JSON body for string interception | 20 characters | Skip trivial payloads (e.g., `{"ok":true}`) |
| Auto-send delay after UI redaction | 900 ms | Give user time to visually confirm redaction |
| Badge flash duration | 2,000 ms | Visible but not distracting notification |
| `ReadableStream` bodies | Not intercepted | Streams cannot be consumed and re-created reliably without breaking the site |

---

## 15. External Dependencies

| Library | File | Version | Size | License | Purpose |
|---------|------|---------|------|---------|---------|
| **JSZip** | `jszip.min.js` | 3.10.1 | ~98 KB | MIT | Parse and generate OOXML ZIP archives |
| **compromise** | `compromise.min.js` | 14.x | ~345 KB | MIT | NLP-powered person name detection |

All libraries are bundled locally in the extension package. No CDN or remote loading.

**JSZip Isolation:** JSZip is wrapped between `jszip-pre.js` and `jszip-post.js` to prevent it from overwriting `window.postMessage` on Angular-based sites (Gemini). See [Section 6](#6-architecture-overview) for details.

---

## 16. File Structure

```
Blankit/
├── manifest.json
├── lib/
│   ├── jszip.min.js             # Local vendor library
│   ├── jszip-pre.js             # Saves window.postMessage
│   ├── jszip-post.js            # Restores window.postMessage (Angular Fix)
│   ├── compromise.min.js        # NLP engine for name detection
│   └── pdf-report.js            # PDF audit report generator (no external deps)
├── src/
│   ├── core/                    # Shared Pure Logic
│   │   ├── pii-engine.js        # Regex patterns and redaction logic
│   │   ├── doc-handlers.js      # OOXML and Text file parsers
│   │   └── network-base.js      # Global Fetch/XHR monkey-patching
│   ├── platforms/               # Isolated Platform Strategies
│   │   ├── chatgpt/
│   │   │   ├── interceptor.js   # ChatGPT DOM/Event logic
│   │   │   └── selectors.js     # ChatGPT CSS selectors
│   │   ├── claude/
│   │   │   ├── interceptor.js   # Claude Prototype/Blob logic
│   │   │   └── selectors.js     # Claude CSS selectors
│   │   └── gemini/
│   │       ├── interceptor.js   # Gemini JSON/Base64 logic
│   │       └── selectors.js     # Gemini CSS selectors
│   ├── content/                 # UI and Bridge
│   │   ├── bridge.js            # Isolated-to-Main messaging
│   │   └── styles.css           # Banner/Badge styles
│   └── background/
│       └── service-worker.js    # Session lifecycle & Storage
```

### 17.1 Architecture Decision: Single File with Decoupled Strategies

Rather than splitting into separate per-site files (which would duplicate the shared PII engine, document processing, and network interceptors), the per-platform file upload strategies are **logically decoupled within `intercept.js`**. Each strategy is:

- Self-contained in its own clearly labeled section
- Independently activatable (each checks the current hostname)
- Designed so that a bug in one platform's strategy cannot affect another
- Guarded by `try/catch` with fail-open behavior (on error, original file passes through)

The shared core (PII detection, DOCX/text redaction, fetch/XHR interception, UI input handling) remains in a single file to avoid code duplication.

---

## 17. Glossary

| Term | Definition |
|------|-----------|
| **PII** | Personally Identifiable Information — data that can identify a specific individual (names, SSNs, emails, etc.) |
| **PHI** | Protected Health Information — health-related data tied to an individual, protected under HIPAA |
| **MAIN world** | Chrome content script execution context that shares the page's JavaScript environment |
| **ISOLATED world** | Chrome content script execution context that is sandboxed from the page's JS but has Chrome API access |
| **OOXML** | Office Open XML — the ZIP-based format used by `.docx`, `.xlsx`, and `.pptx` files |
| **MV3** | Manifest Version 3 — Chrome's current extension platform |
| **Monkey-patching** | Replacing a native function (e.g., `window.fetch`) with a wrapper function at runtime |
| **API Override Hook** | The interception pattern where native browser APIs are wrapped to inspect and modify data in transit |
| **Redaction Map** | The session-local dictionary mapping placeholder tokens to their original values |
| **Magic Bytes** | The first few bytes of a binary file that identify its format (e.g., `PK\x03\x04` for ZIP, `%PDF` for PDF) |
| **Fail Open** | Error handling strategy where, on failure, the system allows the operation to proceed (original data sent unmodified) rather than blocking it |

---

*End of PRD*
