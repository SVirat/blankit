// src/core/pii-engine.js — Shared PII/PHI detection engine
// Initializes the global __cloaker namespace and provides redactString/deepRedactObj.
// Name detection uses compromise.js NLP with regex fallback.
(function () {
    'use strict';

    // =========================================================================
    // Global namespace — all MAIN-world scripts share state through this
    // =========================================================================

    window.__cloaker = {
        enabled: true,
        categories: {
            emails: true, phones: true, ssn: true, creditCards: true,
            addresses: true, names: true, dates: true, medical: true, ip: true,
            passport: true, driversLicense: true, taxId: true,
            bankAccount: true, macAddress: true, urls: true,
            credentials: true, uuid: true
        },
        customWords: [],
        redactionMap: {},
        redactionCounter: 0,
        inputSelectors: [],
        sendButtonSelectors: []
    };

    var C = window.__cloaker;

    // =========================================================================
    // NLP engine — compromise.js (fail-safe: falls back to regex)
    // =========================================================================

    var _nlpReady = false;
    try {
        if (typeof nlp === 'function') {
            _nlpReady = true;
        }
    } catch (e) { /* compromise.js not loaded — regex fallback will be used */ }

    // =========================================================================
    // Scrub cache — identical inputs return cached redacted output instantly
    // =========================================================================

    var _scrubCache = new Map();
    var _CACHE_MAX = 200;

    C.clearScrubCache = function () { _scrubCache.clear(); };

    // =========================================================================
    // Common words excluded from name detection (~130+)
    // =========================================================================

    // =========================================================================
    // Top-20 most common first names — always redacted even standalone
    // =========================================================================

    var COMMON_NAMES = new Set([
        'James', 'Robert', 'John', 'Michael', 'David',
        'William', 'Richard', 'Joseph', 'Thomas', 'Charles',
        'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara',
        'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen',
        // Top 20 most common Indian names
        'Aarav', 'Vivaan', 'Aditya', 'Virat', 'Arjun',
        'Sai', 'Reyansh', 'Rahul', 'Krishna', 'Ishaan',
        'Ananya', 'Diya', 'Priya', 'Raj', 'Isha',
        'Saanvi', 'Anika', 'Kavya', 'Riya', 'Pooja'
    ]);

    var COMMON_WORDS = new Set([
        'the', 'be', 'to', 'of', 'and', 'in', 'that', 'have', 'it', 'for',
        'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but',
        'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an',
        'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so',
        'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
        'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
        'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could',
        'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only',
        'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use',
        'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new',
        'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
        'great', 'has', 'had', 'been', 'was', 'are', 'did', 'does', 'got',
        'may', 'much', 'must', 'own', 'should', 'still', 'such', 'too',
        'very', 'where', 'while', 'why', 'each', 'here', 'right', 'through',
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December',
        'The', 'This', 'That', 'These', 'Those', 'What', 'Which', 'Where',
        'When', 'How', 'Who', 'Why', 'Here', 'There', 'Each', 'Every',
        'Some', 'Any', 'All', 'Both', 'Few', 'More', 'Most', 'Other',
        'Such', 'Only', 'Same', 'Than', 'Very', 'Just', 'But', 'And',
        'For', 'Not', 'You', 'Are', 'Was', 'Were', 'Been', 'Being',
        'Have', 'Has', 'Had', 'Does', 'Did', 'Will', 'Would', 'Could',
        'Should', 'May', 'Might', 'Must', 'Shall', 'Can', 'Need', 'Dare',
        'About', 'Above', 'After', 'Again', 'Also', 'Back', 'Before',
        'Below', 'Between', 'Come', 'Could', 'Down', 'Even', 'First',
        'From', 'Get', 'Give', 'Good', 'Great', 'Into', 'Know', 'Like',
        'Look', 'Make', 'Most', 'Much', 'New', 'Now', 'Over', 'Own',
        'Part', 'Right', 'See', 'Still', 'Take', 'Tell', 'Think',
        'Through', 'Time', 'Under', 'Want', 'Way', 'Well', 'With', 'Work',
        'Year', 'Your', 'Please', 'Hello', 'Thank', 'Thanks', 'Dear',
        'Best', 'Kind', 'Note', 'Sure', 'Data', 'File', 'Help', 'Home',
        'Long', 'Left', 'Next', 'Last', 'High', 'Full', 'Real', 'True',
        'Open', 'Line', 'Type', 'Free', 'Using', 'Without', 'Within',
        'ask', 'call', 'send', 'read', 'check', 'run', 'let', 'try',
        'keep', 'move', 'show', 'start', 'stop', 'watch', 'write', 'meet',
        'Ask', 'Call', 'Send', 'Read', 'Check', 'Run', 'Let', 'Try',
        'Keep', 'Move', 'Show', 'Start', 'Stop', 'Watch', 'Write', 'Meet',
        // Document / filename vocabulary — prevents filename words from being grouped into names
        'Report', 'History', 'Medical', 'Financial', 'Insurance', 'Record',
        'Records', 'Document', 'Documents', 'Summary', 'Statement', 'Invoice',
        'Receipt', 'Application', 'Form', 'Letter', 'Contract', 'Agreement',
        'Certificate', 'License', 'Policy', 'Claim', 'Billing', 'Payment',
        'Account', 'Profile', 'Personal', 'Private', 'Confidential', 'Official',
        'Draft', 'Final', 'Copy', 'Original', 'Updated', 'Revised', 'Signed',
        'Unsigned', 'Approved', 'Pending', 'Intake', 'Discharge', 'Diagnosis',
        'Prescription', 'Lab', 'Results', 'Test', 'Exam', 'Scan', 'Health',
        'Dental', 'Vision', 'Mental', 'Emergency', 'Clinical', 'Patient',
        'Employment', 'Salary', 'Tax', 'Return', 'Transcript', 'Academic',
        'Education', 'School', 'Legal', 'Court', 'Case', 'Filing', 'Complaint',
        'Response', 'Order', 'Resolution', 'Review', 'Audit', 'Compliance',
        'Verification', 'Background', 'Reference', 'Recommendation',
        'report', 'history', 'medical', 'financial', 'insurance', 'record',
        'records', 'document', 'documents', 'summary', 'statement', 'invoice',
        'receipt', 'application', 'form', 'letter', 'contract', 'agreement',
        'certificate', 'license', 'policy', 'claim', 'billing', 'payment',
        'account', 'profile', 'personal', 'private', 'confidential', 'official',
        'draft', 'final', 'copy', 'original', 'updated', 'revised', 'signed',
        'unsigned', 'approved', 'pending', 'intake', 'discharge', 'diagnosis',
        'prescription', 'lab', 'results', 'test', 'exam', 'scan', 'health',
        'dental', 'vision', 'mental', 'emergency', 'clinical', 'patient',
        'employment', 'salary', 'tax', 'return', 'transcript', 'academic',
        'education', 'school', 'legal', 'court', 'case', 'filing', 'complaint',
        'response', 'order', 'resolution', 'review', 'audit', 'compliance',
        'verification', 'background', 'reference', 'recommendation',
        // AI platform / model identifiers — prevent false-positive name matches
        'Claude', 'claude', 'Gemini', 'gemini', 'ChatGPT', 'chatgpt',
        'GPT', 'gpt', 'Anthropic', 'anthropic', 'Mistral', 'mistral',
        'Llama', 'llama', 'Copilot', 'copilot', 'Sonnet', 'sonnet',
        'Opus', 'opus', 'Haiku', 'haiku', 'Flash', 'flash',
        'Turbo', 'turbo', 'Preview', 'preview', 'Latest', 'latest',
        'Mini', 'mini', 'Nano', 'nano', 'Ultra', 'ultra', 'Pro', 'pro',
        'Model', 'model', 'Server', 'server', 'Client', 'client',
        'System', 'system', 'Assistant', 'assistant', 'User', 'user',
        'Admin', 'admin', 'Agent', 'agent', 'Default', 'default',
        'Custom', 'custom', 'Config', 'config', 'Setup', 'setup',
        'Version', 'version', 'Build', 'build', 'Release', 'release'
    ]);

    // =========================================================================
    // Pattern definitions — 9 detection categories
    // =========================================================================

    var PATTERNS = [
        // ── Highly distinctive patterns (run first) ─────────────────────
        { key: 'emails',           label: 'EMAIL',    type: 'Email',                  regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g },
        { key: 'credentials',      label: 'SECRET',   type: 'Credential',             regex: /(?:(?:password|passwd|pwd)[:\s=]*\S{6,}|(?:api[_\-]?key|apikey|api[_\-]?secret|access[_\-]?key|secret[_\-]?key)[:\s=]*['"]?\S{8,}['"]?|Bearer\s+[A-Za-z0-9\-._~+\/]+=*|(?:-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----))/gi },
        { key: 'urls',             label: 'URL',      type: 'URL',                    regex: /\bhttps?:\/\/[^\s<>"')\]]+/gi },

        // ── Structured identifiers (run before generic digit patterns) ──
        { key: 'uuid',             label: 'UUID',     type: 'UUID',                   regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g },
        { key: 'macAddress',       label: 'MAC',      type: 'MAC Address',            regex: /\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g },
        { key: 'creditCards',      label: 'CC',       type: 'Credit Card',            regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
        { key: 'ip',               label: 'IP',       type: 'IP Address',             regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|::(?:[fF]{4}:)?(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?))\b/g },

        // ── Keyword-prefixed IDs (require label to avoid false positives) ─
        { key: 'driversLicense',   label: 'DL',       type: 'Drivers License',        regex: /\b(?:D\.?L\.?|driver'?s?\s*(?:license|licence|lic))[:\s#]*[A-Z0-9]{5,15}\b/gi },
        { key: 'passport',         label: 'PASSPORT', type: 'Passport Number',        regex: /\b(?:passport)(?:\s*(?:no|number|#|num))?[:\s#]*[A-Z]{0,2}\d{6,9}\b/gi },
        { key: 'taxId',            label: 'TAXID',    type: 'Tax ID',                 regex: /\b(?:TIN|EIN|ITIN)[:\s#-]*\d{2}[-\s]?\d{7}\b/g },
        { key: 'bankAccount',      label: 'BANK',     type: 'Bank Account',           regex: /\b(?:(?:account|acct|a\/c)[:\s#]*\d{8,17}|(?:IBAN)[:\s]*[A-Z]{2}\d{2}[\s]?[A-Z0-9]{4}(?:[\s]?[A-Z0-9]{4}){2,7}(?:[\s]?[A-Z0-9]{1,4})?|(?:SWIFT|BIC)[:\s]*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/gi },
        { key: 'medical',          label: 'MRN',      type: 'Medical Record Number',  regex: /\bMR#[:\s]*[A-Z0-9]{4,15}\b|\b(?:MRN)[:\s#]+[A-Z0-9]{4,15}\b|(?:Medical Record|Health Plan|Beneficiary|Patient (?:ID|Acct|Account)|Insurance (?:ID|Policy))[:\s#]+(?=[A-Z0-9]*\d)[A-Z0-9]{4,15}\b/gi },
        { key: 'ssn',              label: 'SSN',      type: 'SSN',                    regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g },

        // ── Generic patterns (run last to avoid conflicts) ──────────────
        { key: 'phones',           label: 'PHONE',    type: 'Phone Number',           regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
        { key: 'addresses',        label: 'ADDR',     type: 'Street Address',         regex: /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:[Ss]t(?:reet)?|[Aa]ve(?:nue)?|[Bb]lvd|[Bb]oulevard|[Dd]r(?:ive)?|[Ll]n|[Ll]ane|[Rr]d|[Rr]oad|[Cc]t|[Cc]ourt|[Pp]l(?:ace)?|[Ww]ay|[Cc]ir(?:cle)?|[Tt]er(?:race)?|[Tt]rl|[Tt]rail|[Pp]kwy|[Pp]arkway|[Hh]wy|[Hh]ighway|[Aa]lly?|[Aa]lley|[Ll]oop|[Pp]ass|[Pp]ike)\.?(?:\s*,\s*(?:[Aa]pt|[Ss]uite|[Uu]nit|[Ss]te|#)\.?\s*\w+)?(?:\s*,\s*[A-Za-z]+(?:\s+[A-Za-z]+){0,2})?(?:\s*,?\s+[A-Z]{2}(?=\s+\d{5}|[\s.,;!?\n\r]|$))?(?:\s+\d{5}(?:-\d{4})?)?/g },
        { key: 'dates',            label: 'DOB',      type: 'Date',                   regex: /\b(?:(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}|(?:19|20)\d{2}[\/\-](?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+(?:19|20)\d{2}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?:19|20)\d{2})\b/gi }
    ];

    // =========================================================================
    // generateHash() — Non-deterministic 6-char hex hash for custom words
    // =========================================================================

    function generateHash() {
        var chars = '0123456789abcdef';
        var hash = '';
        for (var i = 0; i < 6; i++) {
            hash += chars.charAt(Math.floor(Math.random() * 16));
        }
        return hash;
    }

    // =========================================================================
    // redactString(text) — Primary PII detection function
    // =========================================================================

    C.redactString = function (text) {
        if (!text || text.length < 3) return { result: text, items: [] };

        // ── Cache check ─────────────────────────────────────────────────
        var cached = _scrubCache.get(text);
        if (cached) {
            // Re-populate redactionMap from cached entries
            for (var ph in cached.mapEntries) {
                if (Object.prototype.hasOwnProperty.call(cached.mapEntries, ph)) {
                    C.redactionMap[ph] = cached.mapEntries[ph];
                }
            }
            return { result: cached.result, items: cached.items.slice() };
        }

        var result = text;
        var items = [];

        // ── Pre-pass: reuse placeholders for previously seen originals ──
        var mapKeys = Object.keys(C.redactionMap);
        if (mapKeys.length > 0) {
            // Build reverse lookup: original value → existing placeholder
            var rev = [];
            for (var mi = 0; mi < mapKeys.length; mi++) {
                var entry = C.redactionMap[mapKeys[mi]];
                if (entry && entry.original) {
                    rev.push({ original: entry.original, placeholder: mapKeys[mi], type: entry.type });
                }
            }
            // Sort longest-first to prevent partial replacement
            rev.sort(function (a, b) { return b.original.length - a.original.length; });
            for (var ri = 0; ri < rev.length; ri++) {
                var orig = rev[ri].original;
                if (result.indexOf(orig) === -1) continue;
                var escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                var rePre = new RegExp('\\b' + escaped + '\\b', 'g');
                result = result.replace(rePre, function () {
                    items.push({ type: rev[ri].type, placeholder: rev[ri].placeholder });
                    return rev[ri].placeholder;
                });
            }
        }

        for (var i = 0; i < PATTERNS.length; i++) {
            var pattern = PATTERNS[i];
            if (!C.categories[pattern.key]) continue;
            pattern.regex.lastIndex = 0;
            result = result.replace(pattern.regex, function (match) {
                if (/^\[.+_\d+\]$/.test(match)) return match;
                C.redactionCounter++;
                var placeholder = '[' + pattern.label + '_' + C.redactionCounter + ']';
                C.redactionMap[placeholder] = { original: match, type: pattern.type };
                items.push({ type: pattern.type, placeholder: placeholder });
                return placeholder;
            });
        }

        // ── Name detection ──────────────────────────────────────────────
        if (C.categories.names) {
            var nlpSucceeded = false;

            // NLP path — compromise.js
            if (_nlpReady) {
                try {
                    var doc = nlp(result);
                    var people = doc.people().out('array');
                    nlpSucceeded = true;

                    if (people && people.length > 0) {

                        // Post-process: trim common words and punctuation from name edges
                        var cleaned = [];
                        for (var p = 0; p < people.length; p++) {
                            // Strip leading/trailing punctuation from the whole match
                            var raw = people[p].trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
                            var words = raw.split(/\s+/);
                            // Trim leading common words
                            while (words.length > 0 && (COMMON_WORDS.has(words[0]) || COMMON_WORDS.has(words[0].toLowerCase()))) {
                                words.shift();
                            }
                            // Trim trailing common words
                            while (words.length > 0 && (COMMON_WORDS.has(words[words.length - 1]) || COMMON_WORDS.has(words[words.length - 1].toLowerCase()))) {
                                words.pop();
                            }
                            if (words.length > 0) cleaned.push(words.join(' '));
                        }

                        // Sort longest-first to prevent partial replacement
                        cleaned.sort(function (a, b) { return b.length - a.length; });

                        for (var p = 0; p < cleaned.length; p++) {
                            var name = cleaned[p];
                            if (name.length < 2) continue;
                            // Skip placeholders already inserted
                            if (/\[.+_\d+\]/.test(name)) continue;
                            // Skip common English words
                            if (COMMON_WORDS.has(name) || COMMON_WORDS.has(name.toLowerCase())) continue;

                            var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            result = result.replace(new RegExp('\\b' + escaped + '\\b', 'g'), function (match) {
                                if (/^\[.+_\d+\]/.test(match)) return match;
                                C.redactionCounter++;
                                var ph = '[NAME_' + C.redactionCounter + ']';
                                C.redactionMap[ph] = { original: match, type: 'Person Name' };
                                items.push({ type: 'Person Name', placeholder: ph });
                                return ph;
                            });
                        }
                    }

                    // Supplement: standalone COMMON_NAMES that NLP may have missed
                    result = result.replace(/\b[A-Z][a-zA-Z]{1,15}\b/g, function (match) {
                        if (/^\[.+_\d+\]/.test(match)) return match;
                        var normalized = match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
                        if (!COMMON_NAMES.has(normalized)) return match;
                        if (COMMON_WORDS.has(match) || COMMON_WORDS.has(match.toLowerCase())) return match;
                        C.redactionCounter++;
                        var ph = '[NAME_' + C.redactionCounter + ']';
                        C.redactionMap[ph] = { original: match, type: 'Person Name' };
                        items.push({ type: 'Person Name', placeholder: ph });
                        return ph;
                    });
                } catch (e) {
                    // NLP threw — fall through to regex fallback
                    nlpSucceeded = false;
                }
            }

            // Regex fallback — used when NLP is unavailable or threw an error
            if (!nlpSucceeded) {
                var nameRegex = /\b[A-Z][a-zA-Z]{1,15}(?:\s+[A-Z][a-zA-Z]{1,15}){1,3}\b/g;
                result = result.replace(nameRegex, function (match) {
                    if (/^\[.+_\d+\]/.test(match)) return match;
                    var words = match.split(/(\s+)/);
                    var allNonCommon = true;
                    for (var w = 0; w < words.length; w += 2) {
                        if (COMMON_WORDS.has(words[w]) || COMMON_WORDS.has(words[w].toLowerCase())) {
                            allNonCommon = false;
                            break;
                        }
                    }
                    if (allNonCommon) {
                        C.redactionCounter++;
                        var placeholder = '[NAME_' + C.redactionCounter + ']';
                        C.redactionMap[placeholder] = { original: match, type: 'Person Name' };
                        items.push({ type: 'Person Name', placeholder: placeholder });
                        return placeholder;
                    }
                    var parts = [];
                    var run = [];
                    for (var w = 0; w < words.length; w++) {
                        if (w % 2 === 1) {
                            if (run.length > 0) run.push(words[w]);
                            else parts.push(words[w]);
                            continue;
                        }
                        var isCommon = COMMON_WORDS.has(words[w]) || COMMON_WORDS.has(words[w].toLowerCase());
                        if (!isCommon) {
                            run.push(words[w]);
                        } else {
                            if (run.length > 0) {
                                var runText = run.join('');
                                C.redactionCounter++;
                                var ph = '[NAME_' + C.redactionCounter + ']';
                                C.redactionMap[ph] = { original: runText.trim(), type: 'Person Name' };
                                items.push({ type: 'Person Name', placeholder: ph });
                                parts.push(ph);
                                run = [];
                            }
                            parts.push(words[w]);
                        }
                    }
                    if (run.length > 0) {
                        var runText = run.join('');
                        C.redactionCounter++;
                        var ph = '[NAME_' + C.redactionCounter + ']';
                        C.redactionMap[ph] = { original: runText.trim(), type: 'Person Name' };
                        items.push({ type: 'Person Name', placeholder: ph });
                        parts.push(ph);
                    }
                    return parts.join('');
                });

                result = result.replace(/\b[A-Z][a-zA-Z]{1,15}\b/g, function (match) {
                    if (/^\[.+_\d+\]/.test(match)) return match;
                    var normalized = match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
                    if (!COMMON_NAMES.has(normalized)) return match;
                    if (COMMON_WORDS.has(match) || COMMON_WORDS.has(match.toLowerCase())) return match;
                    C.redactionCounter++;
                    var placeholder = '[NAME_' + C.redactionCounter + ']';
                    C.redactionMap[placeholder] = { original: match, type: 'Person Name' };
                    items.push({ type: 'Person Name', placeholder: placeholder });
                    return placeholder;
                });
            }
        }

        // Custom word redaction — user-defined word→replacement pairs
        // Auto-detects regex patterns (containing metacharacters like [ ] { } \ + * ? | ( )).
        // Plain words use escaped word-boundary matching.
        var _REGEX_META = /[[\]{}()|\\*+?]/;
        if (C.customWords && C.customWords.length > 0) {
            for (var cw = 0; cw < C.customWords.length; cw++) {
                var entry = C.customWords[cw];
                if (!entry.word || entry.word.length < 1) continue;

                var cwRegex;
                if (_REGEX_META.test(entry.word)) {
                    try { cwRegex = new RegExp(entry.word, 'g'); }
                    catch (e) { continue; } // Invalid regex — skip silently
                } else {
                    var escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    cwRegex = new RegExp('\\b' + escaped + '\\b', 'g');
                }

                result = result.replace(cwRegex, function (match) {
                    if (/^\[.+_\d+\]$/.test(match) || /^\[[0-9a-f]{6}\]$/.test(match)) return match;
                    var hash = generateHash();
                    var placeholder = '[' + hash + ']';
                    C.redactionMap[placeholder] = { original: match, type: 'Custom Word' };
                    items.push({ type: 'Custom Word', placeholder: placeholder });
                    return placeholder;
                });
            }
        }

        // ── Store in cache ──────────────────────────────────────────────
        var mapEntries = {};
        for (var ci = 0; ci < items.length; ci++) {
            mapEntries[items[ci].placeholder] = C.redactionMap[items[ci].placeholder];
        }
        if (_scrubCache.size >= _CACHE_MAX) {
            var firstKey = _scrubCache.keys().next().value;
            _scrubCache.delete(firstKey);
        }
        _scrubCache.set(text, { result: result, items: items, mapEntries: mapEntries });

        return { result: result, items: items };
    };

    // =========================================================================
    // deepRedactObj(obj) — Recursively walk JSON, redacting string values ≥ 5 chars
    // Keys known to carry non-PII metadata are skipped to avoid false positives.
    // =========================================================================

    var SKIP_KEYS = new Set([
        'model', 'role', 'type', 'object', 'id', 'created', 'status',
        'finish_reason', 'stop_reason', 'index', 'logprobs',
        'system_fingerprint', 'usage', 'stream', 'temperature',
        'top_p', 'max_tokens', 'stop', 'presence_penalty',
        'frequency_penalty', 'tool_choice', 'response_format',
        'parent_message_id', 'conversation_id'
    ]);

    C.deepRedactObj = function (obj) {
        var allItems = [];

        function walk(node) {
            if (typeof node === 'string') {
                if (node.length < 5) return node;
                var r = C.redactString(node);
                allItems.push.apply(allItems, r.items);
                return r.result;
            }
            if (Array.isArray(node)) return node.map(walk);
            if (node && typeof node === 'object') {
                var out = {};
                for (var key in node) {
                    if (Object.prototype.hasOwnProperty.call(node, key)) {
                        out[key] = SKIP_KEYS.has(key) ? node[key] : walk(node[key]);
                    }
                }
                return out;
            }
            return node;
        }

        var result = walk(obj);
        return { result: result, items: allItems };
    };

})();
