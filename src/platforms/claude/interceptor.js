// src/platforms/claude/interceptor.js — Claude Blob/FileReader prototype override
// Completely isolated: only activates on claude.ai, guarded by try/catch (fail-open).
// Claude's React framework rejects synthetic (isTrusted=false) DOM events, so we
// rely on Blob/FileReader/bytes prototype overrides to intercept file reads, plus
// fetch/XHR interception for direct binary uploads.
(function () {
    'use strict';

    var host = window.location.hostname;
    if (host !== 'claude.ai' && host !== 'www.claude.ai') return;

    var C = window.__cloaker;
    var cleanedFiles = new WeakSet();
    var fileCleanCache = new WeakMap();

    function isCleanableFile(file) {
        if (!(file instanceof File)) return false;
        if (cleanedFiles.has(file)) return false;
        if (C._cleanedFiles && C._cleanedFiles.has(file)) return false;
        return C.isOoxmlFile(file) || C.isPdfFile(file) || C.isTextFile(file);
    }

    async function getCleanedFile(file) {
        if (fileCleanCache.has(file)) {
            return fileCleanCache.get(file);
        }

        // Mark the original file immediately so subsequent paths
        // (Blob reads, fetch, XHR) skip it via isCleanableFile().
        cleanedFiles.add(file);
        if (C._cleanedFiles) C._cleanedFiles.add(file);

        var promise = (async function () {
            var cleaned;
            if (C.isOoxmlFile(file)) {
                cleaned = await C.redactOoxmlFile(file);
            } else if (C.isPdfFile(file)) {
                cleaned = await C.redactPdfFile(file);
            } else if (C.isTextFile(file)) {
                cleaned = await C.redactTextFile(file);
            } else {
                cleaned = file;
            }
            cleanedFiles.add(cleaned);
            if (C._cleanedFiles) C._cleanedFiles.add(cleaned);

            return cleaned;
        })();

        fileCleanCache.set(file, promise);
        return promise;
    }

    // =====================================================================
    // Blob prototype overrides — intercept all ways Claude can read files
    // =====================================================================

    // --- Override Blob.prototype.arrayBuffer ---
    Blob.prototype.arrayBuffer = async function () {
        if (isCleanableFile(this)) {
            var cleaned = await getCleanedFile(this);
            return C._origBlobArrayBuffer.call(cleaned);
        }
        return C._origBlobArrayBuffer.call(this);
    };

    // --- Override Blob.prototype.text ---
    Blob.prototype.text = async function () {
        if (isCleanableFile(this)) {
            var cleaned = await getCleanedFile(this);
            return C._origBlobText.call(cleaned);
        }
        return C._origBlobText.call(this);
    };

    // --- Override Blob.prototype.bytes ---
    if (Blob.prototype.bytes) {
        var _origBlobBytes = Blob.prototype.bytes;
        Blob.prototype.bytes = async function () {
            if (isCleanableFile(this)) {
                var cleaned = await getCleanedFile(this);
                return _origBlobBytes.call(cleaned);
            }
            return _origBlobBytes.call(this);
        };
    }

    // --- Override Blob.prototype.stream ---
    Blob.prototype.stream = function () {
        var self = this;
        if (isCleanableFile(self)) {
            return new ReadableStream({
                async start(controller) {
                    try {
                        var cleaned = await getCleanedFile(self);
                        var buf = await C._origBlobArrayBuffer.call(cleaned);
                        controller.enqueue(new Uint8Array(buf));
                        controller.close();
                    } catch (e) {
                        var buf2 = await C._origBlobArrayBuffer.call(self);
                        controller.enqueue(new Uint8Array(buf2));
                        controller.close();
                    }
                }
            });
        }
        return C._origBlobStream.call(self);
    };

    // --- Track sliced blobs to their parent files ---
    var sliceParent = new WeakMap();

    Blob.prototype.slice = function () {
        var sliced = C._origBlobSlice.apply(this, arguments);
        if (this instanceof File && isCleanableFile(this)) {
            sliceParent.set(sliced, this);
        }
        return sliced;
    };

    // --- Override FileReader methods ---
    function overrideFileReaderMethod(methodName, origMethod) {
        FileReader.prototype[methodName] = function (blob) {
            var reader = this;
            var target = (blob instanceof File && isCleanableFile(blob)) ? blob : sliceParent.get(blob);

            if (target && isCleanableFile(target)) {
                getCleanedFile(target).then(function (cleaned) {
                    origMethod.call(reader, cleaned);
                }).catch(function () {
                    origMethod.call(reader, blob);
                });
                return;
            }
            return origMethod.call(reader, blob);
        };
    }

    overrideFileReaderMethod('readAsArrayBuffer', C._origFRReadAsArrayBuffer);
    overrideFileReaderMethod('readAsText', C._origFRReadAsText);
    overrideFileReaderMethod('readAsDataURL', C._origFRReadAsDataURL);
    overrideFileReaderMethod('readAsBinaryString', C._origFRReadAsBinaryString);

    // =====================================================================
    // Fetch/XHR override — catch direct File uploads that bypass Blob reads
    // =====================================================================
    // Claude may upload Files directly as fetch/XHR bodies (especially PDFs)
    // without reading them through Blob/FileReader APIs first.  The generic
    // network-base.js interceptor handles init.body Files, but misses Request
    // objects with File bodies.  This override covers both paths.

    var _prevFetch = window.fetch;
    window.fetch = async function (input, init) {
        if (!C.enabled) return _prevFetch.apply(this, arguments);
        try {
            // init.body is a cleanable File
            if (init && init.body instanceof File && isCleanableFile(init.body)) {
                var cleaned = await getCleanedFile(init.body);
                // Build a safe headers object — always use Headers instance
                var safeHeaders = new Headers();
                if (init.headers) {
                    if (init.headers instanceof Headers) {
                        init.headers.forEach(function (v, k) { safeHeaders.set(k, v); });
                    } else if (Array.isArray(init.headers)) {
                        init.headers.forEach(function (pair) { safeHeaders.set(pair[0], pair[1]); });
                    } else if (typeof init.headers === 'object') {
                        Object.keys(init.headers).forEach(function (k) { safeHeaders.set(k, init.headers[k]); });
                    }
                }
                safeHeaders.delete('content-length');
                return C._origFetch.call(window, input, {
                    method: init.method,
                    headers: safeHeaders,
                    body: cleaned,
                    credentials: init.credentials,
                    redirect: init.redirect,
                    signal: init.signal,
                    mode: init.mode
                });
            }
            // Request object with a body — try to extract and clean
            if (input instanceof Request && !init) {
                var ct = input.headers.get('content-type') || '';
                if (ct === 'application/pdf' || ct === 'application/octet-stream') {
                    try {
                        var blob = await input.blob();
                        if (blob.size > 0) {
                            var buf = await C._origBlobArrayBuffer.call(blob);
                            var magic = C.detectDocMagic(buf);
                            if (magic === 'pdf') {
                                var pdfFile = new File([buf], 'document.pdf', { type: 'application/pdf' });
                                var cleanedPdf = await C.redactPdfFile(pdfFile);
                                var cleanedBuf = await C._origBlobArrayBuffer.call(cleanedPdf);
                                var newHeaders = new Headers(input.headers);
                                newHeaders.delete('content-length');
                                return C._origFetch.call(window, input.url, {
                                    method: input.method,
                                    headers: newHeaders,
                                    body: cleanedBuf,
                                    credentials: input.credentials,
                                    redirect: input.redirect,
                                    signal: input.signal,
                                    mode: input.mode
                                });
                            }
                        }
                    } catch (_) { /* fall through */ }
                }
            }
        } catch (e) {
            console.warn('[Cloaker][Claude] Fetch intercept error:', e);
        }
        return _prevFetch.apply(this, arguments);
    };

    var _prevXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
        var xhr = this;
        if (!C.enabled) return _prevXHRSend.call(xhr, body);
        if (body instanceof File && isCleanableFile(body)) {
            getCleanedFile(body).then(function (cleaned) {
                _prevXHRSend.call(xhr, cleaned);
            }).catch(function () {
                _prevXHRSend.call(xhr, body);
            });
            return;
        }
        return _prevXHRSend.call(xhr, body);
    };

})();
