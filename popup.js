// popup.js — Control panel logic
(function () {
    'use strict';

    const masterToggle = document.getElementById('master-toggle');
    const deepSleepToggle = document.getElementById('deep-sleep-toggle');
    const totalCount = document.getElementById('total-count');
    const sessionCount = document.getElementById('session-count');
    const btnClear = document.getElementById('btn-clear');
    const btnAudit = document.getElementById('btn-audit');
    const auditPanel = document.getElementById('audit-panel');
    const auditEntries = document.getElementById('audit-entries');
    const btnExportAudit = document.getElementById('btn-export-audit');
    const btnClearAudit = document.getElementById('btn-clear-audit');
    const btnCloseAudit = document.getElementById('btn-close-audit');

    // =========================================================================
    // Load current state
    // =========================================================================

    chrome.storage.local.get(['enabled', 'categories', 'totalRedacted', 'sessionRedacted', 'deepSleep'], function (result) {
        // Master toggle
        const isEnabled = result.enabled !== false;
        masterToggle.checked = isEnabled;

        // Deep Sleep toggle
        deepSleepToggle.checked = result.deepSleep === true;

        // Stats
        totalCount.textContent = String(result.totalRedacted || 0);
        sessionCount.textContent = String(result.sessionRedacted || 0);

        // Categories
        const cats = result.categories || {};
        document.querySelectorAll('[data-category]').forEach(function (cb) {
            const key = cb.getAttribute('data-category');
            cb.checked = cats[key] !== false;
        });
    });

    // =========================================================================
    // Master Toggle
    // =========================================================================

    masterToggle.addEventListener('change', function () {
        const isEnabled = masterToggle.checked;
        chrome.storage.local.set({ enabled: isEnabled });

        // Send to active tab's content script
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'TOGGLE_CLOAKER',
                    enabled: isEnabled
                }).catch(function () { /* tab not ready */ });
            }
        });
    });

    // =========================================================================
    // Deep Sleep Toggle
    // =========================================================================

    deepSleepToggle.addEventListener('change', function () {
        const isSleeping = deepSleepToggle.checked;
        chrome.storage.local.set({ deepSleep: isSleeping });

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'DEEP_SLEEP',
                    deepSleep: isSleeping
                }).catch(function () { /* tab not ready */ });
            }
        });
    });

    // =========================================================================
    // Category Toggles
    // =========================================================================

    document.querySelectorAll('[data-category]').forEach(function (cb) {
        cb.addEventListener('change', function () {
            const cats = {};
            document.querySelectorAll('[data-category]').forEach(function (c) {
                cats[c.getAttribute('data-category')] = c.checked;
            });
            chrome.storage.local.set({ categories: cats });

            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'UPDATE_CATEGORIES',
                        categories: cats
                    }).catch(function () { /* tab not ready */ });
                }
            });
        });
    });

    // =========================================================================
    // Clear Session
    // =========================================================================

    btnClear.addEventListener('click', function () {
        chrome.storage.local.set({
            sessionRedacted: 0
        });

        sessionCount.textContent = '0';

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'CLEAR_SESSION'
                }).catch(function () { /* tab not ready */ });
            }
        });
    });

    // =========================================================================
    // Live Stats Updates (from background relay)
    // =========================================================================

    chrome.runtime.onMessage.addListener(function (msg) {
        if (msg.type === 'STATS_UPDATE') {
            if (msg.totalRedacted !== undefined) {
                totalCount.textContent = String(msg.totalRedacted);
            }
            if (msg.sessionRedacted !== undefined) {
                sessionCount.textContent = String(msg.sessionRedacted);
            }
        }
    });

    // =========================================================================
    // Custom Words — user-defined word→replacement redaction pairs
    // Uses chrome.storage.sync so entries survive uninstall/reinstall
    // =========================================================================

    var customWordsList = document.getElementById('custom-words-list');
    var btnAddWord = document.getElementById('btn-add-word');
    var btnRemoveAllWords = document.getElementById('btn-remove-all-words');
    var _customWords = [];

    function generateHash() {
        var ts = Date.now().toString(36);
        var rand = Math.random().toString(36).substr(2, 6);
        var raw = ts + rand;
        var hash = '';
        for (var i = 0; i < 8; i++) {
            hash += raw.charAt(Math.floor(Math.random() * raw.length));
        }
        return '[' + hash + ']';
    }

    function saveCustomWords() {
        chrome.storage.sync.set({ customWords: _customWords });
        // Push to active tab's content script
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'UPDATE_CUSTOM_WORDS',
                    customWords: _customWords
                }).catch(function () { /* tab not ready */ });
            }
        });
        updateRemoveAllBtn();
    }

    function updateRemoveAllBtn() {
        btnRemoveAllWords.style.display = _customWords.length > 3 ? 'block' : 'none';
    }

    function renderCustomWords() {
        customWordsList.innerHTML = '';
        for (var i = 0; i < _customWords.length; i++) {
            (function (idx) {
                var row = document.createElement('div');
                row.className = 'custom-word-row';

                var wordInput = document.createElement('input');
                wordInput.type = 'text';
                wordInput.placeholder = 'Word or pattern to redact';
                wordInput.value = _customWords[idx].word || '';
                wordInput.addEventListener('input', function () {
                    var trimmed = wordInput.value.trim();
                    _customWords[idx].word = trimmed;
                    if (trimmed && !_customWords[idx].hash) {
                        _customWords[idx].hash = generateHash();
                        hashLabel.textContent = _customWords[idx].hash;
                    }
                    saveCustomWords();
                });

                var arrow = document.createElement('span');
                arrow.className = 'cw-arrow';
                arrow.textContent = '→';

                var hashLabel = document.createElement('span');
                hashLabel.className = 'cw-hash';
                hashLabel.textContent = _customWords[idx].hash || '';
                hashLabel.title = 'Auto-generated redaction ID';

                var btnDel = document.createElement('button');
                btnDel.className = 'btn-remove-word';
                btnDel.title = 'Remove';
                btnDel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
                btnDel.addEventListener('click', function () {
                    _customWords.splice(idx, 1);
                    saveCustomWords();
                    renderCustomWords();
                });

                row.appendChild(wordInput);
                row.appendChild(arrow);
                row.appendChild(hashLabel);
                row.appendChild(btnDel);
                customWordsList.appendChild(row);
            })(i);
        }
        updateRemoveAllBtn();
    }

    btnAddWord.addEventListener('click', function () {
        _customWords.push({ word: '', hash: '' });
        saveCustomWords();
        renderCustomWords();
        // Focus the new word input
        var inputs = customWordsList.querySelectorAll('input[placeholder="Word to redact"]');
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
    });

    btnRemoveAllWords.addEventListener('click', function () {
        _customWords = [];
        saveCustomWords();
        renderCustomWords();
    });

    // Load custom words from sync storage
    chrome.storage.sync.get(['customWords'], function (result) {
        _customWords = result.customWords || [];
        renderCustomWords();
    });

    // =========================================================================
    // Share / Import Custom Words
    // =========================================================================

    var btnShareWords = document.getElementById('btn-share-words');
    var btnImportWords = document.getElementById('btn-import-words');
    var importWordsFile = document.getElementById('import-words-file');
    var cwShareToast = document.getElementById('cw-share-toast');

    function showToast(msg, type) {
        cwShareToast.textContent = msg;
        cwShareToast.className = 'cw-share-toast toast-' + (type || 'info');
        cwShareToast.style.display = 'block';
        setTimeout(function () { cwShareToast.style.display = 'none'; }, 3000);
    }

    btnShareWords.addEventListener('click', function () {
        var wordsToExport = _customWords.filter(function (w) { return w.word; });
        if (wordsToExport.length === 0) {
            showToast('Add some custom words first.', 'error');
            return;
        }
        var exportData = {
            format: 'blankit-custom-words',
            version: '1.0',
            exportedAt: new Date().toISOString(),
            words: wordsToExport
        };
        var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'blankit-redaction-set-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Redaction set exported! Share the file with your team.', 'success');
    });

    btnImportWords.addEventListener('click', function () {
        importWordsFile.click();
    });

    importWordsFile.addEventListener('change', function () {
        var file = importWordsFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var data = JSON.parse(e.target.result);
                if (data.format !== 'blankit-custom-words' || !Array.isArray(data.words)) {
                    showToast('Invalid file. Must be a Blankit redaction set.', 'error');
                    return;
                }
                var imported = 0;
                var existingSet = {};
                for (var i = 0; i < _customWords.length; i++) {
                    if (_customWords[i].word) existingSet[_customWords[i].word.toLowerCase()] = true;
                }
                for (var j = 0; j < data.words.length; j++) {
                    var w = data.words[j];
                    if (w.word && !existingSet[w.word.toLowerCase()]) {
                        _customWords.push({ word: w.word, hash: w.hash || generateHash() });
                        existingSet[w.word.toLowerCase()] = true;
                        imported++;
                    }
                }
                saveCustomWords();
                renderCustomWords();
                if (imported > 0) {
                    showToast(imported + ' word' + (imported > 1 ? 's' : '') + ' imported successfully!', 'success');
                } else {
                    showToast('All words already exist. Nothing new to import.', 'info');
                }
            } catch (err) {
                showToast('Could not read file. Check the format.', 'error');
            }
        };
        reader.readAsText(file);
        importWordsFile.value = '';
    });

    // =========================================================================
    // Share Extension
    // =========================================================================

    var btnShareExt = document.getElementById('btn-share-ext');
    if (btnShareExt) {
        btnShareExt.addEventListener('click', function () {
            var shareUrl = 'https://chromewebstore.google.com/detail/crossout/oihdkggpbopimdndhephiechoegagoeb';
            var shareText = 'I use Blankit to automatically redact PII before it reaches AI chatbots. 100% local, no data leaves your browser.';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(shareText + ' ' + shareUrl).then(function () {
                    btnShareExt.textContent = 'Copied!';
                    setTimeout(function () { btnShareExt.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share'; }, 2000);
                });
            }
        });
    }

    // =========================================================================
    // Audit Log
    // =========================================================================

    function escapeHtml(str) {
        if (!str) return '';
        var el = document.createElement('span');
        el.textContent = str;
        return el.innerHTML;
    }

    function loadAuditLogs() {
        chrome.runtime.sendMessage({ type: 'GET_AUDIT_LOGS' }, function (res) {
            if (!res || !res.logs || res.logs.length === 0) {
                auditEntries.innerHTML = '<div class="audit-empty">No redaction events logged yet.</div>';
                return;
            }
            var html = '';
            var logs = res.logs.slice().reverse();
            var limit = Math.min(logs.length, 50);
            for (var i = 0; i < limit; i++) {
                var log = logs[i];
                var time = new Date(log.timestamp);
                var timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
                html += '<div class="audit-entry">';
                html += '<div class="audit-entry-header">';
                html += '<span class="audit-time">' + escapeHtml(timeStr) + '</span>';
                html += '<span class="audit-platform">' + escapeHtml(log.platform) + '</span>';
                html += '</div>';
                html += '<div class="audit-entry-body">';
                html += '<span class="audit-count">' + log.itemCount + ' item' + (log.itemCount !== 1 ? 's' : '') + '</span>';
                html += '<span class="audit-source">' + escapeHtml(log.source) + '</span>';
                if (log.documentName) {
                    html += '<span class="audit-doc">' + escapeHtml(log.documentName) + '</span>';
                }
                html += '</div>';
                html += '<div class="audit-categories">';
                for (var j = 0; j < log.categories.length; j++) {
                    html += '<span class="audit-tag">' + escapeHtml(log.categories[j]) + '</span>';
                }
                html += '</div>';
                html += '</div>';
            }
            if (logs.length > 50) {
                html += '<div class="audit-more">Showing 50 of ' + logs.length + '. Export for full log.</div>';
            }
            auditEntries.innerHTML = html;
        });
    }

    btnAudit.addEventListener('click', function () {
        if (auditPanel.style.display === 'none') {
            auditPanel.style.display = 'flex';
            loadAuditLogs();
        } else {
            auditPanel.style.display = 'none';
        }
    });

    btnCloseAudit.addEventListener('click', function () {
        auditPanel.style.display = 'none';
    });

    btnClearAudit.addEventListener('click', function () {
        chrome.runtime.sendMessage({ type: 'CLEAR_AUDIT_LOGS' }, function () {
            auditEntries.innerHTML = '<div class="audit-empty">No redaction events logged yet.</div>';
        });
    });

    btnExportAudit.addEventListener('click', function () {
        chrome.runtime.sendMessage({ type: 'GET_AUDIT_LOGS' }, function (res) {
            if (!res || !res.logs) return;
            chrome.storage.local.get(['totalRedacted'], function (store) {
                var version = chrome.runtime.getManifest().version;
                BlankitPDF.downloadReport({
                    logs: res.logs,
                    totalRedacted: store.totalRedacted || 0,
                    extensionVersion: version,
                    installDate: null
                });
            });
        });
    });

})();
