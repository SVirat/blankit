// jszip-post.js — Restore original window.postMessage after JSZip loads
// This ensures the MAIN ↔ ISOLATED world communication bridge is never corrupted
(function() {
    'use strict';
    if (window.__cloaker_origPostMessage) {
        window.postMessage = window.__cloaker_origPostMessage;
        delete window.__cloaker_origPostMessage;
    }
})();
