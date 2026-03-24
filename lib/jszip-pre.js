// jszip-pre.js — Save original window.postMessage before JSZip loads
// This prevents Angular/Zone.js sites (e.g., Gemini) from losing the real postMessage
(function() {
    'use strict';
    window.__cloaker_origPostMessage = window.postMessage.bind(window);
})();
