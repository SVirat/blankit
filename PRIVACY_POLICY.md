# Privacy Policy — Blankit

**Effective Date:** March 17, 2026  
**Last Updated:** March 20, 2026

---

## 1. Introduction

Blankit ("the Extension") is a Chrome browser extension that provides real-time, local-first redaction of Personally Identifiable Information (PII) and Protected Health Information (PHI) when you interact with cloud-based AI assistants (ChatGPT, Claude, Gemini). This Privacy Policy explains what data the Extension collects, how it is used, and your rights regarding that data.

---

## 2. Data Processing — 100% Local

All PII/PHI detection and redaction processing occurs **entirely within your browser**. Your sensitive data—names, emails, phone numbers, SSNs, credit card numbers, addresses, medical terms, dates of birth, and IP addresses—is never transmitted to the Extension developer or any third-party server.

- **Text redaction:** Performed locally via JavaScript regex matching before any request leaves your browser.
- **Document redaction:** Uploaded files (DOCX, XLSX, PPTX, TXT, CSV, etc.) are parsed and redacted in-browser using bundled libraries (JSZip). PDF support is partial (best-effort text extraction; complex layouts and scanned pages may not be fully redacted). No file content is sent externally.
- **Custom word redaction:** User-defined words are replaced with non-deterministic 8-character alphanumeric hashes (e.g., `[k7m2x9p1]`). Custom words are stored in `chrome.storage.sync` and never leave your browser.
- **Redaction map:** The mapping between placeholders (e.g., `[EMAIL_1]`) and original values is stored in `chrome.storage.local` on your device and is cleared automatically when the browser restarts or when you click "Clear Session."
- **Un-redact toggle:** The in-page eye icon (👁) that reveals original values operates entirely within the browser DOM — no data is transmitted when toggling between redacted and un-redacted views.

---

## 3. Data the Extension Stores Locally

The Extension uses `chrome.storage.local` to persist the following on your device only:

| Data | Purpose | Retention |
|------|---------|-----------|
| Protection toggle (`enabled`) | Remember your on/off preference | Until you change it |
| Category toggles | Remember which PII categories you have enabled/disabled | Until you change them |
| Total redacted count | Lifetime statistic shown in the popup | Persistent |
| Session redacted count | Per-session statistic shown in the popup | Cleared on browser restart |
| Redaction map | Placeholder-to-original-value mapping for reversibility | Cleared on browser restart |
| Audit log | Redaction event metadata (timestamp, platform, category tags, item count) | Persistent until manually cleared |


None of this data is accessible to the Extension developer or any third party.

**Important:** The audit log stores only **metadata** about redaction events (e.g., "3 items redacted on ChatGPT at 10:30 AM, categories: Email, Name"). It **never** stores the original PII values, the redacted text content, or any document contents.

---

## 4. Analytics

The Extension contains **no analytics or telemetry code**. No usage data is collected, no network requests are made to any analytics service, and no data of any kind leaves your browser via the extension.

---

## 5. Audit Log

The Extension maintains an **audit log** of redaction events for your compliance and review purposes. This log is stored **entirely on your device** in `chrome.storage.local`.

### What the audit log records

- Timestamp of each redaction event
- Platform where redaction occurred (ChatGPT, Claude, or Gemini)
- Number of PII items redacted
- Source of redaction (text input or document upload)
- Document filename (for file redaction events only)
- PII category tags detected (e.g., "Email", "SSN", "Person Name")

### What the audit log NEVER records

- The original PII values (e.g., actual email addresses, SSNs, names)
- The redacted text content or document contents
- Any data that could identify you or reconstruct the sensitive information

### Audit log management

- You can **view** the audit log at any time from the popup's "Audit Log" panel
- You can **export** the audit log as a PDF compliance report for your records
- You can **clear** the audit log entirely at any time
- The audit log is **never** transmitted to the Extension developer or any third party

---

## 6. Permissions

The Extension requests the minimum permissions necessary:

| Permission | Why it's needed |
|------------|-----------------|
| `storage` | Store your settings, statistics, audit log, and redaction map locally on your device |
| Host access to `chatgpt.com`, `claude.ai`, `gemini.google.com` | Inject content scripts to intercept and redact PII on these sites |

---

## 7. Third-Party Services

No third-party services are used. The extension makes **zero outgoing network calls**.

---

## 8. Data Security

- All PII/PHI processing happens locally in your browser's JavaScript engine.
- **No data is transmitted over the network by the Extension** — there is no analytics or telemetry code.
- All bundled libraries (JSZip) are included locally — no CDN requests are made.
- The Extension's popup sanitizes rendered content using safe DOM APIs to prevent XSS.
- The audit log contains only metadata — no original PII values or document contents.

---

## 9. Children's Privacy

The Extension is not directed at children under 13. We do not knowingly collect personal information from children.

---

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected by updating the "Last Updated" date at the top of this document. Continued use of the Extension after changes constitutes acceptance of the updated policy.

---

## 11. Contact

If you have questions or concerns about this Privacy Policy, please open an issue on the Extension's repository or contact the developer directly.
