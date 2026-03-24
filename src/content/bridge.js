// src/content/bridge.js — ISOLATED world content script
// Manages UI overlays (badge, scrub bubble), bridges settings to MAIN world,
// handles stats tracking and communication with popup/background.
(function () {
    'use strict';

    var enabled = true;
    var deepSleep = false;
    var categories = {
        emails: true, phones: true, ssn: true, creditCards: true,
        addresses: true, names: true, dates: true, medical: true, ip: true,
        passport: true, driversLicense: true, taxId: true,
        bankAccount: true, macAddress: true, urls: true,
        credentials: true, uuid: true
    };
    var customWords = [];

    // Un-redact state
    var accumulatedMap = {};
    var isUnredacted = false;
    var _unredactObserver = null;

    // Onboarding state
    var _onboardBadgeDismissed = false;
    var _onboardEyeShown = false;
    var _onboardEyeDeferred = false;

    // =========================================================================
    // UI: Floating Badge / Toggle Button
    // =========================================================================

    function createBadge() {
        var badge = document.createElement('div');
        badge.id = 'cloaker-badge';
        badge.title = 'Toggle Cloaker protection';
        badge.innerHTML = '<img src="' + chrome.runtime.getURL('icons/icon48.png') + '" width="28" height="28" alt="Blankit" style="pointer-events:none;">';

        badge.addEventListener('click', function () {
            enabled = !enabled;
            chrome.storage.local.set({ enabled: enabled });
            updateUI();
            sendSettingsToMain();
            chrome.runtime.sendMessage({ type: 'TOGGLE_CLOAKER', enabled: enabled });
        });

        document.body.appendChild(badge);
        return badge;
    }

    // =========================================================================
    // UI Update
    // =========================================================================

    function updateUI() {
        var badge = document.getElementById('cloaker-badge');
        if (badge) {
            badge.classList.toggle('disabled', !enabled);
            badge.style.display = deepSleep ? 'none' : '';
        }
        var eyeBtn = document.getElementById('cloaker-unredact-btn');
        if (eyeBtn && deepSleep) {
            eyeBtn.style.display = 'none';
        }
    }

    function flashBadge() {
        var badge = document.getElementById('cloaker-badge');
        if (!badge) return;
        badge.classList.add('flash');
        setTimeout(function () { badge.classList.remove('flash'); }, 2000);
    }

    // =========================================================================
    // UI: Scrub Bubble (appears near badge when a file is redacted)
    // =========================================================================

    var _bubbleTimer = null;

    function shiftUnredactButton(up) {
        var btn = document.getElementById('cloaker-unredact-btn');
        if (!btn) return;
        if (up) {
            var bubble = document.getElementById('cloaker-scrub-bubble');
            var bubbleH = bubble ? bubble.offsetHeight : 80;
            // bubble starts at bottom:76px, so eye btn needs to clear that + bubble height + padding
            btn.style.bottom = (76 + bubbleH + 12) + 'px';
        } else {
            btn.style.bottom = '74px';
        }
    }

    function showScrubBubble(count, fileName, blobUrl) {
        dismissScrubBubble();

        var bubble = document.createElement('div');
        bubble.id = 'cloaker-scrub-bubble';

        var msg = document.createElement('div');
        msg.className = 'cloaker-scrub-msg';
        msg.textContent = '\u{1F6E1}\uFE0F ' + count + ' personal item' + (count !== 1 ? 's' : '') + ' scrubbed';
        bubble.appendChild(msg);

        var sub = document.createElement('div');
        sub.className = 'cloaker-scrub-file';
        sub.textContent = fileName;
        bubble.appendChild(sub);

        var actions = document.createElement('div');
        actions.className = 'cloaker-scrub-actions';

        var dlBtn = document.createElement('button');
        dlBtn.className = 'cloaker-scrub-btn cloaker-scrub-dl';
        dlBtn.textContent = 'Download';
        dlBtn.addEventListener('click', function () {
            var a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            dismissScrubBubble();
        });
        actions.appendChild(dlBtn);

        var dismissBtn = document.createElement('button');
        dismissBtn.className = 'cloaker-scrub-btn cloaker-scrub-dismiss';
        dismissBtn.textContent = '\u2715';
        dismissBtn.title = 'Dismiss';
        dismissBtn.addEventListener('click', function () {
            dismissScrubBubble();
        });
        actions.appendChild(dismissBtn);

        bubble.appendChild(actions);
        document.body.appendChild(bubble);
        shiftUnredactButton(true);

        _bubbleTimer = setTimeout(dismissScrubBubble, 8000);
    }

    function dismissScrubBubble() {
        if (_bubbleTimer) { clearTimeout(_bubbleTimer); _bubbleTimer = null; }
        var existing = document.getElementById('cloaker-scrub-bubble');
        if (existing) existing.remove();
        shiftUnredactButton(false);

        // Show deferred eye onboarding tip now that the bubble is gone
        if (_onboardEyeDeferred) {
            _onboardEyeDeferred = false;
            showEyeOnboardTip();
        }
    }

    // =========================================================================
    // Un-Redact: Toggle placeholders ↔ original values in page
    // =========================================================================

    function createUnredactButton() {
        var btn = document.createElement('div');
        btn.id = 'cloaker-unredact-btn';
        btn.title = 'Un-redact: reveal original values';
        btn.textContent = '\u{1F441}';
        btn.style.display = 'none';
        btn.addEventListener('click', function () {
            toggleUnredact();
        });
        document.body.appendChild(btn);
    }

    function updateUnredactButton() {
        var btn = document.getElementById('cloaker-unredact-btn');
        if (!btn) return;
        var hasRedactions = Object.keys(accumulatedMap).length > 0;
        var wasHidden = btn.style.display === 'none';
        btn.style.display = (hasRedactions && !deepSleep) ? 'flex' : 'none';
        btn.classList.toggle('active', isUnredacted);
        btn.title = isUnredacted ? 'Re-redact: hide original values' : 'Un-redact: reveal original values';

        // Show onboarding tip when eye button first appears
        if (hasRedactions && wasHidden && !_onboardEyeShown) {
            chrome.storage.local.get(['onboardingComplete'], function (r) {
                if (!r.onboardingComplete) showEyeOnboardTip();
            });
        }
    }

    function toggleUnredact() {
        if (isUnredacted) {
            reredactPage();
            stopUnredactWatch();
        } else {
            unredactPage();
            startUnredactWatch();
        }
        isUnredacted = !isUnredacted;
        updateUnredactButton();
    }

    function unredactTextNode(node) {
        var text = node.nodeValue;
        if (!text) return;
        var regex = /\[(?:[A-Z_]+_\d+|[0-9a-f]{6})\]/g;
        if (!regex.test(text)) return;
        regex.lastIndex = 0;
        node.nodeValue = text.replace(regex, function (match) {
            var entry = accumulatedMap[match];
            return entry ? entry.original : match;
        });
    }

    function unredactPage() {
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            unredactTextNode(node);
        }
    }

    function reredactPage() {
        var reverseMap = {};
        for (var placeholder in accumulatedMap) {
            if (Object.prototype.hasOwnProperty.call(accumulatedMap, placeholder)) {
                reverseMap[accumulatedMap[placeholder].original] = placeholder;
            }
        }
        var originals = Object.keys(reverseMap).sort(function (a, b) { return b.length - a.length; });
        if (originals.length === 0) return;

        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            var text = node.nodeValue;
            if (!text) continue;
            var changed = false;
            for (var i = 0; i < originals.length; i++) {
                if (text.indexOf(originals[i]) !== -1) {
                    text = text.split(originals[i]).join(reverseMap[originals[i]]);
                    changed = true;
                }
            }
            if (changed) node.nodeValue = text;
        }
    }

    function startUnredactWatch() {
        if (_unredactObserver) return;
        _unredactObserver = new MutationObserver(function (mutations) {
            var regex = /\[(?:[A-Z_]+_\d+|[0-9a-f]{6})\]/;
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    if (added[j].nodeType === 3 && regex.test(added[j].nodeValue)) {
                        unredactTextNode(added[j]);
                    } else if (added[j].nodeType === 1) {
                        var tw = document.createTreeWalker(added[j], NodeFilter.SHOW_TEXT);
                        var n;
                        while ((n = tw.nextNode())) {
                            if (regex.test(n.nodeValue)) unredactTextNode(n);
                        }
                    }
                }
            }
        });
        _unredactObserver.observe(document.body, { childList: true, subtree: true });
    }

    function stopUnredactWatch() {
        if (_unredactObserver) {
            _unredactObserver.disconnect();
            _unredactObserver = null;
        }
    }

    // =========================================================================
    // Audit Log: Generate compliance audit entries
    // =========================================================================

    function getPlatform() {
        var host = window.location.hostname;
        if (host.indexOf('chatgpt') !== -1) return 'chatgpt.com';
        if (host.indexOf('claude') !== -1) return 'claude.ai';
        if (host.indexOf('gemini') !== -1) return 'gemini.google.com';
        return host;
    }

    function generateAuditLog(data) {
        if (!data.items || data.items.length === 0) return;

        var source = 'text_input';
        if (data.type === 'CLOAKER_NETWORK_REDACTION') {
            source = data.fileName ? 'document' : 'network';
        }

        var categoriesSet = {};
        for (var i = 0; i < data.items.length; i++) {
            categoriesSet[data.items[i].type] = true;
        }

        var entry = {
            id: Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            eventType: 'PII_REDACTION',
            severity: 'INFO',
            actorId: null,
            platform: getPlatform(),
            source: source,
            documentName: data.fileName || null,
            itemCount: data.items.length,
            categories: Object.keys(categoriesSet),
            outcome: 'SUCCESS',
            extensionVersion: chrome.runtime.getManifest().version
        };

        chrome.runtime.sendMessage({ type: 'STORE_AUDIT_LOG', entry: entry });
    }

    // =========================================================================
    // Onboarding Help Tooltips (shown once on first install)
    // =========================================================================

    function createOnboardTip(id, cssClass, text) {
        var existing = document.getElementById(id);
        if (existing) return existing;

        var tip = document.createElement('div');
        tip.id = id;
        tip.className = 'cloaker-onboard-tip ' + cssClass;

        var msg = document.createElement('span');
        msg.textContent = text;
        tip.appendChild(msg);

        var dismiss = document.createElement('button');
        dismiss.className = 'cloaker-onboard-tip-dismiss';
        dismiss.textContent = '\u2715';
        dismiss.addEventListener('click', function () {
            dismissOnboardTip(id);
        });
        tip.appendChild(dismiss);

        document.body.appendChild(tip);
        return tip;
    }

    function dismissOnboardTip(id) {
        var el = document.getElementById(id);
        if (el) el.remove();
        if (id === 'cloaker-onboard-badge') {
            _onboardBadgeDismissed = true;
        }
        // Mark complete when both have been shown and the badge was dismissed
        if (_onboardBadgeDismissed && _onboardEyeShown) {
            chrome.storage.local.set({ onboardingComplete: true });
        }
    }

    function showBadgeOnboardTip() {
        createOnboardTip(
            'cloaker-onboard-badge',
            'cloaker-onboard-tip--badge',
            'Toggle PII protection on or off'
        );
        setTimeout(function () { dismissOnboardTip('cloaker-onboard-badge'); }, 8000);
    }

    function showEyeOnboardTip() {
        if (_onboardEyeShown) return;

        // Defer if the scrub bubble is currently visible to avoid overlap
        if (document.getElementById('cloaker-scrub-bubble')) {
            _onboardEyeDeferred = true;
            return;
        }

        _onboardEyeShown = true;
        createOnboardTip(
            'cloaker-onboard-eye',
            'cloaker-onboard-tip--eye',
            'Reveal or re-hide your original values'
        );
        setTimeout(function () { dismissOnboardTip('cloaker-onboard-eye'); }, 8000);
        // If badge was already dismissed, mark onboarding complete
        if (_onboardBadgeDismissed) {
            chrome.storage.local.set({ onboardingComplete: true });
        }
    }

    // =========================================================================
    // Settings Bridge: ISOLATED → MAIN via postMessage
    // =========================================================================

    function sendSettingsToMain() {
        window.postMessage({
            type: 'CLOAKER_SETTINGS',
            enabled: enabled,
            categories: categories,
            customWords: customWords
        }, '*');
    }

    // =========================================================================
    // Message Handling: postMessage from MAIN world
    // =========================================================================

    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        var data = e.data;
        if (!data || !data.type) return;

        if (data.type === 'CLOAKER_READY') {
            sendSettingsToMain();
        }

        if (data.type === 'CLOAKER_INPUT_REDACTION' || data.type === 'CLOAKER_NETWORK_REDACTION') {
            var count = data.count || 0;
            if (count > 0) {
                flashBadge();

                // Accumulate redaction map for un-redact feature
                if (data.map) {
                    for (var key in data.map) {
                        if (Object.prototype.hasOwnProperty.call(data.map, key)) {
                            accumulatedMap[key] = data.map[key];
                        }
                    }
                    updateUnredactButton();
                }

                // Generate compliance audit log entry
                generateAuditLog(data);

                // Show scrub bubble for file redactions (fileData present)
                if (data.fileData && data.fileName) {
                    var blob = new Blob([data.fileData], { type: data.fileType || 'application/octet-stream' });
                    var blobUrl = URL.createObjectURL(blob);
                    showScrubBubble(count, data.fileName, blobUrl);
                }

                chrome.storage.local.get(['totalRedacted', 'sessionRedacted'], function (result) {
                    var total = (result.totalRedacted || 0) + count;
                    var session = (result.sessionRedacted || 0) + count;

                    chrome.storage.local.set({
                        totalRedacted: total,
                        sessionRedacted: session
                    });

                    chrome.runtime.sendMessage({
                        type: 'STATS_UPDATE',
                        totalRedacted: total,
                        sessionRedacted: session
                    });
                });
            }
        }
    });

    // =========================================================================
    // Message Handling: chrome.runtime messages from popup/background
    // =========================================================================

    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (msg.type === 'TOGGLE_CLOAKER') {
            enabled = msg.enabled;
            updateUI();
            sendSettingsToMain();
            sendResponse({ ok: true });
        }
        if (msg.type === 'UPDATE_CATEGORIES') {
            categories = msg.categories;
            chrome.storage.local.set({ categories: categories });
            sendSettingsToMain();
            sendResponse({ ok: true });
        }
        if (msg.type === 'UPDATE_CUSTOM_WORDS') {
            customWords = msg.customWords || [];
            sendSettingsToMain();
            sendResponse({ ok: true });
        }
        if (msg.type === 'DEEP_SLEEP') {
            deepSleep = msg.deepSleep;
            updateUI();
            updateUnredactButton();
            sendResponse({ ok: true });
        }
        if (msg.type === 'CLEAR_SESSION') {
            window.postMessage({ type: 'CLOAKER_CLEAR' }, '*');
            accumulatedMap = {};
            isUnredacted = false;
            stopUnredactWatch();
            updateUnredactButton();
            sendResponse({ ok: true });
        }
        return true;
    });

    // =========================================================================
    // Initialization
    // =========================================================================

    chrome.storage.local.get(['enabled', 'categories', 'deepSleep'], function (result) {
        if (typeof result.enabled === 'boolean') enabled = result.enabled;
        if (result.deepSleep === true) deepSleep = true;
        if (result.categories) categories = result.categories;

        createBadge();
        createUnredactButton();
        updateUI();

        // Load custom words from sync storage (survives uninstall/reinstall)
        chrome.storage.sync.get(['customWords'], function (syncResult) {
            customWords = syncResult.customWords || [];
            sendSettingsToMain();
        });

        // Show onboarding tooltip on first install
        chrome.storage.local.get(['onboardingComplete'], function (ob) {
            if (!ob.onboardingComplete) {
                showBadgeOnboardTip();
            } else {
                _onboardBadgeDismissed = true;
                _onboardEyeShown = true;
            }
        });
    });

})();
