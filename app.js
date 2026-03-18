/* ============================================================
   CodeDrop — App Logic
   ============================================================ */

(function () {
    'use strict';

    // --- DOM Elements ---
    const codeInput    = document.getElementById('code-input');
    const codePreview  = document.getElementById('code-preview');
    const lineNumbers  = document.getElementById('line-numbers');
    const lineCount    = document.getElementById('line-count');
    const charCount    = document.getElementById('char-count');
    const langSelect   = document.getElementById('language-select');
    const btnShare     = document.getElementById('btn-share');
    const btnCopy      = document.getElementById('btn-copy');
    const btnNew       = document.getElementById('btn-new');
    const btnClear     = document.getElementById('btn-clear');
    const fabClear     = document.getElementById('fab-clear');
    const btnEdit      = document.getElementById('btn-edit');
    const btnPreview   = document.getElementById('btn-preview');
    const editorPane   = document.getElementById('editor-pane');
    const previewPane  = document.getElementById('preview-pane');
    const toast        = document.getElementById('toast');

    // --- State ---
    let toastTimeout = null;

    // --- Helpers ---

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = 'toast visible toast-' + type;
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.className = 'toast hidden';
        }, 2500);
    }

    function updateStats() {
        const text = codeInput.value;
        const lines = text === '' ? 0 : text.split('\n').length;
        lineCount.textContent = 'Lines: ' + lines;
        charCount.textContent = 'Chars: ' + text.length;
    }

    function updateLineNumbers() {
        const text = codeInput.value;
        const lines = text === '' ? 1 : text.split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += i + '\n';
        }
        lineNumbers.textContent = html;
    }

    function syncScroll() {
        lineNumbers.scrollTop = codeInput.scrollTop;
    }

    // --- Encode / Decode for URL ---

    function encodeCode(code) {
        try {
            return btoa(unescape(encodeURIComponent(code)));
        } catch (e) {
            return '';
        }
    }

    function decodeCode(encoded) {
        try {
            return decodeURIComponent(escape(atob(encoded)));
        } catch (e) {
            return '';
        }
    }

    // --- Share ---

    function shareCode() {
        const code = codeInput.value.trim();
        if (!code) {
            showToast('Nothing to share!', 'danger');
            return;
        }

        const lang = langSelect.value;
        const payload = lang + '|' + encodeCode(code);
        window.location.hash = payload;

        // Copy URL
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            showToast('🔗 Link copied to clipboard!');
        }).catch(() => {
            showToast('🔗 URL updated — copy it from the address bar');
        });
    }

    // --- Load from URL ---

    function loadFromHash() {
        const hash = window.location.hash.slice(1);
        if (!hash) return;

        let lang = 'auto';
        let encoded = hash;

        const pipeIdx = hash.indexOf('|');
        if (pipeIdx !== -1) {
            lang = hash.substring(0, pipeIdx);
            encoded = hash.substring(pipeIdx + 1);
        }

        const code = decodeCode(encoded);
        if (code) {
            codeInput.value = code;
            langSelect.value = lang;
            updateLineNumbers();
            updateStats();
            // Auto-switch to preview
            switchMode('preview');
        }
    }

    // --- Syntax Highlighting ---

    function highlightCode() {
        const code = codeInput.value;
        if (!code.trim()) {
            codePreview.textContent = '';
            codePreview.className = 'hljs';
            return;
        }

        const lang = langSelect.value;
        if (lang === 'auto') {
            const result = hljs.highlightAuto(code);
            codePreview.innerHTML = result.value;
            codePreview.className = 'hljs language-' + (result.language || '');
        } else {
            try {
                const result = hljs.highlight(code, { language: lang, ignoreIllegals: true });
                codePreview.innerHTML = result.value;
                codePreview.className = 'hljs language-' + lang;
            } catch (e) {
                codePreview.textContent = code;
                codePreview.className = 'hljs';
            }
        }
    }

    // --- Mode Switching ---

    function switchMode(mode) {
        if (mode === 'edit') {
            editorPane.classList.add('active-pane');
            previewPane.classList.remove('active-pane');
            btnEdit.classList.add('active');
            btnPreview.classList.remove('active');
        } else {
            highlightCode();
            previewPane.classList.add('active-pane');
            editorPane.classList.remove('active-pane');
            btnPreview.classList.add('active');
            btnEdit.classList.remove('active');
        }
    }

    // --- Clear ---

    function clearAll() {
        if (codeInput.value.trim() === '') {
            showToast('Already empty!', 'danger');
            return;
        }
        codeInput.value = '';
        codePreview.textContent = '';
        codePreview.className = 'hljs';
        window.location.hash = '';
        updateLineNumbers();
        updateStats();
        switchMode('edit');
        showToast('🗑️ Cleared!');
    }

    // --- Copy ---

    function copyCode() {
        const code = codeInput.value.trim();
        if (!code) {
            showToast('Nothing to copy!', 'danger');
            return;
        }
        navigator.clipboard.writeText(code).then(() => {
            showToast('📋 Copied to clipboard!');
        }).catch(() => {
            showToast('Failed to copy', 'danger');
        });
    }

    // --- New Snippet ---

    function newSnippet() {
        codeInput.value = '';
        codePreview.textContent = '';
        codePreview.className = 'hljs';
        langSelect.value = 'auto';
        history.replaceState(null, '', window.location.pathname);
        updateLineNumbers();
        updateStats();
        switchMode('edit');
        codeInput.focus();
        showToast('✨ Ready for new code!');
    }

    // --- Tab key support ---

    function handleTab(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeInput.selectionStart;
            const end = codeInput.selectionEnd;
            const value = codeInput.value;
            codeInput.value = value.substring(0, start) + '    ' + value.substring(end);
            codeInput.selectionStart = codeInput.selectionEnd = start + 4;
            updateLineNumbers();
            updateStats();
        }
    }

    // --- Event Listeners ---

    codeInput.addEventListener('input', () => {
        updateLineNumbers();
        updateStats();
    });

    codeInput.addEventListener('scroll', syncScroll);
    codeInput.addEventListener('keydown', handleTab);

    btnShare.addEventListener('click', shareCode);
    btnCopy.addEventListener('click', copyCode);
    btnNew.addEventListener('click', newSnippet);
    btnClear.addEventListener('click', clearAll);
    fabClear.addEventListener('click', clearAll);

    btnEdit.addEventListener('click', () => switchMode('edit'));
    btnPreview.addEventListener('click', () => switchMode('preview'));

    langSelect.addEventListener('change', () => {
        if (previewPane.classList.contains('active-pane')) {
            highlightCode();
        }
    });

    // --- Init ---
    updateLineNumbers();
    updateStats();
    loadFromHash();
})();
