// src/platforms/chatgpt/selectors.js — ChatGPT CSS selectors
(function () {
    'use strict';
    var C = window.__cloaker;

    // ChatGPT input area selectors (highest priority)
    C.inputSelectors.push(
        '#prompt-textarea',
        'div[contenteditable="true"][id="prompt-textarea"]',
        'textarea[id="prompt-textarea"]'
    );

    // ChatGPT send button selectors
    C.sendButtonSelectors.push(
        'button[data-testid="send-button"]',
        'button[data-testid="composer-send-button"]'
    );
})();
