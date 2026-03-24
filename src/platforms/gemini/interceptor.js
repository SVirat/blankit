// src/platforms/gemini/interceptor.js — Gemini DOM-level file upload interception
// Intercepts file selection via <input type="file"> change events and drag-and-drop,
// cleans documents before Gemini reads and uploads them.
//
// Drag-and-drop strategy:  Synthetic DragEvents are always isTrusted=false
// and Gemini/Angular silently rejects them.  Instead of re-dispatching we
// let the real trusted drop event reach Gemini unchanged, then intercept
// the outgoing XHR/fetch upload that carries the File body and swap in the
// redacted version before the bytes leave the browser.
(function () {
    'use strict';

    var host = window.location.hostname;
    if (host !== 'gemini.google.com') return;

    var C = window.__cloaker;
    var cleanableExtensions = /\.(docx|xlsx|pptx|txt|csv|tsv|json|xml|md|log|html|htm|yaml|yml|ini|cfg|conf|rtf|pdf)$/i;

    // Files that have already been cleaned (by the change-event path) are
    // tracked here so the Blob/FileReader patches skip them.
    var _cleanedFiles = new WeakSet();
    // Cache: original File → Promise<cleaned File>
    var _cleanCache   = new WeakMap();
    // Key-based dedup cache: handles different JS refs to the same file
    var _cleanCacheByKey = new Map();
    // D&D tracking: original file size (native) → File, for upload-session size fix
    var _origSizeToFile = new Map();
    // Map fileKey → redacted filename (for File.prototype.name override)
    var _redactedNames = new Map();

    // Save original File.prototype.name getter before we override it
    var _origNameDesc = Object.getOwnPropertyDescriptor(File.prototype, 'name');
    var _origNameGetter = _origNameDesc && _origNameDesc.get;

    function _origName(file) {
        return _origNameGetter ? _origNameGetter.call(file) : file.name;
    }

    function _fileKey(file) {
        return _origName(file) + '|' + file.size + '|' + file.lastModified;
    }

    // Override File.prototype.name to return redacted names for tracked D&D files
    Object.defineProperty(File.prototype, 'name', {
        get: function () {
            var name = _origNameGetter ? _origNameGetter.call(this) : '';
            var key = name + '|' + this.size + '|' + this.lastModified;
            return _redactedNames.get(key) || name;
        },
        configurable: true
    });

    function _markCleaned(file) {
        _cleanedFiles.add(file);
        if (C._cleanedFiles) C._cleanedFiles.add(file);
    }

    function isCleanable(file) {
        var name = _origName(file);
        return file && name &&
            (cleanableExtensions.test(name) || C.isOoxmlFile(file) || C.isTextFile(file) || C.isPdfFile(file));
    }

    async function cleanFile(file) {
        _markCleaned(file);
        var origN = _origName(file);
        var result;
        if (C.isOoxmlFile(file)) result = await C.redactOoxmlFile(file);
        else if (C.isPdfFile(file)) result = await C.redactPdfFile(file);
        else if (C.isTextFile(file)) result = await C.redactTextFile(file);
        else return file;
        if (result !== file) _markCleaned(result);
        // Store redacted name so File.prototype.name returns it
        var key = origN + '|' + file.size + '|' + file.lastModified;
        _redactedNames.set(key, _origName(result));
        return result;
    }

    // Return a (cached) promise for the cleaned version of a file.
    function getCleanedFile(file) {
        // Check by JS reference first
        if (_cleanCache.has(file)) {
            return _cleanCache.get(file);
        }
        // Check by key (handles different JS refs to same underlying file)
        var key = _fileKey(file);
        if (_cleanCacheByKey.has(key)) {
            var promise = _cleanCacheByKey.get(key);
            _cleanCache.set(file, promise);
            _markCleaned(file);
            return promise;
        }
        _markCleaned(file);
        var promise2 = cleanFile(file);
        _cleanCache.set(file, promise2);
        _cleanCacheByKey.set(key, promise2);
        return promise2;
    }

    // =====================================================================
    // File input change event interception (attach-button path — proven)
    // =====================================================================

    document.addEventListener('change', async function (e) {
        if (!C.enabled) return;
        if (e._cloakerBypass) return;

        var input = e.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
        if (!input.files || input.files.length === 0) return;

        var files = Array.from(input.files);
        if (!files.some(isCleanable)) return;

        e.stopImmediatePropagation();

        try {
            var dt = new DataTransfer();
            for (var i = 0; i < files.length; i++) {
                if (isCleanable(files[i])) {
                    _origSizeToFile.set(files[i].size, files[i]);
                    // Set redacted name synchronously for safety
                    var ck = _fileKey(files[i]);
                    _redactedNames.set(ck, C.redactFilename(_origName(files[i])));
                    dt.items.add(await cleanFile(files[i]));
                } else {
                    dt.items.add(files[i]);
                }
            }

            input.files = dt.files;

            var newEvt = new Event('change', { bubbles: true });
            newEvt._cloakerBypass = true;
            input.dispatchEvent(newEvt);
        } catch (err) {
            console.warn('[Cloaker][Gemini] File interception error:', err);
            var fallbackEvt = new Event('change', { bubbles: true });
            fallbackEvt._cloakerBypass = true;
            input.dispatchEvent(fallbackEvt);
        }
    }, true);

    // =====================================================================
    // Drop event — warm the cleaning cache so it's ready when XHR fires
    // =====================================================================
    // Synthetic DragEvents are always isTrusted=false and Gemini/Angular
    // silently rejects them.  Instead of re-dispatching, we let the real
    // trusted drop event reach Gemini unchanged, then intercept the outgoing
    // XHR/fetch upload that carries the File body and swap in the redacted
    // version before the bytes leave the browser.

    document.addEventListener('drop', function (e) {
        if (!C.enabled) return;
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        var files = Array.from(e.dataTransfer.files);
        for (var i = 0; i < files.length; i++) {
            if (isCleanable(files[i])) {
                _origSizeToFile.set(files[i].size, files[i]);
                // Synchronously set redacted name BEFORE Gemini reads file.name
                var dk = _fileKey(files[i]);
                _redactedNames.set(dk, C.redactFilename(_origName(files[i])));
                getCleanedFile(files[i]);
            }
        }
    }, true);

    // =====================================================================
    // setRequestHeader tracking — capture per-XHR headers for upload fix
    // =====================================================================
    var _nativeSetReqHeader = XMLHttpRequest.prototype.setRequestHeader;
    var _xhrHeaders = new WeakMap();  // xhr → Map(lowerName → {name, value})

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (!_xhrHeaders.has(this)) _xhrHeaders.set(this, new Map());
        _xhrHeaders.get(this).set(name.toLowerCase(), { name: name, value: value });
        return _nativeSetReqHeader.call(this, name, value);
    };

    // =====================================================================
    // Slice tracking — map sliced Blobs back to their source File
    // =====================================================================
    // Gemini may call file.slice() for chunked/resumable uploads.  The
    // resulting Blob is NOT a File, so the File-only checks below would
    // miss it.  We track every slice back to its origin cleanable File.

    var _blobSourceFile = new WeakMap();

    Blob.prototype.slice = function (start, end, contentType) {
        var result = C._origBlobSlice.apply(this, arguments);
        var sourceFile;
        // Track slices from cleanable Files (even if already marked in _cleanedFiles
        // by a different ref — the key-based cache will handle dedup)
        if (this instanceof File && isCleanable(this)) {
            sourceFile = this;
        } else {
            var parent = _blobSourceFile.get(this);
            if (parent) sourceFile = parent.file;
        }
        if (sourceFile) {
            _blobSourceFile.set(result, {
                file: sourceFile,
                start: start || 0,
                end: end !== undefined ? end : this.size
            });
        }
        return result;
    };

    // =====================================================================
    // XHR / Fetch override — swap cleanable files before upload
    // =====================================================================

    // Use the native XHR send / fetch saved before network-base.js patched
    // them.  Calling native functions directly avoids the network-base
    // middleware which reconstructs requests and can trigger CSP violations.
    var _prevXHRSend = XMLHttpRequest.prototype.send;
    var UPLOAD_URL_RE = /\.clients\d*\.google\.com\/upload|content-push\.googleapis\.com\/upload/;

    XMLHttpRequest.prototype.send = function (body) {
        var xhr = this;
        if (!C.enabled) return _prevXHRSend.call(xhr, body);

        var xhrUrl = xhr._cloakerUrl || xhr._url || '';

        // Case 0: Upload session creation — correct the declared file size
        // Gemini sends a String body with x-goog-upload-header-content-length
        // that declares the original (uncleaned) file size.  We delay this
        // request until cleaning completes, then re-open with corrected size.
        if (typeof body === 'string' && UPLOAD_URL_RE.test(xhrUrl) && !xhrUrl.includes('upload_id=')) {
            var hdrs = _xhrHeaders.get(xhr);
            if (hdrs && hdrs.has('x-goog-upload-header-content-length')) {
                var declaredSize = parseInt(hdrs.get('x-goog-upload-header-content-length').value, 10);
                var matchFile = _origSizeToFile.get(declaredSize);
                if (matchFile) {
                    getCleanedFile(matchFile).then(function (cleaned) {
                        var cleanedSize = cleaned.size;
                        var cleanedName = _origName(cleaned);
                        // Re-open resets headers; keeps event listeners
                        var openMethod = xhr._cloakerMethod || 'POST';
                        C._origXHROpen.call(xhr, openMethod, xhrUrl, true);
                        // Re-set all tracked headers with corrected content-length
                        // and redacted filename
                        hdrs.forEach(function (info, key) {
                            if (key === 'x-goog-upload-header-content-length') {
                                _nativeSetReqHeader.call(xhr, info.name, String(cleanedSize));
                            } else if (key === 'x-goog-upload-file-name') {
                                _nativeSetReqHeader.call(xhr, info.name,
                                    encodeURIComponent(cleanedName));
                            } else {
                                _nativeSetReqHeader.call(xhr, info.name, info.value);
                            }
                        });
                        // Also redact the filename inside the JSON body
                        var sendBody = body;
                        try {
                            var parsed = JSON.parse(body);
                            var origFileName = _origName(matchFile);
                            (function redactDisplayNames(obj) {
                                if (!obj || typeof obj !== 'object') return;
                                if (Array.isArray(obj)) { obj.forEach(redactDisplayNames); return; }
                                for (var k in obj) {
                                    if ((k === 'display_name' || k === 'displayName' || k === 'name') &&
                                        typeof obj[k] === 'string' && origFileName &&
                                        obj[k] === origFileName) {
                                        obj[k] = cleanedName;
                                    } else if (typeof obj[k] === 'object') {
                                        redactDisplayNames(obj[k]);
                                    }
                                }
                            })(parsed);
                            sendBody = JSON.stringify(parsed);
                        } catch (_) { /* not JSON — send as-is */ }
                        C._origXHRSend.call(xhr, sendBody);
                        _origSizeToFile.delete(declaredSize);
                    }).catch(function () {
                        _prevXHRSend.call(xhr, body);
                    });
                    return;
                }
            }
        }

        // Case 1: body is a cleanable File
        if (body instanceof File && isCleanable(body) && !_cleanCacheByKey.has(_fileKey(body))) {
            getCleanedFile(body).then(function (cleaned) {
                C._origXHRSend.call(xhr, cleaned);
            }).catch(function () {
                C._origXHRSend.call(xhr, body);
            });
            return;
        }

        // Case 2: body is a Blob sliced from a cleanable File
        if (body instanceof Blob && !(body instanceof File)) {
            var source = _blobSourceFile.get(body);
            if (source) {
                getCleanedFile(source.file).then(function (cleaned) {
                    // If slice covers the full original file, send the full cleaned file
                    if (source.start === 0 && source.end >= source.file.size) {
                        C._origXHRSend.call(xhr, cleaned);
                    } else {
                        var s = source.start || 0;
                        var e = source.end !== undefined ? Math.min(source.end, cleaned.size) : cleaned.size;
                        var newSlice = C._origBlobSlice.call(cleaned, s, e);
                        C._origXHRSend.call(xhr, newSlice);
                    }
                }).catch(function () {
                    C._origXHRSend.call(xhr, body);
                });
                return;
            }
        }

        return _prevXHRSend.call(xhr, body);
    };

    var _prevFetch = window.fetch;
    window.fetch = async function (input, init) {
        if (!C.enabled || !init || !init.body) return _prevFetch.apply(this, arguments);

        // Case 1: body is a cleanable File
        if (init.body instanceof File && isCleanable(init.body) && !_cleanCacheByKey.has(_fileKey(init.body))) {
            try {
                var cleaned = await getCleanedFile(init.body);
                var newInit = Object.assign({}, init, { body: cleaned });
                return C._origFetch.call(window, input, newInit);
            } catch (_) { /* fall through */ }
        }

        // Case 2: body is a Blob sliced from a cleanable File
        if (init.body instanceof Blob && !(init.body instanceof File)) {
            var source = _blobSourceFile.get(init.body);
            if (source) {
                try {
                    var cleaned2 = await getCleanedFile(source.file);
                    // If slice covers the full original file, send the full cleaned file
                    if (source.start === 0 && source.end >= source.file.size) {
                        var newInit2 = Object.assign({}, init, { body: cleaned2 });
                        return C._origFetch.call(window, input, newInit2);
                    }
                    var s = source.start || 0;
                    var e = source.end !== undefined ? Math.min(source.end, cleaned2.size) : cleaned2.size;
                    var newSlice = C._origBlobSlice.call(cleaned2, s, e);
                    var newInit3 = Object.assign({}, init, { body: newSlice });
                    return C._origFetch.call(window, input, newInit3);
                } catch (_) { /* fall through */ }
            }
        }

        return _prevFetch.apply(this, arguments);
    };

    // =====================================================================
    // Blob / FileReader interception (safety net for JS-level file reads)
    // =====================================================================

    // Helper: resolve the source cleanable File for a blob (or itself)
    function _resolveSource(blob) {
        if (blob instanceof File && isCleanable(blob) && !_cleanCacheByKey.has(_fileKey(blob))) {
            return { file: blob, slice: false };
        }
        var src = _blobSourceFile.get(blob);
        if (src) return { file: src.file, slice: true, start: src.start, end: src.end };
        return null;
    }

    Blob.prototype.arrayBuffer = async function () {
        if (C.enabled) {
            var src = _resolveSource(this);
            if (src) {
                try {
                    var cleaned = await getCleanedFile(src.file);
                    if (src.slice) {
                        var s = src.start || 0;
                        var e = src.end !== undefined ? Math.min(src.end, cleaned.size) : cleaned.size;
                        return C._origBlobArrayBuffer.call(C._origBlobSlice.call(cleaned, s, e));
                    }
                    return C._origBlobArrayBuffer.call(cleaned);
                } catch (_) { /* fall through */ }
            }
        }
        return C._origBlobArrayBuffer.call(this);
    };

    Blob.prototype.text = async function () {
        if (C.enabled) {
            var src = _resolveSource(this);
            if (src) {
                try {
                    var cleaned = await getCleanedFile(src.file);
                    if (src.slice) {
                        var s = src.start || 0;
                        var e = src.end !== undefined ? Math.min(src.end, cleaned.size) : cleaned.size;
                        return C._origBlobText.call(C._origBlobSlice.call(cleaned, s, e));
                    }
                    return C._origBlobText.call(cleaned);
                } catch (_) { /* fall through */ }
            }
        }
        return C._origBlobText.call(this);
    };

    if (Blob.prototype.bytes) {
        var _origBlobBytes = Blob.prototype.bytes;
        Blob.prototype.bytes = async function () {
            if (C.enabled) {
                var src = _resolveSource(this);
                if (src) {
                    try {
                        var cleaned = await getCleanedFile(src.file);
                        if (src.slice) {
                            var s = src.start || 0;
                            var e = src.end !== undefined ? Math.min(src.end, cleaned.size) : cleaned.size;
                            return _origBlobBytes.call(C._origBlobSlice.call(cleaned, s, e));
                        }
                        return _origBlobBytes.call(cleaned);
                    } catch (_) { /* fall through */ }
                }
            }
            return _origBlobBytes.call(this);
        };
    }

    Blob.prototype.stream = function () {
        if (C.enabled) {
            var src = _resolveSource(this);
            if (src) {
                var srcCopy = src;
                var innerReader;
                return new ReadableStream({
                    start: function (controller) {
                        getCleanedFile(srcCopy.file).then(function (cleaned) {
                            var target = cleaned;
                            if (srcCopy.slice) {
                                var s = srcCopy.start || 0;
                                var e = srcCopy.end !== undefined ? Math.min(srcCopy.end, cleaned.size) : cleaned.size;
                                target = C._origBlobSlice.call(cleaned, s, e);
                            }
                            var s2 = C._origBlobStream.call(target);
                            innerReader = s2.getReader();
                            function pump() {
                                innerReader.read().then(function (r) {
                                    if (r.done) { controller.close(); return; }
                                    controller.enqueue(r.value);
                                    pump();
                                }).catch(function (err) { controller.error(err); });
                            }
                            pump();
                        }).catch(function (err) { controller.error(err); });
                    },
                    cancel: function () { if (innerReader) innerReader.cancel(); }
                });
            }
        }
        return C._origBlobStream.call(this);
    };

    function _wrapFR(origMethod) {
        return function (blob) {
            if (C.enabled && blob instanceof Blob) {
                var src = _resolveSource(blob);
                if (src) {
                    var reader = this;
                    getCleanedFile(src.file).then(function (cleaned) {
                        var target = cleaned;
                        if (src.slice) {
                            var s = src.start || 0;
                            var e = src.end !== undefined ? Math.min(src.end, cleaned.size) : cleaned.size;
                            target = C._origBlobSlice.call(cleaned, s, e);
                        }
                        origMethod.call(reader, target);
                    }).catch(function () {
                        origMethod.call(reader, blob);
                    });
                    return;
                }
            }
            return origMethod.apply(this, arguments);
        };
    }

    FileReader.prototype.readAsArrayBuffer  = _wrapFR(C._origFRReadAsArrayBuffer);
    FileReader.prototype.readAsText         = _wrapFR(C._origFRReadAsText);
    FileReader.prototype.readAsDataURL      = _wrapFR(C._origFRReadAsDataURL);
    FileReader.prototype.readAsBinaryString = _wrapFR(C._origFRReadAsBinaryString);

})();
