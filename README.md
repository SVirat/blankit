<p align="center">
  <img src="icons/icon256.png" width="80" />
</p>

<h1 align="center">Blankit</h1>

<p align="center">
  <strong>Real-time, local-first PII redaction for AI chats. All processing stays in your browser.</strong>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/blankit/oihdkggpbopimdndhephiechoegagoeb">Extension Link</a> · <a href="PRD.md">Product Spec</a> · <a href="PRIVACY_POLICY.md">Privacy Policy</a>
</p>

---

Blankit is a Chrome extension that automatically scrubs sensitive personal information (names, SSNs, emails, phone numbers, medical records, credit cards, etc.) from your prompts and uploaded documents before they reach ChatGPT, Claude, or Gemini. All processing happens entirely in your browser, nothing leaves your device.

## Features

- **Automatic redaction**: Intercepts outgoing API requests and scrubs PII/PHI at the network boundary
- **Document support**: Redacts PII in uploaded documents and common office formats (PDF support is partial — see below)
- **Multi-platform**: Works on ChatGPT, Claude, and Gemini
- **Granular control**: Toggle 17 individual detection categories (emails, phones, SSN, credit cards, addresses, names, dates, medical records, IP addresses, passport numbers, driver’s licenses, tax IDs, bank accounts, MAC addresses, URLs, credentials, UUIDs)
- **NLP-powered name detection**: Uses compromise.js for natural language name recognition with regex fallback, covering Western, Indian, East Asian, and hyphenated names
- **Custom word redaction**: Define your own words or regex patterns to redact. Patterns containing regex metacharacters (e.g., `EMP-[0-9]+`) are auto-detected and applied as regex. Each match is replaced with a unique, non-deterministic 6-character hex hash (e.g., `[a3f7x2]`). Entries persist across uninstall/reinstall via sync storage.
- **Share & import redaction sets**: Export your custom redaction words as a JSON file and share them with your team. Import sets from colleagues with automatic duplicate detection.
- **PDF audit reports**: Export a professionally formatted PDF compliance report from the audit log, including executive summary, category breakdowns, platform stats, and recent activity.
- **100% local**: Zero data exfiltration. No external servers. No analytics. No telemetry. Nothing leaves your browser.
- **Reversible**: Session-local redaction map lets you reconstruct original values
- **In-page un-redact toggle**: Eye icon (👁) on the LLM page lets you toggle between redacted placeholders and original values without leaving the conversation
- **Scrub bubble**: Visual notification after document redaction with instant download of the cleaned file
- **Audit log**: Full redaction event history with timestamps, platforms, and category tags — exportable as a PDF compliance report
- **Network-level guarantee**: Even if UI-level interception is bypassed, the network interceptor catches PII before any request leaves the browser

## Installation

