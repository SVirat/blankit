// src/platforms/chatgpt/interceptor.js — ChatGPT DOM/Event file upload interception
// Completely isolated: only activates on chatgpt.com, guarded by try/catch (fail-open).
(function () {
    'use strict';

    var host = window.location.hostname;
    if (host !== 'chatgpt.com' && host !== 'www.chatgpt.com') return;

    var C = window.__cloaker;
    var cleanableExtensions = /\.(docx|xlsx|pptx|txt|csv|tsv|json|xml|md|log|html|htm|yaml|yml|ini|cfg|conf|rtf|pdf)$/i;

    function isCleanable(file) {
        return cleanableExtensions.test(file.name) || C.isOoxmlFile(file) || C.isTextFile(file) || C.isPdfFile(file);
    }

    async function cleanFile(file) {
        if (C.isOoxmlFile(file)) return await C.redactOoxmlFile(file);
        if (C.isPdfFile(file)) return await C.redactPdfFile(file);
        if (C.isTextFile(file)) return await C.redactTextFile(file);
        return file;
    }

    // --- File input change event interception ---
    document.addEventListener('change', async function (e) {
        if (!C.enabled) return;
        if (e._cloakerBypass) return;

        var input = e.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
        if (!input.files || input.files.length === 0) return;

        var files = Array.from(input.files);
        if (!files.some(isCleanable)) return;

        e.stopImmediatePropagation();

        try {
            var dt = new DataTransfer();
            for (var i = 0; i < files.length; i++) {
                if (isCleanable(files[i])) {
                    dt.items.add(await cleanFile(files[i]));
                } else {
                    dt.items.add(files[i]);
                }
            }

            input.files = dt.files;

            var newEvt = new Event('change', { bubbles: true });
            newEvt._cloakerBypass = true;
            input.dispatchEvent(newEvt);
        } catch (err) {
            console.warn('[Cloaker][ChatGPT] File interception error:', err);
            var fallbackEvt = new Event('change', { bubbles: true });
            fallbackEvt._cloakerBypass = true;
            input.dispatchEvent(fallbackEvt);
        }
    }, true);

    // --- Drag-and-drop interception ---
    document.addEventListener('drop', async function (e) {
        if (!C.enabled) return;
        if (e._cloakerBypass) return;
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

        var files = Array.from(e.dataTransfer.files);
        if (!files.some(isCleanable)) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        try {
            var dt = new DataTransfer();
            for (var i = 0; i < files.length; i++) {
                if (isCleanable(files[i])) {
                    dt.items.add(await cleanFile(files[i]));
                } else {
                    dt.items.add(files[i]);
                }
            }

            var newEvt = new DragEvent('drop', {
                bubbles: true, cancelable: true
            });
            Object.defineProperty(newEvt, 'dataTransfer', { value: dt });
            newEvt._cloakerBypass = true;
            e.target.dispatchEvent(newEvt);
        } catch (err) {
            console.warn('[Cloaker][ChatGPT] Drag-and-drop error:', err);
        }
    }, true);

})();
