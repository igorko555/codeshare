/* ============================================================
   CodeDrop — App Logic with Firebase Real-Time Sync
   ============================================================ */

(function () {
    'use strict';

    // =====================================================
    //  🔥 FIREBASE CONFIG — Replace with your own!
    // =====================================================
    const firebaseConfig = {
        apiKey: "AIzaSyAI7BqL-zT2lpFYL31ouMvgKqa7GhL2qBo",
        authDomain: "codedrop-e5238.firebaseapp.com",
        databaseURL: "https://codedrop-e5238-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "codedrop-e5238",
        storageBucket: "codedrop-e5238.firebasestorage.app",
        messagingSenderId: "911968864855",
        appId: "1:911968864855:web:01d65b624603e4ab50b112"
    };

    // --- Firebase Init ---
    let db = null;
    let roomRef = null;
    let isRemoteUpdate = false; // prevents echo loops
    let currentRoom = null;

    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    } catch (e) {
        console.warn('Firebase init failed:', e.message);
    }

    // --- DOM Elements ---
    const codeInput    = document.getElementById('code-input');
    const codePreview  = document.getElementById('code-preview');
    const lineNumbers  = document.getElementById('line-numbers');
    const lineCount    = document.getElementById('line-count');
    const charCount    = document.getElementById('char-count');
    const langSelect   = document.getElementById('language-select');
    const btnShare     = document.getElementById('btn-share');
    const btnCopy      = document.getElementById('btn-copy');

    const btnClear     = document.getElementById('btn-clear');
    const fabClear     = document.getElementById('fab-clear');
    const btnEdit      = document.getElementById('btn-edit');
    const btnPreview   = document.getElementById('btn-preview');
    const editorPane   = document.getElementById('editor-pane');
    const previewPane  = document.getElementById('preview-pane');
    const toast        = document.getElementById('toast');

    // Room UI
    const roomInput    = document.getElementById('room-input');
    const btnJoinRoom  = document.getElementById('btn-join-room');
    const btnNewRoom   = document.getElementById('btn-new-room');
    const roomStatus   = document.getElementById('room-status');

    // --- State ---
    let toastTimeout = null;
    let syncTimeout = null;
    let detectTimeout = null;

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

    function generateRoomCode() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // =====================================================
    //  🔥 FIREBASE ROOM SYNC
    // =====================================================

    function setRoomStatus(text, type) {
        roomStatus.textContent = text;
        roomStatus.className = 'room-status ' + (type || '');
    }

    function joinRoom(roomCode) {
        if (!db) {
            showToast('Firebase not configured!', 'danger');
            setRoomStatus('⚠️ Firebase not set up', 'disconnected');
            return;
        }

        roomCode = roomCode.trim().toLowerCase();
        if (!roomCode) {
            showToast('Enter a room code!', 'danger');
            return;
        }

        // Detach previous listener
        if (roomRef) {
            roomRef.off();
        }

        currentRoom = roomCode;
        roomInput.value = roomCode;
        roomRef = db.ref('rooms/' + roomCode);

        setRoomStatus('⏳ Connecting...', '');

        // Listen for real-time changes
        roomRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                isRemoteUpdate = true;

                // Preserve cursor position
                const cursorPos = codeInput.selectionStart;
                const wasAtEnd = cursorPos === codeInput.value.length;

                if (data.code !== undefined && data.code !== codeInput.value) {
                    codeInput.value = data.code;
                    updateLineNumbers();
                    updateStats();

                    // Restore cursor
                    if (wasAtEnd) {
                        codeInput.selectionStart = codeInput.selectionEnd = codeInput.value.length;
                    } else {
                        codeInput.selectionStart = codeInput.selectionEnd = Math.min(cursorPos, codeInput.value.length);
                    }
                }

                if (data.language && data.language !== langSelect.value) {
                    langSelect.value = data.language;
                }

                // Update preview if active
                if (previewPane.classList.contains('active-pane')) {
                    highlightCode();
                }

                isRemoteUpdate = false;
            }
            setRoomStatus('🟢 Connected: ' + roomCode, 'connected');
        }, (error) => {
            console.error('Firebase error:', error);
            setRoomStatus('🔴 Error: ' + error.message, 'disconnected');
        });

        // Update URL hash
        window.location.hash = 'room=' + roomCode;
        showToast('🔗 Joined room: ' + roomCode);
    }

    function syncToFirebase() {
        if (!roomRef || isRemoteUpdate) return;

        clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            roomRef.update({
                code: codeInput.value,
                language: langSelect.value,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
        }, 300); // debounce 300ms
    }

    function createNewRoom() {
        const code = generateRoomCode();
        roomInput.value = code;
        joinRoom(code);

        // Copy room link
        const url = window.location.origin + window.location.pathname + '#room=' + code;
        navigator.clipboard.writeText(url).then(() => {
            showToast('✨ Room created! Link copied!');
        }).catch(() => {
            showToast('✨ Room created: ' + code);
        });
    }

    // --- Load room from URL ---
    function loadRoomFromHash() {
        const hash = window.location.hash.slice(1);
        if (hash.startsWith('room=')) {
            const roomCode = hash.substring(5);
            if (roomCode) {
                roomInput.value = roomCode;
                joinRoom(roomCode);
                return true;
            }
        }
        return false;
    }

    // --- Auto Language Detection ---

    function autoDetectLanguage() {
        if (langSelect.value !== 'auto') return;

        clearTimeout(detectTimeout);
        detectTimeout = setTimeout(() => {
            const code = codeInput.value.trim();
            if (!code || code.length < 10) return;

            const result = hljs.highlightAuto(code);
            if (result.language) {
                // Find matching option in select
                const options = Array.from(langSelect.options);
                const match = options.find(opt => opt.value === result.language);
                if (match) {
                    langSelect.value = result.language;
                    showToast('🔍 Detected: ' + match.textContent);
                    syncToFirebase();
                }
            }
        }, 500); // debounce 500ms
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
        updateLineNumbers();
        updateStats();
        switchMode('edit');
        syncToFirebase();
        showToast('🗑️ Cleared!');
    }

    // --- Share ---

    function shareCode() {
        if (currentRoom) {
            const url = window.location.origin + window.location.pathname + '#room=' + currentRoom;
            navigator.clipboard.writeText(url).then(() => {
                showToast('🔗 Room link copied!');
            }).catch(() => {
                showToast('🔗 Room: ' + currentRoom);
            });
        } else {
            showToast('Create a room first!', 'danger');
        }
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
            syncToFirebase();
        }
    }

    // --- Event Listeners ---

    codeInput.addEventListener('input', () => {
        updateLineNumbers();
        updateStats();
        syncToFirebase();
        autoDetectLanguage();
    });

    codeInput.addEventListener('scroll', syncScroll);
    codeInput.addEventListener('keydown', handleTab);

    btnShare.addEventListener('click', shareCode);
    btnCopy.addEventListener('click', copyCode);

    btnClear.addEventListener('click', clearAll);
    fabClear.addEventListener('click', clearAll);

    btnEdit.addEventListener('click', () => switchMode('edit'));
    btnPreview.addEventListener('click', () => switchMode('preview'));

    langSelect.addEventListener('change', () => {
        syncToFirebase();
        if (previewPane.classList.contains('active-pane')) {
            highlightCode();
        }
    });

    // Room event listeners
    btnJoinRoom.addEventListener('click', () => joinRoom(roomInput.value));
    btnNewRoom.addEventListener('click', createNewRoom);

    roomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            joinRoom(roomInput.value);
        }
    });

    // --- Init ---
    updateLineNumbers();
    updateStats();

    // Try to load room from URL hash
    if (!loadRoomFromHash()) {
        setRoomStatus('No room — click "+ New Room" to start', '');
    }
})();
