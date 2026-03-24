// src/background/service-worker.js — Session lifecycle & Storage
(function () {
    'use strict';

    // Helper: generate or retrieve the unique extension user ID
    function getOrCreateUserId(callback) {
        chrome.storage.local.get(['extensionUserId'], function (result) {
            if (result.extensionUserId) {
                callback(result.extensionUserId);
            } else {
                var id = 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
                chrome.storage.local.set({ extensionUserId: id });
                callback(id);
            }
        });
    }

    // =========================================================================
    // Initialize on install
    // =========================================================================

    chrome.runtime.onInstalled.addListener(function (details) {
        // Generate unique user ID on first install
        getOrCreateUserId(function () { });

        chrome.storage.local.get(null, function (result) {
            var defaults = {};
            if (result.enabled === undefined) defaults.enabled = true;
            if (result.totalRedacted === undefined) defaults.totalRedacted = 0;
            if (result.sessionRedacted === undefined) defaults.sessionRedacted = 0;
            if (result.categories === undefined) {
                defaults.categories = {
                    emails: true, phones: true, ssn: true, creditCards: true,
                    addresses: true, names: true, dates: true, medical: true, ip: true
                };
            }
            if (Object.keys(defaults).length > 0) {
                chrome.storage.local.set(defaults);
            }
        });

        if (details.reason === 'install') {
            chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
        }
    });

    // Clear session data on browser startup
    chrome.runtime.onStartup.addListener(function () {
        chrome.storage.local.set({ sessionRedacted: 0 });
    });

    // =========================================================================
    // Message relay
    // =========================================================================

    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (msg.type === 'STATS_UPDATE') {
            chrome.runtime.sendMessage(msg).catch(function () { });
            sendResponse({ ok: true });
        }
        if (msg.type === 'TOGGLE_CLOAKER') {
            chrome.storage.local.set({ enabled: msg.enabled });
            sendResponse({ ok: true });
        }
        if (msg.type === 'STORE_AUDIT_LOG') {
            getOrCreateUserId(function (userId) {
                msg.entry.actorId = userId;
                chrome.storage.local.get(['auditLogs'], function (result) {
                    var logs = result.auditLogs || [];
                    logs.push(msg.entry);
                    if (logs.length > 500) logs = logs.slice(-500);
                    chrome.storage.local.set({ auditLogs: logs });
                });
            });
            sendResponse({ ok: true });
        }
        if (msg.type === 'GET_AUDIT_LOGS') {
            chrome.storage.local.get(['auditLogs'], function (result) {
                sendResponse({ logs: result.auditLogs || [] });
            });
            return true;
        }
        if (msg.type === 'CLEAR_AUDIT_LOGS') {
            chrome.storage.local.set({ auditLogs: [] });
            sendResponse({ ok: true });
        }
        return true;
    });
})();
