// src/platforms/gemini/selectors.js — Gemini CSS selectors
(function () {
    'use strict';
    var C = window.__cloaker;

    // Gemini input area selectors
    C.inputSelectors.push(
        '.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-placeholder]'
    );

    // Gemini send button selectors
    C.sendButtonSelectors.push(
        'button[aria-label*="Send"]:not([disabled])'
    );

    // Generic fallbacks (appended last = lowest priority)
    C.inputSelectors.push(
        'form textarea',
        'div[contenteditable="true"]'
    );
})();
