// src/core/network-base.js — Global fetch/XHR monkey-patching, UI input interception, settings bridge
// Uses selectors registered by platform selector files and shared PII/doc APIs.
(function () {
    'use strict';

    var C = window.__cloaker;

    // =========================================================================
    // URL Filtering — which POST requests get JSON/text body redaction
    // =========================================================================

    var REDACT_URL_PATTERNS = [
        /\/backend-api\/conversation($|\?)/,
        /\/backend-api\/f\/conversation($|\?)/,
        /\/api\/append_message/,
        /\/api\/organizations\/.+\/chat_conversations\/.+\/completion/,
        /\/api\/generate/,
        /BatchExecute/
    ];

    function shouldRedactUrl(url) {
        for (var i = 0; i < REDACT_URL_PATTERNS.length; i++) {
            if (REDACT_URL_PATTERNS[i].test(url)) return true;
        }
        return false;
    }

    // URLs where binary body interception should be skipped (external upload CDNs)
    var SKIP_BINARY_URL_PATTERNS = [
        /\.clients\d*\.google\.com\/upload/,
        /\.googleusercontent\.com\/upload/,
        /storage\.googleapis\.com/,
        /content-push\.googleapis\.com/
    ];

    function shouldSkipBinaryRedact(url) {
        if (!url) return false;
        for (var i = 0; i < SKIP_BINARY_URL_PATTERNS.length; i++) {
            if (SKIP_BINARY_URL_PATTERNS[i].test(url)) return true;
        }
        return false;
    }

    // Check if a URL is LLM-platform traffic we should intercept.
    // Cross-origin requests to ad/tracking domains are skipped entirely
    // so our wrapper never appears in their CSP violation stack traces.
    function isLLMTraffic(url) {
        try {
            var parsed = new URL(url, location.origin);
            if (parsed.origin === location.origin) return true;
            var h = parsed.hostname;
            if (/\.(googleapis|google|gstatic|googleusercontent)\.com$/.test(h)) return true;
            if (/\.(openai|anthropic)\.com$/.test(h)) return true;
            if (h === 'chatgpt.com' || h === 'claude.ai') return true;
            return false;
        } catch (e) {
            return true; // relative URLs are same-origin
        }
    }

    // =========================================================================
    // Header helpers
    // =========================================================================

    function stripContentLength(headers) {
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
    }

    function stripContentType(headers) {
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
    }

    // Always returns a plain Record<string,string> — the safest format for
    // native fetch() RequestInit.headers.  Filters out null/undefined values
    // and stringifies everything so we never hit the ByteString type error.
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
                if (headers[keys[i]] != null) {
                    result[keys[i]] = String(headers[keys[i]]);
                }
            }
        }
        return result;
    }

    // =========================================================================
    // Fetch Interceptor
    // =========================================================================

    var origFetch = window.fetch;

    window.fetch = async function (input, init) {
        if (!C.enabled) return origFetch.call(this, input, init);

        try {
            var url = (typeof input === 'string') ? input : (input instanceof URL ? input.toString() : (input instanceof Request ? input.url : String(input)));
            var method = ((init && init.method) || (input instanceof Request ? input.method : 'GET')).toUpperCase();

            if (method === 'GET' || method === 'HEAD') return origFetch.call(this, input, init);

            // Skip non-LLM traffic (ad trackers, analytics) to stay out of CSP error stacks
            if (!isLLMTraffic(url)) return origFetch.call(this, input, init);

            function sendWith(newBody, dropCT) {
                var headers;
                if (init && init.headers) {
                    headers = copyHeaders(init.headers);
                } else if (input instanceof Request) {
                    headers = copyHeaders(new Headers(input.headers));
                }
                headers = stripContentLength(headers);
                if (dropCT) headers = stripContentType(headers);

                var opts = {
                    method: method, headers: headers, body: newBody,
                    credentials: (init && init.credentials) || (input instanceof Request ? input.credentials : undefined),
                    cache: (init && init.cache) || (input instanceof Request ? input.cache : undefined),
                    redirect: (init && init.redirect) || (input instanceof Request ? input.redirect : undefined),
                    referrer: (init && init.referrer) || (input instanceof Request ? input.referrer : undefined),
                    referrerPolicy: (init && init.referrerPolicy) || (input instanceof Request ? input.referrerPolicy : undefined),
                    signal: (init && init.signal) || (input instanceof Request ? input.signal : undefined),
                    mode: (init && init.mode) || (input instanceof Request ? input.mode : undefined)
                };
                for (var k in opts) { if (opts[k] === undefined) delete opts[k]; }
                return origFetch.call(window, url, opts);
            }

            // CASE A: init.body exists
            if (init && init.body !== undefined && init.body !== null) {
                var body = init.body;
                var skipBinary = shouldSkipBinaryRedact(url);

                if (!skipBinary && body instanceof FormData) {
                    return sendWith(await C.redactFormData(body), true);
                }
                if (!skipBinary && (body instanceof Blob || body instanceof File)) {
                    if (C._cleanedFiles && C._cleanedFiles.has(body)) {
                        // already cleaned by platform interceptor — skip
                    } else {
                        return sendWith(await C.tryRedactBlob(body), false);
                    }
                }
                if (!skipBinary && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) {
                    var buf = body instanceof ArrayBuffer ? body : body.buffer;
                    var magic = C.detectDocMagic(buf);
                    if (magic === 'ooxml') {
                        var f = new File([buf], 'document.docx', { type: 'application/octet-stream' });
                        var cleaned = await C.redactOoxmlFile(f);
                        return sendWith(await C._origBlobArrayBuffer.call(cleaned), false);
                    }
                    if (magic === 'pdf') {
                        var pf = new File([buf], 'document.pdf', { type: 'application/pdf' });
                        var cleanedPdf = await C.redactPdfFile(pf);
                        return sendWith(await C._origBlobArrayBuffer.call(cleanedPdf), false);
                    }
                    return origFetch.call(this, input, init);
                }
                if (typeof body === 'string' && body.length >= 20 && shouldRedactUrl(url)) {
                    try {
                        var parsed = JSON.parse(body);
                        var r = C.deepRedactObj(parsed);
                        if (r.items.length > 0) {
                            C.notifyRedaction(r.items.length, r.items);
                            return sendWith(JSON.stringify(r.result), false);
                        }
                    } catch (e) {
                        var r2 = C.redactString(body);
                        if (r2.items.length > 0) {
                            C.notifyRedaction(r2.items.length, r2.items);
                            return sendWith(r2.result, false);
                        }
                    }
                    return origFetch.call(this, input, init);
                }
                return origFetch.call(this, input, init);
            }

            // CASE B: input is a Request with a body
            if (input instanceof Request && input.body) {
                var ct = input.headers.get('content-type') || '';
                if (ct.includes('multipart/form-data') || ct.includes('formdata')) {
                    try {
                        return sendWith(await C.redactFormData(await input.formData()), true);
                    } catch (e) { /* can't parse */ }
                } else if (shouldRedactUrl(url) && (ct.includes('json') || ct.includes('text'))) {
                    try {
                        var text = await input.text();
                        if (text.length >= 20) {
                            try {
                                var p = JSON.parse(text);
                                var r3 = C.deepRedactObj(p);
                                if (r3.items.length > 0) {
                                    C.notifyRedaction(r3.items.length, r3.items);
                                    return sendWith(JSON.stringify(r3.result), false);
                                }
                            } catch (e2) {
                                var r4 = C.redactString(text);
                                if (r4.items.length > 0) {
                                    C.notifyRedaction(r4.items.length, r4.items);
                                    return sendWith(r4.result, false);
                                }
                            }
                        }
                    } catch (e) { /* body consumed */ }
                }
                return origFetch.call(this, input, init);
            }

            return origFetch.call(this, input, init);
        } catch (e) {
            console.warn('[Cloaker] Fetch intercept error:', e);
            return origFetch.call(this, input, init);
        }
    };

    // =========================================================================
    // XHR Interceptor
    // =========================================================================

    var origXHROpen = XMLHttpRequest.prototype.open;
    var origXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this._cloakerMethod = (method || 'GET').toUpperCase();
        this._cloakerUrl = url;
        return origXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        var xhr = this;
        if (!C.enabled || !body || xhr._cloakerMethod === 'GET' || xhr._cloakerMethod === 'HEAD') {
            return origXHRSend.call(xhr, body);
        }

        var xhrUrl = xhr._cloakerUrl || '';

        // Skip non-LLM traffic (ad trackers, analytics) to stay out of CSP error stacks
        if (!isLLMTraffic(xhrUrl)) return origXHRSend.call(xhr, body);

        try {
            // Skip binary body interception for external upload CDNs (e.g. Gemini)
            var skipBinary = shouldSkipBinaryRedact(xhrUrl);

            if (!skipBinary && body instanceof FormData) {
                C.redactFormData(body).then(function (cleaned) {
                    origXHRSend.call(xhr, cleaned);
                }).catch(function () { origXHRSend.call(xhr, body); });
                return;
            }
            if (!skipBinary && (body instanceof Blob || body instanceof File)) {
                if (C._cleanedFiles && C._cleanedFiles.has(body)) {
                    // already cleaned by platform interceptor — skip
                } else {
                    C.tryRedactBlob(body).then(function (cleaned) {
                        origXHRSend.call(xhr, cleaned);
                    }).catch(function () { origXHRSend.call(xhr, body); });
                    return;
                }
            }
            if (!skipBinary && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) {
                var buf = body instanceof ArrayBuffer ? body : body.buffer;
                var magic2 = C.detectDocMagic(buf);
                if (magic2 === 'ooxml') {
                    var file = new File([buf], 'document.docx', { type: 'application/octet-stream' });
                    C.redactOoxmlFile(file).then(function (cleaned) {
                        C._origBlobArrayBuffer.call(cleaned).then(function (newBuf) {
                            origXHRSend.call(xhr, newBuf);
                        });
                    }).catch(function () { origXHRSend.call(xhr, body); });
                    return;
                }
                if (magic2 === 'pdf') {
                    var pf2 = new File([buf], 'document.pdf', { type: 'application/pdf' });
                    C.redactPdfFile(pf2).then(function (cleaned) {
                        C._origBlobArrayBuffer.call(cleaned).then(function (newBuf) {
                            origXHRSend.call(xhr, newBuf);
                        });
                    }).catch(function () { origXHRSend.call(xhr, body); });
                    return;
                }
                return origXHRSend.call(xhr, body);
            }
            if (typeof body === 'string' && body.length >= 20 && shouldRedactUrl(xhr._cloakerUrl || '')) {
                try {
                    var parsed = JSON.parse(body);
                    var r = C.deepRedactObj(parsed);
                    if (r.items.length > 0) {
                        C.notifyRedaction(r.items.length, r.items);
                        return origXHRSend.call(xhr, JSON.stringify(r.result));
                    }
                } catch (e) {
                    var r2 = C.redactString(body);
                    if (r2.items.length > 0) {
                        C.notifyRedaction(r2.items.length, r2.items);
                        return origXHRSend.call(xhr, r2.result);
                    }
                }
            }
        } catch (e) {
            console.warn('[Cloaker] XHR intercept error:', e);
        }
        return origXHRSend.call(xhr, body);
    };

    // =========================================================================
    // UI Input Interception (shared across platforms, uses registered selectors)
    // =========================================================================

    function findInputArea() {
        for (var i = 0; i < C.inputSelectors.length; i++) {
            var el = document.querySelector(C.inputSelectors[i]);
            if (el) return el;
        }
        return null;
    }

    function findSendButton() {
        for (var i = 0; i < C.sendButtonSelectors.length; i++) {
            var el = document.querySelector(C.sendButtonSelectors[i]);
            if (el) return el;
        }
        return null;
    }

    function getInputText(el) {
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
        return el.innerText || el.textContent || '';
    }

    function setInputText(el, text) {
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') ||
                               Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            if (nativeSetter && nativeSetter.set) {
                nativeSetter.set.call(el, text);
            } else {
                el.value = text;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
        }
    }

    function autoSend() {
        var btn = findSendButton();
        if (btn) {
            var evt = new MouseEvent('click', { bubbles: true, cancelable: true });
            evt.__cloakerBypass = true;
            btn.dispatchEvent(evt);
        } else {
            var input = findInputArea();
            if (input) {
                var enterEvt = new KeyboardEvent('keydown', {
                    key: 'Enter', code: 'Enter', keyCode: 13,
                    bubbles: true, cancelable: true
                });
                enterEvt.__cloakerBypass = true;
                input.dispatchEvent(enterEvt);
            }
        }
    }

    // Enter key interception (capture phase)
    document.addEventListener('keydown', function (e) {
        if (!C.enabled || e.__cloakerBypass) return;
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

        var inputArea = findInputArea();
        if (!inputArea) return;

        var active = document.activeElement;
        if (active !== inputArea && !inputArea.contains(active)) return;

        var text = getInputText(inputArea);
        var r = C.redactString(text);
        if (r.items.length === 0) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        setInputText(inputArea, r.result);
        C.notifyInputRedaction(r.items.length, r.items);
        setTimeout(autoSend, 900);
    }, true);

    // Send button click interception (capture phase)
    document.addEventListener('click', function (e) {
        if (!C.enabled || e.__cloakerBypass) return;

        var target = e.target.closest(C.sendButtonSelectors.join(','));
        if (!target) return;

        var inputArea = findInputArea();
        if (!inputArea) return;

        var text = getInputText(inputArea);
        var r = C.redactString(text);
        if (r.items.length === 0) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        setInputText(inputArea, r.result);
        C.notifyInputRedaction(r.items.length, r.items);
        setTimeout(autoSend, 900);
    }, true);

    // =========================================================================
    // Settings bridge (MAIN ↔ ISOLATED via postMessage)
    // =========================================================================

    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        var data = e.data;

        if (data && data.type === 'CLOAKER_SETTINGS') {
            if (typeof data.enabled === 'boolean') C.enabled = data.enabled;
            if (data.categories && typeof data.categories === 'object') C.categories = data.categories;
            if (Array.isArray(data.customWords)) C.customWords = data.customWords;
            if (typeof C.clearScrubCache === 'function') C.clearScrubCache();
        }

        if (data && data.type === 'CLOAKER_CLEAR') {
            C.redactionMap = {};
            C.redactionCounter = 0;
            if (typeof C.clearScrubCache === 'function') C.clearScrubCache();
        }
    });

    // Signal readiness to ISOLATED world
    window.postMessage({ type: 'CLOAKER_READY' }, '*');

})();
