// src/platforms/claude/selectors.js — Claude CSS selectors
(function () {
    'use strict';
    var C = window.__cloaker;

    // Claude input area selectors (ProseMirror editor)
    C.inputSelectors.push(
        '[contenteditable="true"].ProseMirror',
        'div.ProseMirror[contenteditable="true"]'
    );

    // Claude send button selectors
    C.sendButtonSelectors.push(
        'button[aria-label="Send message"]'
    );
})();
