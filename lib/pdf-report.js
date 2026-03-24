/**
 * Blankit PDF Audit Report Generator
 * Generates a beautifully formatted PDF report from audit log data.
 * Pure JS — no external dependencies. Builds raw PDF binary.
 */

var BlankitPDF = (function () {
    'use strict';

    /* ======================================================================
       Low-level PDF writer
       ====================================================================== */

    function PDFWriter() {
        this.objects = [];
        this.pages = [];
        this.fontId = null;
        this.fontBoldId = null;
    }

    PDFWriter.prototype.addObject = function (content) {
        var id = this.objects.length + 1;
        this.objects.push({ id: id, content: content });
        return id;
    };

    PDFWriter.prototype.ref = function (id) {
        return id + ' 0 R';
    };

    PDFWriter.prototype.build = function () {
        var offsets = [];
        var out = '%PDF-1.4\n';

        for (var i = 0; i < this.objects.length; i++) {
            offsets.push(out.length);
            out += this.objects[i].id + ' 0 obj\n' + this.objects[i].content + '\nendobj\n';
        }

        var xrefOffset = out.length;
        out += 'xref\n0 ' + (this.objects.length + 1) + '\n';
        out += '0000000000 65535 f \n';
        for (var j = 0; j < offsets.length; j++) {
            out += padLeft(offsets[j], 10) + ' 00000 n \n';
        }
        out += 'trailer\n<< /Size ' + (this.objects.length + 1) + ' /Root ' + this.ref(1) + ' >>\n';
        out += 'startxref\n' + xrefOffset + '\n%%EOF';
        return out;
    };

    function padLeft(num, len) {
        var s = '' + num;
        while (s.length < len) s = '0' + s;
        return s;
    }

    function pdfString(str) {
        return '(' + str
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            + ')';
    }

    function pdfColor(hex) {
        var r = parseInt(hex.slice(1, 3), 16) / 255;
        var g = parseInt(hex.slice(3, 5), 16) / 255;
        var b = parseInt(hex.slice(5, 7), 16) / 255;
        return r.toFixed(3) + ' ' + g.toFixed(3) + ' ' + b.toFixed(3);
    }

    /* ======================================================================
       Report builder
       ====================================================================== */

    function generateReport(data) {
        var logs = data.logs || [];
        var totalRedacted = data.totalRedacted || 0;
        var extensionVersion = data.extensionVersion || '1.0.0';
        var installDate = data.installDate || null;
        var now = new Date();

        // ---- Aggregate stats from logs ----
        var categoryTotals = {};
        var platformTotals = {};
        var sourceTotals = {};
        var dailyMap = {};
        var totalItems = 0;

        for (var i = 0; i < logs.length; i++) {
            var log = logs[i];
            var count = log.itemCount || 1;
            totalItems += count;

            // Categories
            if (log.categories) {
                for (var c = 0; c < log.categories.length; c++) {
                    var cat = log.categories[c];
                    categoryTotals[cat] = (categoryTotals[cat] || 0) + 1;
                }
            }

            // Platform
            var plat = friendlyPlatform(log.platform);
            platformTotals[plat] = (platformTotals[plat] || 0) + count;

            // Source
            var src = log.source || 'unknown';
            sourceTotals[src] = (sourceTotals[src] || 0) + count;

            // Daily
            if (log.timestamp) {
                var day = log.timestamp.slice(0, 10);
                dailyMap[day] = (dailyMap[day] || 0) + count;
            }
        }

        // Sort categories descending
        var catEntries = objectEntries(categoryTotals).sort(function (a, b) { return b[1] - a[1]; });
        var platEntries = objectEntries(platformTotals).sort(function (a, b) { return b[1] - a[1]; });
        var srcEntries = objectEntries(sourceTotals).sort(function (a, b) { return b[1] - a[1]; });

        var platformCount = platEntries.length;
        var useTotal = totalRedacted > totalItems ? totalRedacted : totalItems;

        // ---- Build summary sentence ----
        var topCats = catEntries.slice(0, 4);
        var catParts = [];
        for (var t = 0; t < topCats.length; t++) {
            catParts.push(topCats[t][1] + ' ' + topCats[t][0]);
        }
        var summaryLine = 'Since install, Blankit prevented ' + useTotal + '+ instances of PII leak';
        if (catParts.length > 0) {
            summaryLine += ' (' + catParts.join(', ') + ')';
        }
        summaryLine += ' across ' + platformCount + ' platform' + (platformCount !== 1 ? 's' : '') + '.';

        // ---- Build PDF ----
        var pdf = new PDFWriter();
        var W = 595.28; // A4 width in points
        var H = 841.89; // A4 height in points
        var margin = 50;

        // Catalog
        pdf.addObject('<< /Type /Catalog /Pages ' + pdf.ref(2) + ' >>'); // obj 1

        // Pages (placeholder, we'll update content later)
        pdf.addObject(''); // obj 2 — filled after page creation

        // Fonts
        var fontHelv = pdf.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        var fontBold = pdf.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

        // ---- Render page content ----
        var stream = '';
        var y = H - margin;

        // Background
        stream += pdfColor('#0f0f14') + ' rg\n';
        stream += '0 0 ' + W + ' ' + H + ' re f\n';

        // Top accent bar
        stream += pdfColor('#7c3aed') + ' rg\n';
        stream += '0 ' + (H - 6) + ' ' + W + ' 6 re f\n';

        // Title
        y -= 30;
        stream += 'BT\n';
        stream += '/F2 22 Tf\n';
        stream += pdfColor('#f4f4f5') + ' rg\n';
        stream += margin + ' ' + y + ' Td\n';
        stream += pdfString('Blankit PII Protection Report') + ' Tj\n';
        stream += 'ET\n';

        // Subtitle
        y -= 20;
        stream += 'BT\n';
        stream += '/F1 10 Tf\n';
        stream += pdfColor('#a1a1aa') + ' rg\n';
        stream += margin + ' ' + y + ' Td\n';
        stream += pdfString('Generated ' + formatDate(now) + ' at ' + formatTime(now)) + ' Tj\n';
        stream += 'ET\n';

        if (installDate) {
            y -= 14;
            stream += 'BT\n';
            stream += '/F1 9 Tf\n';
            stream += pdfColor('#71717a') + ' rg\n';
            stream += margin + ' ' + y + ' Td\n';
            stream += pdfString('Extension installed: ' + installDate) + ' Tj\n';
            stream += 'ET\n';
        }

        // Divider
        y -= 16;
        stream += pdfColor('#27272a') + ' rg\n';
        stream += margin + ' ' + y + ' ' + (W - margin * 2) + ' 1 re f\n';

        // ---- Executive Summary Card ----
        y -= 14;
        var cardTop = y;
        var cardH = 60;
        // Card background
        stream += pdfColor('#18181b') + ' rg\n';
        stream += margin + ' ' + (cardTop - cardH) + ' ' + (W - margin * 2) + ' ' + cardH + ' re f\n';
        // Left accent
        stream += pdfColor('#a78bfa') + ' rg\n';
        stream += margin + ' ' + (cardTop - cardH) + ' 4 ' + cardH + ' re f\n';

        y = cardTop - 18;
        stream += 'BT\n';
        stream += '/F2 11 Tf\n';
        stream += pdfColor('#e4e4e7') + ' rg\n';
        stream += (margin + 16) + ' ' + y + ' Td\n';
        stream += pdfString('EXECUTIVE SUMMARY') + ' Tj\n';
        stream += 'ET\n';

        y -= 16;
        // Wrap summary line
        var summaryLines = wrapText(summaryLine, 85);
        stream += '/F1 10 Tf\n';
        for (var sl = 0; sl < summaryLines.length; sl++) {
            stream += 'BT\n';
            stream += pdfColor('#a1a1aa') + ' rg\n';
            stream += '/F1 10 Tf\n';
            stream += (margin + 16) + ' ' + y + ' Td\n';
            stream += pdfString(summaryLines[sl]) + ' Tj\n';
            stream += 'ET\n';
            y -= 14;
        }

        y = cardTop - cardH - 24;

        // ---- Stats Row ----
        var statBoxW = (W - margin * 2 - 20) / 3;
        var stats = [
            { label: 'Total Protected', value: useTotal + '+', color: '#a78bfa' },
            { label: 'Platforms Secured', value: '' + platformCount, color: '#ec4899' },
            { label: 'Audit Events', value: '' + logs.length, color: '#f59e0b' }
        ];

        for (var s = 0; s < stats.length; s++) {
            var sx = margin + s * (statBoxW + 10);
            // Box
            stream += pdfColor('#18181b') + ' rg\n';
            stream += sx + ' ' + (y - 50) + ' ' + statBoxW + ' 50 re f\n';

            // Value
            stream += 'BT\n';
            stream += '/F2 20 Tf\n';
            stream += pdfColor(stats[s].color) + ' rg\n';
            stream += (sx + 14) + ' ' + (y - 22) + ' Td\n';
            stream += pdfString(stats[s].value) + ' Tj\n';
            stream += 'ET\n';

            // Label
            stream += 'BT\n';
            stream += '/F1 8 Tf\n';
            stream += pdfColor('#71717a') + ' rg\n';
            stream += (sx + 14) + ' ' + (y - 40) + ' Td\n';
            stream += pdfString(stats[s].label) + ' Tj\n';
            stream += 'ET\n';
        }

        y -= 74;

        // ---- PII Categories Breakdown ----
        stream += drawSectionHeader(margin, y, W, 'PII CATEGORIES DETECTED');
        y -= 30;

        if (catEntries.length === 0) {
            stream += drawMutedText(margin + 10, y, 'No redaction events recorded yet.');
            y -= 18;
        } else {
            var maxCat = catEntries[0][1];
            for (var ci = 0; ci < catEntries.length; ci++) {
                var cName = catEntries[ci][0];
                var cVal = catEntries[ci][1];
                var barMaxW = W - margin * 2 - 160;
                var barW = Math.max(8, (cVal / maxCat) * barMaxW);

                // Label
                stream += 'BT\n';
                stream += '/F1 9 Tf\n';
                stream += pdfColor('#e4e4e7') + ' rg\n';
                stream += margin + ' ' + y + ' Td\n';
                stream += pdfString(cName) + ' Tj\n';
                stream += 'ET\n';

                // Bar bg
                var barX = margin + 110;
                stream += pdfColor('#27272a') + ' rg\n';
                stream += barX + ' ' + (y - 1) + ' ' + barMaxW + ' 10 re f\n';

                // Bar fill
                stream += pdfColor('#a78bfa') + ' rg\n';
                stream += barX + ' ' + (y - 1) + ' ' + barW + ' 10 re f\n';

                // Count
                stream += 'BT\n';
                stream += '/F2 9 Tf\n';
                stream += pdfColor('#d4d4d8') + ' rg\n';
                stream += (barX + barMaxW + 8) + ' ' + y + ' Td\n';
                stream += pdfString('' + cVal) + ' Tj\n';
                stream += 'ET\n';

                y -= 18;
            }
        }

        y -= 10;

        // ---- Platform Breakdown ----
        stream += drawSectionHeader(margin, y, W, 'PLATFORM BREAKDOWN');
        y -= 30;

        for (var pi = 0; pi < platEntries.length; pi++) {
            var pName = platEntries[pi][0];
            var pVal = platEntries[pi][1];

            // Dot
            stream += pdfColor('#ec4899') + ' rg\n';
            var dotCx = margin + 4;
            var dotCy = y + 4;
            stream += drawCircle(dotCx, dotCy, 3);

            // Name
            stream += 'BT\n';
            stream += '/F1 9 Tf\n';
            stream += pdfColor('#e4e4e7') + ' rg\n';
            stream += (margin + 14) + ' ' + y + ' Td\n';
            stream += pdfString(pName) + ' Tj\n';
            stream += 'ET\n';

            // Value
            stream += 'BT\n';
            stream += '/F2 9 Tf\n';
            stream += pdfColor('#a78bfa') + ' rg\n';
            stream += (margin + 180) + ' ' + y + ' Td\n';
            stream += pdfString(pVal + ' items redacted') + ' Tj\n';
            stream += 'ET\n';

            y -= 18;
        }

        y -= 10;

        // ---- Source Breakdown ----
        stream += drawSectionHeader(margin, y, W, 'REDACTION SOURCE');
        y -= 30;

        for (var si = 0; si < srcEntries.length; si++) {
            var sName = friendlySource(srcEntries[si][0]);
            var sVal = srcEntries[si][1];

            stream += pdfColor('#f59e0b') + ' rg\n';
            stream += drawCircle(margin + 4, y + 4, 3);

            stream += 'BT\n';
            stream += '/F1 9 Tf\n';
            stream += pdfColor('#e4e4e7') + ' rg\n';
            stream += (margin + 14) + ' ' + y + ' Td\n';
            stream += pdfString(sName) + ' Tj\n';
            stream += 'ET\n';

            stream += 'BT\n';
            stream += '/F2 9 Tf\n';
            stream += pdfColor('#d4d4d8') + ' rg\n';
            stream += (margin + 180) + ' ' + y + ' Td\n';
            stream += pdfString(sVal + ' instances') + ' Tj\n';
            stream += 'ET\n';

            y -= 18;
        }

        y -= 10;

        // ---- Recent Activity (last 10 entries) ----
        if (logs.length > 0) {
            stream += drawSectionHeader(margin, y, W, 'RECENT ACTIVITY (LAST 10)');
            y -= 26;

            // Table header
            stream += pdfColor('#18181b') + ' rg\n';
            stream += margin + ' ' + (y - 2) + ' ' + (W - margin * 2) + ' 16 re f\n';
            stream += 'BT\n/F2 7.5 Tf\n';
            stream += pdfColor('#71717a') + ' rg\n';
            stream += (margin + 6) + ' ' + y + ' Td\n';
            stream += pdfString('TIMESTAMP') + ' Tj\n';
            stream += 'ET\n';
            stream += 'BT\n/F2 7.5 Tf\n';
            stream += pdfColor('#71717a') + ' rg\n';
            stream += (margin + 140) + ' ' + y + ' Td\n';
            stream += pdfString('PLATFORM') + ' Tj\n';
            stream += 'ET\n';
            stream += 'BT\n/F2 7.5 Tf\n';
            stream += pdfColor('#71717a') + ' rg\n';
            stream += (margin + 260) + ' ' + y + ' Td\n';
            stream += pdfString('SOURCE') + ' Tj\n';
            stream += 'ET\n';
            stream += 'BT\n/F2 7.5 Tf\n';
            stream += pdfColor('#71717a') + ' rg\n';
            stream += (margin + 370) + ' ' + y + ' Td\n';
            stream += pdfString('CATEGORIES') + ' Tj\n';
            stream += 'ET\n';

            y -= 18;

            var recentLogs = logs.slice(-10).reverse();
            for (var ri = 0; ri < recentLogs.length; ri++) {
                var rl = recentLogs[ri];
                // Alternating row bg
                if (ri % 2 === 0) {
                    stream += pdfColor('#131318') + ' rg\n';
                    stream += margin + ' ' + (y - 3) + ' ' + (W - margin * 2) + ' 15 re f\n';
                }

                stream += '/F1 7.5 Tf\n';

                // Timestamp
                stream += 'BT\n';
                stream += pdfColor('#a1a1aa') + ' rg\n';
                stream += '/F1 7.5 Tf\n';
                stream += (margin + 6) + ' ' + y + ' Td\n';
                stream += pdfString(formatTimestamp(rl.timestamp)) + ' Tj\n';
                stream += 'ET\n';

                // Platform
                stream += 'BT\n';
                stream += pdfColor('#e4e4e7') + ' rg\n';
                stream += '/F1 7.5 Tf\n';
                stream += (margin + 140) + ' ' + y + ' Td\n';
                stream += pdfString(friendlyPlatform(rl.platform)) + ' Tj\n';
                stream += 'ET\n';

                // Source
                stream += 'BT\n';
                stream += pdfColor('#d4d4d8') + ' rg\n';
                stream += '/F1 7.5 Tf\n';
                stream += (margin + 260) + ' ' + y + ' Td\n';
                stream += pdfString(friendlySource(rl.source)) + ' Tj\n';
                stream += 'ET\n';

                // Categories
                var cats = (rl.categories || []).join(', ');
                if (cats.length > 35) cats = cats.slice(0, 32) + '...';
                stream += 'BT\n';
                stream += pdfColor('#a78bfa') + ' rg\n';
                stream += '/F1 7.5 Tf\n';
                stream += (margin + 370) + ' ' + y + ' Td\n';
                stream += pdfString(cats) + ' Tj\n';
                stream += 'ET\n';

                y -= 15;
            }
        }

        // ---- Footer ----
        var footerY = 44;

        // Footer background bar
        stream += pdfColor('#18181b') + ' rg\n';
        stream += '0 0 ' + W + ' ' + (footerY + 22) + ' re f\n';

        // Footer top accent line
        stream += pdfColor('#a78bfa') + ' rg\n';
        stream += '0 ' + (footerY + 20) + ' ' + W + ' 1.5 re f\n';

        // "Protected by Blankit" badge
        stream += 'BT\n';
        stream += '/F2 9 Tf\n';
        stream += pdfColor('#a78bfa') + ' rg\n';
        stream += margin + ' ' + (footerY + 4) + ' Td\n';
        stream += pdfString('Protected by Blankit v' + extensionVersion) + ' Tj\n';
        stream += 'ET\n';

        // Download CTA — larger, bold, bright
        stream += 'BT\n';
        stream += '/F2 9 Tf\n';
        stream += pdfColor('#e4e4e7') + ' rg\n';
        stream += margin + ' ' + (footerY - 12) + ' Td\n';
        stream += pdfString('Get Blankit free:  https://blankit.privacy') + ' Tj\n';
        stream += 'ET\n';

        // Underline the URL to make it look clickable
        var urlX = margin + 108;
        var urlEndX = urlX + 144;
        stream += pdfColor('#a78bfa') + ' rg\n';
        stream += urlX + ' ' + (footerY - 14) + ' ' + (urlEndX - urlX) + ' 0.7 re f\n';

        // Local-only disclaimer
        stream += 'BT\n';
        stream += '/F1 7 Tf\n';
        stream += pdfColor('#52525b') + ' rg\n';
        stream += margin + ' ' + (footerY - 26) + ' Td\n';
        stream += pdfString('Local-only audit. No PII values are stored in this report.') + ' Tj\n';
        stream += 'ET\n';

        // Right-aligned report ID
        stream += 'BT\n';
        stream += '/F1 7 Tf\n';
        stream += pdfColor('#52525b') + ' rg\n';
        stream += (W - margin - 120) + ' ' + (footerY + 4) + ' Td\n';
        stream += pdfString('Report ID: ' + generateReportId()) + ' Tj\n';
        stream += 'ET\n';

        // ---- Assemble page ----
        var streamObj = pdf.addObject(
            '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'
        );

        var pageId = pdf.addObject(
            '<< /Type /Page /Parent ' + pdf.ref(2) +
            ' /MediaBox [0 0 ' + W + ' ' + H + ']' +
            ' /Contents ' + pdf.ref(streamObj) +
            ' /Resources << /Font << /F1 ' + pdf.ref(fontHelv) + ' /F2 ' + pdf.ref(fontBold) + ' >> >> >>'
        );

        // Update pages object
        pdf.objects[1].content = '<< /Type /Pages /Kids [' + pdf.ref(pageId) + '] /Count 1 >>';

        return pdf.build();
    }

    /* ======================================================================
       Helpers
       ====================================================================== */

    function drawSectionHeader(x, y, pageW, title) {
        var s = '';
        // Section title
        s += 'BT\n';
        s += '/F2 10 Tf\n';
        s += pdfColor('#f4f4f5') + ' rg\n';
        s += x + ' ' + y + ' Td\n';
        s += pdfString(title) + ' Tj\n';
        s += 'ET\n';
        // Underline
        s += pdfColor('#3f3f46') + ' rg\n';
        s += x + ' ' + (y - 6) + ' ' + (pageW - x * 2) + ' 0.5 re f\n';
        return s;
    }

    function drawMutedText(x, y, text) {
        var s = '';
        s += 'BT\n';
        s += '/F1 9 Tf\n';
        s += pdfColor('#52525b') + ' rg\n';
        s += x + ' ' + y + ' Td\n';
        s += pdfString(text) + ' Tj\n';
        s += 'ET\n';
        return s;
    }

    function drawCircle(cx, cy, r) {
        // Approximate circle with 4 bezier curves
        var k = 0.5523;
        var kr = k * r;
        var s = '';
        s += (cx) + ' ' + (cy + r) + ' m\n';
        s += (cx + kr) + ' ' + (cy + r) + ' ' + (cx + r) + ' ' + (cy + kr) + ' ' + (cx + r) + ' ' + cy + ' c\n';
        s += (cx + r) + ' ' + (cy - kr) + ' ' + (cx + kr) + ' ' + (cy - r) + ' ' + cx + ' ' + (cy - r) + ' c\n';
        s += (cx - kr) + ' ' + (cy - r) + ' ' + (cx - r) + ' ' + (cy - kr) + ' ' + (cx - r) + ' ' + cy + ' c\n';
        s += (cx - r) + ' ' + (cy - kr) + ' ' + (cx - kr) + ' ' + (cy + r) + ' ' + cx + ' ' + (cy + r) + ' c\n';
        s += 'f\n';
        return s;
    }

    function objectEntries(obj) {
        var arr = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) arr.push([k, obj[k]]);
        }
        return arr;
    }

    function friendlyPlatform(p) {
        if (!p) return 'Unknown';
        if (p.indexOf('chatgpt') !== -1) return 'ChatGPT';
        if (p.indexOf('claude') !== -1) return 'Claude';
        if (p.indexOf('gemini') !== -1) return 'Gemini';
        return p;
    }

    function friendlySource(s) {
        if (!s) return 'Unknown';
        if (s === 'text_input') return 'Text Input';
        if (s === 'network') return 'Network Request';
        if (s === 'document') return 'Document Upload';
        return s;
    }

    function formatDate(d) {
        var months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    function formatTime(d) {
        var h = d.getHours();
        var m = d.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    function formatTimestamp(ts) {
        if (!ts) return 'N/A';
        var d = new Date(ts);
        return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear() +
            ' ' + formatTime(d);
    }

    function wrapText(str, maxChars) {
        var words = str.split(' ');
        var lines = [];
        var line = '';
        for (var i = 0; i < words.length; i++) {
            if ((line + ' ' + words[i]).length > maxChars && line.length > 0) {
                lines.push(line);
                line = words[i];
            } else {
                line = line ? line + ' ' + words[i] : words[i];
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    function generateReportId() {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var id = 'CR-';
        for (var i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    /* ======================================================================
       Public API
       ====================================================================== */

    function downloadReport(data) {
        var pdfContent = generateReport(data);
        var blob = new Blob([pdfContent], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'Blankit-Audit-Report-' + new Date().toISOString().slice(0, 10) + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return {
        generateReport: generateReport,
        downloadReport: downloadReport
    };

})();