Install from the Chrome extensions page [here](https://chromewebstore.google.com/detail/crossout/oihdkggpbopimdndhephiechoegagoeb).

Or if you want to test locally,

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder
5. Navigate to ChatGPT, Claude, or Gemini — Blankit activates automatically

## How It Works

Blankit operates at two levels:

1. **UI Layer**: Monitors text inputs and file uploads on LLM sites, redacting PII before submission
2. **Network Layer**: Wraps the browser's native `fetch` and `XMLHttpRequest` APIs to inspect and scrub every outgoing request as a safety net

Sensitive values are replaced with tagged placeholders (e.g., `[EMAIL_1]`, `[SSN_1]`) so AI responses remain coherent. Custom words use non-deterministic 6-character hex hashes (e.g., `[a3f7x2]`) instead of sequential counters. Custom word entries containing regex metacharacters (such as `[`, `]`, `\`, `+`, `*`, `?`, `{`, `}`, `(`, `)`, `|`) are automatically treated as regex patterns.

> **PDF support is partial.** PDFs are processed on a best-effort basis — some content (embedded images, complex layouts, scanned pages) may not be fully redacted. DOCX, XLSX, PPTX, TXT, CSV, and other text formats are fully supported.

You can also **toggle it on and off** at any time — via the floating badge on the page or the toolbar popup.

## Un-redact Toggle

Click the **eye icon (👁)** on the LLM page to reveal original values in the conversation. Click again to re-apply redacted placeholders. This operates entirely in your browser DOM — no data is sent anywhere.

## Audit Log

Track every redaction event with the built-in **Audit Log**:

- **View**: See timestamped entries with platform, item count, source (text/document), and category tags
- **Export PDF**: Download a professionally formatted PDF compliance report with executive summary, category breakdowns, platform statistics, and recent activity
- **Clear**: Remove all entries at any time
  
The audit log stores only metadata — never the original PII values or document contents.

## Pricing

Blankit is **completely free**. All features, including document redaction, are unlimited with no paywalls or usage caps.

## Project Structure

```
Blankit/
├── manifest.json
├── popup.html / popup.js / popup.css    # Extension popup UI
├── onboarding.html / onboarding.css     # First-install welcome page
├── lib/                                 # Vendored libraries (JSZip, compromise.js, PDF report)
│   ├── compromise.min.js                # NLP engine for name detection
│   └── pdf-report.js                    # PDF audit report generator
├── src/
│   ├── core/                            # Shared logic
│   │   ├── pii-engine.js               # Regex patterns & redaction
│   │   ├── doc-handlers.js             # OOXML & text file parsers
│   │   └── network-base.js             # Fetch/XHR interception
│   ├── platforms/                       # Per-site strategies
│   │   ├── chatgpt/
│   │   ├── claude/
│   │   └── gemini/
│   ├── content/                         # Content scripts
│   │   ├── bridge.js                   # ISOLATED world — UI, un-redact, messaging
│   │   └── styles.css
│   └── background/
│       └── service-worker.js           # Session lifecycle, storage & audit
```

## Control Over Detection
You can freely control which of these 17 categories you want to scrub:

| Category | Placeholder | Examples |
|---|---|---|
| Email Addresses | `[EMAIL_N]` | `john@example.com` |
| Phone Numbers | `[PHONE_N]` | `(555) 123-4567` |
| SSN | `[SSN_N]` | `123-45-6789` |
| Credit Cards | `[CC_N]` | `4111-1111-1111-1111` |
| Street Addresses | `[ADDR_N]` | `123 Main Street` |
| Person Names | `[NAME_N]` | `John Smith`, `Priya Sharma` |
| Dates | `[DOB_N]` | `01/15/1990`, `15 March 1985` |
| Medical Records | `[MRN_N]` | `MRN: 12345678`, `Patient ID: ABC123` |
| IP Addresses | `[IP_N]` | `192.168.1.1`, IPv6 addresses |
| Passport Numbers | `[PASSPORT_N]` | `Passport: C12345678` |
| Driver’s Licenses | `[DL_N]` | `DL: D12345678` |
| Tax IDs | `[TAXID_N]` | `EIN: 12-3456789` |
| Bank Accounts | `[BANK_N]` | `Acct: 12345678901234` |
| MAC Addresses | `[MAC_N]` | `00:1A:2B:3C:4D:5E` |
| URLs | `[URL_N]` | `https://example.com/path` |
| Credentials | `[SECRET_N]` | `password: ...`, `Bearer ...`, API keys |
| UUIDs | `[UUID_N]` | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |


## Custom Word Redaction

In addition to the built-in detection categories, you can define your own words or phrases to redact:

1. Open the Blankit popup and scroll to **Custom Redactions**
2. Click **+ Add word** to create a new empty row
3. Type the word, phrase, or regex pattern you want redacted — a unique hash is generated automatically once you start typing
4. **Regex auto-detection:** If your entry contains regex metacharacters (e.g., `EMP-[0-9]+`, `PROJ-\d{4}`), it is automatically treated as a regex pattern. Plain words without metacharacters use exact word-boundary matching.
5. Each occurrence is replaced with a non-deterministic 6-character hex hash wrapped in brackets (e.g., `[a3f7x2]`), making it impossible to reverse by trial and error
6. Click the red bin icon to remove an entry, or **Remove all** (appears when you have more than 3 entries) to clear them all

Custom words are stored in `chrome.storage.sync` so they **persist across uninstall and reinstall**. All instances of each word are replaced at the network level before reaching the LLM. Every occurrence gets a different random hash, even for the same word.

Custom word redactions also appear in the **Audit Log** under the "Custom Word" category tag.

### Share & Import Redaction Sets

You can share your custom redaction words with teammates:

1. Click **Share** (export icon) in the Custom Redactions section to download a `.json` file containing your custom words
2. Send the file to a colleague
3. They click **Import** (import icon) and select the file
4. Duplicate words are automatically skipped — only new entries are added

The export format is `blankit-custom-words` v1.0 JSON, validated on import.

## Share & Rate

Enjoy Blankit? Spread the word:

- **Share**: Click the share button in the popup footer to copy a shareable link to your clipboard
- **Rate**: Click the rate button to leave a review on the Chrome Web Store


## Privacy & Security

- All PII detection and redaction runs **locally in your browser**
- **Zero network calls** — no data is sent to any external server by the extension (except the LLM you're already using)
- **No analytics, no telemetry** — there is no analytics or telemetry code in the extension. Zero network calls are made by the extension.
- **Audit log privacy** — The audit log stores only metadata (timestamp, platform, category tags, item counts) — never original PII values or document contents
- Source code is fully auditable

## License

All rights reserved. See [LICENSE.md](LICENSE.md) for details.
