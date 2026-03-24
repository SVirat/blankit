// src/core/doc-handlers.js — OOXML and text file parsers
// Provides document redaction handlers and notification helpers.
(function () {
    'use strict';

    var C = window.__cloaker;

    // =========================================================================
    // Constants
    // =========================================================================

    var TEXT_EXTENSIONS = /\.(txt|csv|tsv|json|xml|md|log|html|htm|yaml|yml|ini|cfg|conf|rtf)$/i;
    var TEXT_MIMES     = /^(text\/|application\/json|application\/xml|application\/csv)/i;
    var OOXML_MIMES    = /officedocument/i;
    var OOXML_EXTENSIONS = /\.(docx|xlsx|pptx)$/i;
    var PDF_EXTENSIONS  = /\.pdf$/i;
    var MAX_TEXT_SIZE   = 10 * 1024 * 1024;  // 10 MB
    var MAX_OOXML_SIZE  = 50 * 1024 * 1024;  // 50 MB
    var MAX_PDF_SIZE    = 50 * 1024 * 1024;  // 50 MB

    // Shared marker: files already cleaned by platform interceptors.
    // Platform interceptors add files here; network-base.js checks before re-processing.
    C._cleanedFiles = new WeakSet();

    // =========================================================================
    // Save original Blob/FileReader methods (before any platform overrides)
    // =========================================================================

    C._origBlobArrayBuffer   = Blob.prototype.arrayBuffer;
    C._origBlobText          = Blob.prototype.text;
    C._origBlobStream        = Blob.prototype.stream;
    C._origBlobSlice         = Blob.prototype.slice;
    C._origFRReadAsArrayBuffer  = FileReader.prototype.readAsArrayBuffer;
    C._origFRReadAsText         = FileReader.prototype.readAsText;
    C._origFRReadAsDataURL      = FileReader.prototype.readAsDataURL;
    C._origFRReadAsBinaryString = FileReader.prototype.readAsBinaryString;
    C._origXHROpen                = XMLHttpRequest.prototype.open;
    C._origXHRSend               = XMLHttpRequest.prototype.send;
    C._origFetch                 = window.fetch;

    // =========================================================================
    // Helpers
    // =========================================================================

    function escapeXml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * redactFilename(name) — Redact PII in a filename while preserving the extension.
     * e.g. "John_Doe_SSN_Report.docx" → "[NAME_1]_SSN_Report.docx"
     */
    C.redactFilename = function (name) {
        if (!name || !C.enabled) return name;
        var dotIdx = name.lastIndexOf('.');
        var base = dotIdx > 0 ? name.substring(0, dotIdx) : name;
        var ext  = dotIdx > 0 ? name.substring(dotIdx) : '';
        // Convert underscores to spaces so word-boundary patterns fire
        var spaced = base.replace(/_/g, ' ');
        var r = C.redactString(spaced);
        if (r.items.length === 0) return name; // nothing found, keep original
        return r.result.replace(/ /g, '_') + ext;
    };

    C.isTextFile = function (file) {
        if (file.name && TEXT_EXTENSIONS.test(file.name)) return true;
        if (file.type && TEXT_MIMES.test(file.type)) return true;
        return false;
    };

    C.isOoxmlFile = function (file) {
        if (file.name && OOXML_EXTENSIONS.test(file.name)) return true;
        if (file.type && OOXML_MIMES.test(file.type)) return true;
        return false;
    };

    C.isPdfFile = function (file) {
        if (file.name && PDF_EXTENSIONS.test(file.name)) return true;
        if (file.type === 'application/pdf') return true;
        return false;
    };

    C.detectDocMagic = function (buf) {
        if (buf.byteLength < 5) return null;
        var bytes = new Uint8Array(buf.slice(0, 5));
        if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
            return 'ooxml';
        }
        if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2D) {
            return 'pdf';
        }
        return null;
    };

    // =========================================================================
    // Notification helpers
    // =========================================================================

    C.notifyRedaction = function (count, items, fileInfo) {
        var msg = {
            type: 'CLOAKER_NETWORK_REDACTION',
            count: count,
            items: items,
            map: Object.assign({}, C.redactionMap)
        };
        if (fileInfo) {
            msg.fileName = fileInfo.name;
            msg.fileType = fileInfo.type;
            msg.fileData = fileInfo.data;
        }
        window.postMessage(msg, '*');
    };

    C.notifyInputRedaction = function (count, items) {
        window.postMessage({
            type: 'CLOAKER_INPUT_REDACTION',
            count: count,
            items: items,
            map: Object.assign({}, C.redactionMap)
        }, '*');
    };

    // =========================================================================
    // redactOoxmlFile(file) — DOCX / XLSX / PPTX redaction via JSZip
    // =========================================================================

    C.redactOoxmlFile = async function (file) {
        try {
            if (file.size > MAX_OOXML_SIZE) return file;

            var buf = await C._origBlobArrayBuffer.call(file);
            var zip = await JSZip.loadAsync(buf);
            var anyRedacted = false;
            var allItems = [];

            // Word documents (word/*.xml) — in-place <w:t> redaction preserving formatting
            for (var path of Object.keys(zip.files)) {
                if (!/^word\/.*\.xml$/i.test(path)) continue;
                var xml = await zip.files[path].async('string');
                var fileModified = false;

                // Process each <w:p> paragraph in-place, keeping all XML structure intact
                var newXml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, function (paraXml) {
                    // Collect text from all <w:t> elements AND inline whitespace
                    // elements (<w:br/>, <w:tab/>, <w:cr/>) in this paragraph.
                    // Without this, names split across runs by these elements
                    // (e.g. "John<w:br/>Smith") get concatenated without spaces
                    // and the name regex fails to match.
                    var tTexts = [];
                    var tScan = /<w:t[^>]*>([^<]*)<\/w:t>|<w:(?:br|tab|cr)\b[^>]*\/?>/g;
                    var m;
                    while ((m = tScan.exec(paraXml)) !== null) {
                        if (m[1] !== undefined) {
                            tTexts.push(m[1]);
                        } else {
                            tTexts.push(' ');
                        }
                    }
                    if (tTexts.length === 0) return paraXml; // no text runs, keep as-is

                    // Join all run texts to form the full paragraph text
                    var fullText = tTexts.join('');
                    // Decode XML entities for PII detection
                    var decoded = fullText
                        .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                        .replace(/&apos;/g, "'");
                    if (decoded.length < 3) return paraXml;

                    var r = C.redactString(decoded);
                    if (r.items.length === 0) return paraXml; // no PII found, keep as-is

                    fileModified = true;
                    anyRedacted = true;
                    allItems.push.apply(allItems, r.items);

                    // Replace <w:t> contents: put full redacted text in the first run,
                    // empty subsequent runs. This preserves all run/paragraph properties,
                    // images, drawings, and other non-text XML elements.
                    var tIndex = 0;
                    var redactedEsc = escapeXml(r.result);
                    return paraXml.replace(/<w:t[^>]*>[^<]*<\/w:t>/g, function () {
                        tIndex++;
                        if (tIndex === 1) {
                            return '<w:t xml:space="preserve">' + redactedEsc + '</w:t>';
                        }
                        return '<w:t></w:t>';
                    });
                });

                if (fileModified) {
                    zip.file(path, newXml);
                }
            }

            // Excel (xl/*.xml) and PowerPoint (ppt/slides/*.xml)
            for (var path2 of Object.keys(zip.files)) {
                if (!/^(xl\/|ppt\/slides\/).*\.xml$/i.test(path2)) continue;
                var xml2 = await zip.files[path2].async('string');
                var modified = false;
                var newXml2 = xml2.replace(/>([^<]+)</g, function (fullMatch, textContent) {
                    var r = C.redactString(textContent);
                    if (r.items.length > 0) {
                        modified = true;
                        anyRedacted = true;
                        allItems.push.apply(allItems, r.items);
                        return '>' + escapeXml(r.result) + '<';
                    }
                    return fullMatch;
                });
                if (modified) zip.file(path2, newXml2);
            }

            if (!anyRedacted) return file;

            var newBuf = await zip.generateAsync({ type: 'arraybuffer' });
            var cleanName = C.redactFilename(file.name);
            var newFile = new File([newBuf], cleanName, { type: file.type, lastModified: Date.now() });
            C.notifyRedaction(allItems.length, allItems, {
                name: cleanName, type: file.type, data: newBuf.slice(0)
            });
            return newFile;
        } catch (e) {
            console.warn('[Cloaker] OOXML redaction error:', e);
            return file;
        }
    };

    // =========================================================================
    // redactTextFile(file) — Plain text file redaction
    // =========================================================================

    C.redactTextFile = async function (file) {
        try {
            if (file.size > MAX_TEXT_SIZE) return file;

            var text = await C._origBlobText.call(file);
            var r = C.redactString(text);
            if (r.items.length === 0) return file;

            var fileType = file.type || 'text/plain';
            var cleanName = C.redactFilename(file.name);
            var newFile = new File([r.result], cleanName, { type: fileType, lastModified: Date.now() });
            C.notifyRedaction(r.items.length, r.items, {
                name: cleanName, type: fileType, data: new TextEncoder().encode(r.result).buffer
            });
            return newFile;
        } catch (e) {
            console.warn('[Cloaker] Text redaction error:', e);
            return file;
        }
    };

    // =========================================================================
    // redactPdfFile(file) — PDF text extraction and redaction
    // =========================================================================

    // Parse a PDF literal string starting at position i (the opening paren)
    function parsePdfLiteralString(content, start) {
        var i = start + 1;
        var depth = 1;
        var str = '';
        while (i < content.length && depth > 0) {
            var c = content[i];
            if (c === '\\' && i + 1 < content.length) {
                i++;
                var next = content[i];
                if (next === 'n') str += '\n';
                else if (next === 'r') str += '\r';
                else if (next === 't') str += '\t';
                else if (next === 'b') str += '\b';
                else if (next === 'f') str += '\f';
                else if (next === '(' || next === ')' || next === '\\') str += next;
                else if (next >= '0' && next <= '7') {
                    var oct = next;
                    if (i + 1 < content.length && content[i + 1] >= '0' && content[i + 1] <= '7') { i++; oct += content[i]; }
                    if (i + 1 < content.length && content[i + 1] >= '0' && content[i + 1] <= '7') { i++; oct += content[i]; }
                    str += String.fromCharCode(parseInt(oct, 8));
                }
            } else if (c === '(') {
                depth++;
                str += c;
            } else if (c === ')') {
                depth--;
                if (depth > 0) str += c;
            } else {
                str += c;
            }
            i++;
        }
        return { text: str, end: i };
    }

    // Parse a hex string <...> starting at position i.
    // If cmap is provided and hex length is a multiple of 4, try 2-byte CID decode.
    function parsePdfHexString(content, start, cmap) {
        var i = start + 1;
        var hex = '';
        while (i < content.length && content[i] !== '>') {
            var ch = content[i];
            if ((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) hex += ch;
            i++;
        }
        if (i < content.length) i++;
        if (hex.length % 2 !== 0) hex += '0';

        var str = '';

        // Strategy 1: Use ToUnicode CMap (best for subset fonts)
        if (cmap && hex.length >= 4 && hex.length % 4 === 0) {
            var cmapHit = false;
            var cmapStr = '';
            for (var h = 0; h < hex.length; h += 4) {
                var cid = parseInt(hex.substr(h, 4), 16);
                if (cmap[cid] !== undefined) {
                    cmapStr += cmap[cid];
                    cmapHit = true;
                } else if (cid >= 32 && cid < 127) {
                    cmapStr += String.fromCharCode(cid);
                } else if (cid === 9 || cid === 10 || cid === 13 || cid === 32) {
                    cmapStr += ' ';
                }
            }
            if (cmapHit && cmapStr.length > 0) return { text: cmapStr, end: i };
        }

        // Strategy 2: Try 2-byte big-endian Unicode (common for Identity-H fonts)
        if (hex.length >= 4 && hex.length % 4 === 0) {
            var uniStr = '';
            var validUni = true;
            for (var h2 = 0; h2 < hex.length; h2 += 4) {
                var cp = parseInt(hex.substr(h2, 4), 16);
                if (cp >= 32 && cp < 0xFFFE) {
                    uniStr += String.fromCharCode(cp);
                } else if (cp === 0 || cp === 9 || cp === 10 || cp === 13) {
                    // whitespace/null, skip
                } else {
                    validUni = false;
                    break;
                }
            }
            if (validUni && uniStr.length > 0) return { text: uniStr, end: i };
        }

        // Strategy 3: Fallback to 1-byte decoding
        for (var h3 = 0; h3 < hex.length; h3 += 2) {
            var code = parseInt(hex.substr(h3, 2), 16);
            if (code >= 32 && code < 127) str += String.fromCharCode(code);
        }
        return { text: str, end: i };
    }

    // Parse ToUnicode CMap data → mapping object { CID: unicodeChar }
    function parseToUnicodeCMap(cmapData) {
        var map = {};

        // beginbfchar ... endbfchar
        var bfcharRe = /beginbfchar([\s\S]*?)endbfchar/g;
        var m;
        while ((m = bfcharRe.exec(cmapData)) !== null) {
            var entryRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
            var em;
            while ((em = entryRe.exec(m[1])) !== null) {
                var srcCode = parseInt(em[1], 16);
                var dstHex = em[2];
                if (dstHex.length <= 4) {
                    map[srcCode] = String.fromCharCode(parseInt(dstHex, 16));
                } else {
                    var chars = '';
                    for (var ci = 0; ci < dstHex.length; ci += 4) {
                        chars += String.fromCharCode(parseInt(dstHex.substr(ci, 4), 16));
                    }
                    map[srcCode] = chars;
                }
            }
        }

        // beginbfrange ... endbfrange
        var bfrangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
        while ((m = bfrangeRe.exec(cmapData)) !== null) {
            var lines = m[1].trim().split(/\r?\n/);
            for (var li = 0; li < lines.length; li++) {
                var line = lines[li].trim();
                if (!line) continue;
                // <srcLow> <srcHigh> <dstStart>
                var rm = line.match(/^<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
                if (rm) {
                    var low = parseInt(rm[1], 16);
                    var high = parseInt(rm[2], 16);
                    var dst = parseInt(rm[3], 16);
                    for (var k = low; k <= high && k - low < 10000; k++) {
                        map[k] = String.fromCharCode(dst + (k - low));
                    }
                    continue;
                }
                // <srcLow> <srcHigh> [<dst1> <dst2> ...]
                var am = line.match(/^<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/);
                if (am) {
                    var low2 = parseInt(am[1], 16);
                    var dsts = am[3].match(/<([0-9A-Fa-f]+)>/g);
                    if (dsts) {
                        for (var di = 0; di < dsts.length; di++) {
                            var dv = parseInt(dsts[di].replace(/[<>]/g, ''), 16);
                            map[low2 + di] = String.fromCharCode(dv);
                        }
                    }
                }
            }
        }

        return map;
    }

    // Extract text from a decompressed PDF content stream using BT/ET operators
    function extractTextFromPdfStream(content, cmap) {
        var result = '';
        var i = 0;
        var len = content.length;
        var inBT = false;
        var hadTextInBT = false;

        while (i < len) {
            if (content[i] === 'B' && i + 1 < len && content[i + 1] === 'T' &&
                (i === 0 || content[i - 1] <= ' ') &&
                (i + 2 >= len || content[i + 2] <= ' ' || content[i + 2] === '/' || content[i + 2] === '[' || content[i + 2] === '(')) {
                inBT = true;
                hadTextInBT = false;
                i += 2;
                continue;
            }
            if (content[i] === 'E' && i + 1 < len && content[i + 1] === 'T' &&
                (i === 0 || content[i - 1] <= ' ') &&
                (i + 2 >= len || content[i + 2] <= ' ')) {
                inBT = false;
                // Space between BT/ET blocks instead of newline — prevents
                // every word becoming its own line when each word has its own block.
                if (result.length > 0 && result[result.length - 1] !== ' ' && result[result.length - 1] !== '\n') {
                    result += ' ';
                }
                i += 2;
                continue;
            }
            if (!inBT) { i++; continue; }

            // T* — explicit move-to-next-line operator
            if (content[i] === 'T' && i + 1 < len && content[i + 1] === '*' &&
                (i === 0 || content[i - 1] <= ' ') &&
                (i + 2 >= len || content[i + 2] <= ' ')) {
                if (hadTextInBT) result += '\n';
                i += 2;
                continue;
            }

            // Td / TD — text position change; treat non-zero y as a line break,
            // significant horizontal-only displacement as a word space
            if (content[i] === 'T' && i + 1 < len && (content[i + 1] === 'd' || content[i + 1] === 'D') &&
                (i === 0 || content[i - 1] <= ' ') &&
                (i + 2 >= len || content[i + 2] <= ' ')) {
                if (hadTextInBT) {
                    var j = i - 1;
                    while (j >= 0 && content[j] === ' ') j--;
                    var nEnd = j + 1;
                    while (j >= 0 && content[j] !== ' ' && content[j] !== '\n' && content[j] !== '\r') j--;
                    var yVal = parseFloat(content.substring(j + 1, nEnd));
                    if (!isNaN(yVal) && yVal !== 0) {
                        result += '\n';
                    } else if (result.length > 0 && result[result.length - 1] !== ' ' && result[result.length - 1] !== '\n') {
                        // y is 0 — parse x displacement for word spacing
                        var j2 = j;
                        while (j2 >= 0 && content[j2] === ' ') j2--;
                        var xEnd = j2 + 1;
                        while (j2 >= 0 && content[j2] !== ' ' && content[j2] !== '\n' && content[j2] !== '\r') j2--;
                        var xVal = parseFloat(content.substring(j2 + 1, xEnd));
                        if (!isNaN(xVal) && Math.abs(xVal) > 2) {
                            result += ' ';
                        }
                    }
                }
                i += 2;
                continue;
            }

            // ' operator — move to next line and show string
            if (content[i] === '\'' &&
                (i === 0 || content[i - 1] <= ' ' || content[i - 1] === ')' || content[i - 1] === '>') &&
                (i + 1 >= len || content[i + 1] <= ' ' || content[i + 1] === '(' || content[i + 1] === '<')) {
                if (hadTextInBT) result += '\n';
                i++;
                continue;
            }

            // TJ array: [(string) kern (string) ...] TJ — handle kern spacing
            if (content[i] === '[') {
                i++;
                while (i < len && content[i] !== ']') {
                    if (content[i] <= ' ') { i++; continue; }
                    if (content[i] === '(') {
                        var ls = parsePdfLiteralString(content, i);
                        result += ls.text;
                        hadTextInBT = true;
                        i = ls.end;
                    } else if (content[i] === '<' && i + 1 < len && content[i + 1] !== '<') {
                        var hs = parsePdfHexString(content, i, cmap);
                        result += hs.text;
                        hadTextInBT = true;
                        i = hs.end;
                    } else {
                        var ns = i;
                        while (i < len && content[i] !== ']' && content[i] !== '(' && content[i] !== '<' && content[i] > ' ') i++;
                        var kern = parseFloat(content.substring(ns, i));
                        // Large negative kern (> 100 units) typically indicates a word space
                        if (!isNaN(kern) && kern <= -100 && result.length > 0 && result[result.length - 1] !== ' ') {
                            result += ' ';
                        }
                    }
                }
                if (i < len) i++;
                continue;
            }

            if (content[i] === '(') {
                var ls = parsePdfLiteralString(content, i);
                result += ls.text;
                hadTextInBT = true;
                i = ls.end;
                continue;
            }
            if (content[i] === '<' && i + 1 < len && content[i + 1] !== '<') {
                var hs = parsePdfHexString(content, i, cmap);
                result += hs.text;
                hadTextInBT = true;
                i = hs.end;
                continue;
            }
            i++;
        }
        return result;
    }

    // Fallback: extract runs of printable ASCII from arbitrary content
    function extractPrintableRuns(content) {
        var runs = [];
        var current = '';
        for (var i = 0; i < content.length; i++) {
            var code = content.charCodeAt(i);
            if (code >= 32 && code < 127) {
                current += content[i];
            } else {
                if (current.length >= 4) runs.push(current);
                current = '';
            }
        }
        if (current.length >= 4) runs.push(current);
        return runs.join(' ');
    }

    // Decompress zlib/deflate data using DecompressionStream API
    async function inflatePdfStream(data) {
        var formats = ['deflate', 'deflate-raw', 'gzip'];
        for (var f = 0; f < formats.length; f++) {
            try {
                var ds = new DecompressionStream(formats[f]);
                var writer = ds.writable.getWriter();
                var reader = ds.readable.getReader();
                writer.write(data);
                writer.close();

                var chunks = [];
                var totalLen = 0;
                while (true) {
                    var rv = await reader.read();
                    if (rv.done) break;
                    chunks.push(rv.value);
                    totalLen += rv.value.length;
                }
                var out = new Uint8Array(totalLen);
                var off = 0;
                for (var k = 0; k < chunks.length; k++) {
                    out.set(chunks[k], off);
                    off += chunks[k].length;
                }
                return new TextDecoder('latin1').decode(out);
            } catch (_) { /* try next format */ }
        }
        throw new Error('inflate failed');
    }

    // Build a minimal valid PDF containing the given text
    function buildSimplePdf(text) {
        var fontSize = 10;
        var leading = 14;
        var pageW = 612;
        var pageH = 792;
        var marginX = 72;
        var marginY = 72;
        var maxLines = Math.floor((pageH - 2 * marginY) / leading);
        var maxChars = 90;

        function escapePdfStr(s) {
            return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        }

        var rawLines = text.split('\n');
        var allLines = [];
        for (var i = 0; i < rawLines.length; i++) {
            var line = rawLines[i];
            while (line.length > maxChars) {
                var brk = line.lastIndexOf(' ', maxChars);
                if (brk <= 0) brk = maxChars;
                allLines.push(line.substring(0, brk));
                line = line.substring(brk).replace(/^\s+/, '');
            }
            allLines.push(line);
        }

        var pages = [];
        for (var j = 0; j < allLines.length; j += maxLines) {
            pages.push(allLines.slice(j, j + maxLines));
        }
        if (pages.length === 0) pages.push(['']);

        var numPages = pages.length;
        var objs = [];
        objs.push({ num: 1, data: '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj' });

        var kids = [];
        for (var p = 0; p < numPages; p++) kids.push((4 + p) + ' 0 R');
        objs.push({ num: 2, data: '2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + numPages + ' >>\nendobj' });
        objs.push({ num: 3, data: '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj' });

        for (var p2 = 0; p2 < numPages; p2++) {
            var csNum = 4 + numPages + p2;
            var stream = 'BT\n/F1 ' + fontSize + ' Tf\n' + marginX + ' ' + (pageH - marginY) + ' Td\n' + leading + ' TL\n';
            var pl = pages[p2];
            for (var l = 0; l < pl.length; l++) {
                stream += '(' + escapePdfStr(pl[l]) + ') \'\n';
            }
            stream += 'ET';
            objs.push({ num: 4 + p2, data: (4 + p2) + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] /Contents ' + csNum + ' 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj' });
            objs.push({ num: csNum, data: csNum + ' 0 obj\n<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream\nendobj' });
        }

        objs.sort(function (a, b) { return a.num - b.num; });
        var pdf = '%PDF-1.4\n';
        var offsets = {};
        for (var o = 0; o < objs.length; o++) {
            offsets[objs[o].num] = pdf.length;
            pdf += objs[o].data + '\n';
        }
        var totalObjs = 4 + 2 * numPages;
        var xrefOff = pdf.length;
        pdf += 'xref\n0 ' + (totalObjs + 1) + '\n';
        pdf += '0000000000 65535 f \r\n';
        for (var n = 1; n <= totalObjs; n++) {
            var off2 = offsets[n] || 0;
            pdf += String(off2).padStart(10, '0') + ' 00000 n \r\n';
        }
        pdf += 'trailer\n<< /Size ' + (totalObjs + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOff + '\n%%EOF';
        return new TextEncoder().encode(pdf).buffer;
    }

    C.redactPdfFile = async function (file) {
        try {
            if (file.size > MAX_PDF_SIZE) return file;

            var buf = await C._origBlobArrayBuffer.call(file);
            var bytes = new Uint8Array(buf);

            // Fast latin1 decode (O(1) vs O(n²) char-by-char concatenation)
            var raw = new TextDecoder('latin1').decode(bytes);

            // -----------------------------------------------------------------
            // Phase 1: Find and decompress all streams
            // -----------------------------------------------------------------
            var allStreams = [];  // { content: string }
            var streamRe = /stream(\r\n|\r|\n)/g;
            var smatch;
            while ((smatch = streamRe.exec(raw)) !== null) {
                // Skip if this "stream" is part of "endstream"
                if (smatch.index >= 3 && raw.substring(smatch.index - 3, smatch.index) === 'end') continue;

                var streamStart = smatch.index + smatch[0].length;
                var endIdx = raw.indexOf('endstream', streamStart);
                if (endIdx === -1) continue;

                var streamBytes = bytes.slice(streamStart, endIdx);
                var preCtx = raw.substring(Math.max(0, smatch.index - 400), smatch.index);
                var isFlate = /\/FlateDecode/.test(preCtx);

                var decoded;
                if (isFlate) {
                    try {
                        decoded = await inflatePdfStream(streamBytes);
                    } catch (_) {
                        // Some streams have trailing whitespace; try trimming
                        var trimEnd = endIdx;
                        while (trimEnd > streamStart && bytes[trimEnd - 1] <= 0x20) trimEnd--;
                        if (trimEnd !== endIdx) {
                            try { decoded = await inflatePdfStream(bytes.slice(streamStart, trimEnd)); } catch (_2) { continue; }
                        } else {
                            continue;
                        }
                    }
                } else {
                    decoded = new TextDecoder('latin1').decode(streamBytes);
                }

                if (decoded && decoded.length > 0) {
                    allStreams.push(decoded);
                }
            }

            // -----------------------------------------------------------------
            // Phase 2: Parse ToUnicode CMaps from all streams
            // -----------------------------------------------------------------
            var combinedCMap = {};
            for (var ci = 0; ci < allStreams.length; ci++) {
                var sc = allStreams[ci];
                if (sc.indexOf('beginbfchar') !== -1 || sc.indexOf('beginbfrange') !== -1) {
                    var parsed = parseToUnicodeCMap(sc);
                    for (var ck in parsed) {
                        if (Object.prototype.hasOwnProperty.call(parsed, ck)) {
                            combinedCMap[ck] = parsed[ck];
                        }
                    }
                }
            }

            var hasCMap = Object.keys(combinedCMap).length > 0;

            // -----------------------------------------------------------------
            // Phase 3: Extract text using BT/ET operators + CMap
            // -----------------------------------------------------------------
            var texts = [];
            for (var si = 0; si < allStreams.length; si++) {
                var streamData = allStreams[si];
                // Skip CMap definition streams
                if (streamData.indexOf('begincmap') !== -1 && streamData.indexOf('endcmap') !== -1) continue;
                var streamText = extractTextFromPdfStream(streamData, hasCMap ? combinedCMap : null);
                if (streamText && streamText.trim().length > 0) {
                    texts.push(streamText.trim());
                }
            }

            // -----------------------------------------------------------------
            // Phase 4: Fallback — extract printable text runs from streams
            // -----------------------------------------------------------------
            if (texts.join('').trim().length < 5) {
                texts = [];
                for (var fi = 0; fi < allStreams.length; fi++) {
                    // Skip CMap streams
                    if (allStreams[fi].indexOf('begincmap') !== -1) continue;
                    var pr = extractPrintableRuns(allStreams[fi]);
                    if (pr.length > 10) texts.push(pr);
                }
            }

            // Phase 4b: Also try scanning uncompressed parts of the raw PDF
            if (texts.join('').trim().length < 5) {
                var rawPrintable = extractPrintableRuns(raw);
                if (rawPrintable.length > 10) texts.push(rawPrintable);
            }

            var fullText = texts.join('\n');
            if (!fullText || fullText.trim().length < 3) {
                return file;
            }

            var r = C.redactString(fullText);
            if (r.items.length === 0) {
                return file;
            }

            var newBuf = buildSimplePdf(r.result);
            var cleanName = C.redactFilename(file.name);
            var newFile = new File([newBuf], cleanName, { type: 'application/pdf', lastModified: Date.now() });
            C.notifyRedaction(r.items.length, r.items, {
                name: cleanName, type: 'application/pdf', data: new Uint8Array(newBuf).buffer
            });
            return newFile;
        } catch (e) {
            console.warn('[Cloaker] PDF redaction error:', e);
            return file;
        }
    };

    // =========================================================================
    // tryRedactBlob(blob) — Route to correct handler by format
    // =========================================================================

    C.tryRedactBlob = async function (blob) {
        if (!C.enabled) return blob;
        if (C._cleanedFiles && C._cleanedFiles.has(blob)) return blob;
        try {
            if (C.isOoxmlFile(blob)) return await C.redactOoxmlFile(blob);
            if (C.isPdfFile(blob)) return await C.redactPdfFile(blob);
            if (C.isTextFile(blob)) return await C.redactTextFile(blob);

            var buf = await C._origBlobArrayBuffer.call(blob);
            var fmt = C.detectDocMagic(buf);
            if (fmt === 'ooxml') {
                var file = new File([buf], blob.name || 'document.docx', { type: blob.type });
                return await C.redactOoxmlFile(file);
            }
            if (fmt === 'pdf') {
                var pdfFile = new File([buf], blob.name || 'document.pdf', { type: 'application/pdf' });
                return await C.redactPdfFile(pdfFile);
            }
            return blob;
        } catch (e) {
            console.warn('[Cloaker] Blob redaction error:', e);
            return blob;
        }
    };

    // =========================================================================
    // redactFormData(fd) — Iterate entries and redact
    // =========================================================================

    C.redactFormData = async function (fd) {
        if (!C.enabled) return fd;
        var newFd = new FormData();
        var allItems = [];

        for (var entry of fd.entries()) {
            var key = entry[0], value = entry[1];
            if (value instanceof File || value instanceof Blob) {
                var safeName = C.redactFilename(value.name);
                if (C.isOoxmlFile(value)) {
                    var cleaned = await C.redactOoxmlFile(value);
                    newFd.append(key, cleaned, safeName);
                } else if (C.isPdfFile(value)) {
                    var cleanedPdf = await C.redactPdfFile(value);
                    newFd.append(key, cleanedPdf, safeName);
                } else if (C.isTextFile(value)) {
                    var cleaned2 = await C.redactTextFile(value);
                    newFd.append(key, cleaned2, safeName);
                } else {
                    try {
                        var buf = await C._origBlobArrayBuffer.call(value);
                        var fmt = C.detectDocMagic(buf);
                        if (fmt === 'ooxml') {
                            var file = new File([buf], value.name || 'document.docx', { type: value.type });
                            var cleaned3 = await C.redactOoxmlFile(file);
                            newFd.append(key, cleaned3, safeName);
                        } else if (fmt === 'pdf') {
                            var pdfFile2 = new File([buf], value.name || 'document.pdf', { type: 'application/pdf' });
                            var cleaned4 = await C.redactPdfFile(pdfFile2);
                            newFd.append(key, cleaned4, safeName);
                        } else {
                            newFd.append(key, value, safeName);
                        }
                    } catch (e) {
                        newFd.append(key, value, safeName);
                    }
                }
            } else if (typeof value === 'string') {
                var r = C.redactString(value);
                allItems.push.apply(allItems, r.items);
                newFd.append(key, r.result);
            } else {
                newFd.append(key, value);
            }
        }

        if (allItems.length > 0) {
            C.notifyRedaction(allItems.length, allItems);
        }
        return newFd;
    };

})();
