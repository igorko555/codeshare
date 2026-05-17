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
    let storage = null;
    let roomRef = null;
    let filesRef = null;
    let isRemoteUpdate = false; // prevents echo loops
    let currentRoom = null;

    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        storage = firebase.storage();
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
    const btnFiles     = document.getElementById('btn-files');
    const editorPane   = document.getElementById('editor-pane');
    const previewPane  = document.getElementById('preview-pane');
    const filesPane    = document.getElementById('files-pane');
    const toast        = document.getElementById('toast');

    // File elements
    const fileUpload   = document.getElementById('file-upload');
    const filesList    = document.getElementById('files-list');
    const uploadBtnLabel = document.querySelector('.upload-btn span');


    const roomInput    = document.getElementById('room-input');
    const btnJoinRoom  = document.getElementById('btn-join-room');
    const btnNewRoom   = document.getElementById('btn-new-room');
    const roomStatus   = document.getElementById('room-status');
    const liveUsers    = document.getElementById('live-users');

    // --- State ---
    let toastTimeout = null;
    let syncTimeout = null;
    let detectTimeout = null;
    
    // Presence State
    const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
    let presenceRef = null;
    let usersRef = null;
    let connectedRef = db ? db.ref('.info/connected') : null;

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

        // Detach previous listeners
        if (roomRef) roomRef.off();
        if (usersRef) usersRef.off();
        if (filesRef) filesRef.off();
        if (presenceRef) {
            presenceRef.remove();
            presenceRef.onDisconnect().cancel();
        }

        // Prevent pending updates from leaking into the new room
        clearTimeout(syncTimeout);
        clearTimeout(detectTimeout);

        currentRoom = roomCode;
        roomInput.value = roomCode;
        roomRef = db.ref('rooms/' + roomCode);
        usersRef = db.ref('rooms/' + roomCode + '/users');
        filesRef = db.ref('rooms/' + roomCode + '/files');
        presenceRef = db.ref('rooms/' + roomCode + '/users/' + sessionId);

        setRoomStatus('⏳ Connecting...', '');
        liveUsers.classList.add('hidden');

        // Manage Presence
        if (connectedRef) {
            connectedRef.on('value', (snap) => {
                if (snap.val() === true && currentRoom === roomCode) {
                    presenceRef.onDisconnect().remove();
                    presenceRef.set(true);
                }
            });
        }

        // Listen for user count changes
        usersRef.on('value', (snap) => {
            if (snap.exists()) {
                const count = Object.keys(snap.val()).length;
                liveUsers.textContent = '👥 ' + count;
                liveUsers.classList.remove('hidden');
            } else {
                liveUsers.textContent = '👥 1';
                liveUsers.classList.remove('hidden');
            }
        });

        // Listen for files
        filesRef.on('value', async (snapshot) => {
            const filesObj = snapshot.val();
            if (filesObj) {
                const now = Date.now();
                const MAX_AGE = 24 * 60 * 60 * 1000;
                let hasDeletions = false;
                
                for (const [key, file] of Object.entries(filesObj)) {
                    if (now - file.timestamp > MAX_AGE) {
                        try {
                            const fileRef = storage.refFromURL(file.url);
                            await fileRef.delete();
                        } catch (e) {
                            console.warn('Could not delete old file from storage', e);
                        }
                        filesRef.child(key).remove();
                        hasDeletions = true;
                    }
                }
                if (hasDeletions) return; // DB update will trigger re-render
            }
            renderFiles(snapshot.val());
        });

        // Listen for real-time changes
        roomRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const now = Date.now();
                const age = now - (data.updatedAt || now);
                const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in ms
                
                if (data.updatedAt && age > MAX_AGE) {
                    if (data.code !== '') {
                        roomRef.update({
                            code: '',
                            language: 'auto',
                            updatedAt: firebase.database.ServerValue.TIMESTAMP
                        });
                        return; // return so the next event updates the UI
                    }
                }

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
            } else {
                // Room is empty, clear the local editor
                isRemoteUpdate = true;
                codeInput.value = '';
                langSelect.value = 'auto';
                updateLineNumbers();
                updateStats();
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

    // --- Auto Save to LocalStorage ---
    
    const LOCAL_KEYS = {
        DATA: 'codedrop_autosave',
        TIME: 'codedrop_autosave_time'
    };

    function saveLocal() {
        if (currentRoom) return; // Do not auto-save if in a room
        
        const code = codeInput.value;
        if (!code.trim()) {
            localStorage.removeItem(LOCAL_KEYS.DATA);
            localStorage.removeItem(LOCAL_KEYS.TIME);
            return;
        }

        const data = {
            code: code,
            language: langSelect.value
        };
        localStorage.setItem(LOCAL_KEYS.DATA, JSON.stringify(data));
        localStorage.setItem(LOCAL_KEYS.TIME, Date.now());
    }

    function loadLocal() {
        const timeStr = localStorage.getItem(LOCAL_KEYS.TIME);
        if (!timeStr) return false;

        const age = Date.now() - parseInt(timeStr, 10);
        const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in ms

        if (age > MAX_AGE) {
            // Expired, clear it
            localStorage.removeItem(LOCAL_KEYS.DATA);
            localStorage.removeItem(LOCAL_KEYS.TIME);
            return false;
        }

        const dataStr = localStorage.getItem(LOCAL_KEYS.DATA);
        if (dataStr) {
            try {
                const data = JSON.parse(dataStr);
                codeInput.value = data.code || '';
                langSelect.value = data.language || 'auto';
                return true;
            } catch (e) {
                console.error('Error parsing local storage');
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
        editorPane.classList.remove('active-pane');
        previewPane.classList.remove('active-pane');
        if (filesPane) filesPane.classList.remove('active-pane');
        
        btnEdit.classList.remove('active');
        btnPreview.classList.remove('active');
        if (btnFiles) btnFiles.classList.remove('active');

        if (mode === 'edit') {
            editorPane.classList.add('active-pane');
            btnEdit.classList.add('active');
        } else if (mode === 'preview') {
            highlightCode();
            previewPane.classList.add('active-pane');
            btnPreview.classList.add('active');
        } else if (mode === 'files' && filesPane) {
            filesPane.classList.add('active-pane');
            btnFiles.classList.add('active');
        }
    }

    // --- File Upload & Rendering ---

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function renderFiles(filesObj) {
        if (!filesList) return;
        if (!filesObj) {
            filesList.innerHTML = '<div class="empty-state">No files shared in this room yet.</div>';
            return;
        }

        filesList.innerHTML = '';
        const files = Object.values(filesObj).sort((a, b) => b.timestamp - a.timestamp);
        
        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card';
            
            const timeStr = new Date(file.timestamp).toLocaleTimeString();
            const safeUrl = escapeHTML(file.url);
            
            card.innerHTML = 
                '<div class="file-info">' +
                    '<span class="file-icon">📄</span>' +
                    '<div class="file-details">' +
                        '<span class="file-name">' + escapeHTML(file.name) + '</span>' +
                        '<span class="file-meta">' + formatBytes(file.size) + ' • ' + timeStr + '</span>' +
                    '</div>' +
                '</div>' +
                '<a href="' + safeUrl + '" target="_blank" download class="file-action" title="Download">' +
                    '⬇️' +
                '</a>';
            filesList.appendChild(card);
        });
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    if (fileUpload) {
        fileUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !currentRoom) return;

            if (!storage) {
                showToast('Storage not configured!', 'danger');
                return;
            }

            const btnContainer = fileUpload.parentElement;
            const originalText = uploadBtnLabel.textContent;
            
            try {
                uploadBtnLabel.textContent = '⏳ Uploading...';
                btnContainer.classList.add('uploading');

                const timestamp = Date.now();
                const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const filePath = 'rooms/' + currentRoom + '/' + timestamp + '_' + safeName;
                
                const fileRef = storage.ref().child(filePath);
                await fileRef.put(file);
                const downloadUrl = await fileRef.getDownloadURL();

                await filesRef.push({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    url: downloadUrl,
                    timestamp: timestamp
                });

                showToast('✅ File uploaded!');
                fileUpload.value = ''; // Reset
            } catch (error) {
                console.error('Upload failed', error);
                showToast('❌ Upload failed: ' + error.message, 'danger');
            } finally {
                uploadBtnLabel.textContent = originalText;
                btnContainer.classList.remove('uploading');
            }
        });
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
        
        // Also clear local storage
        localStorage.removeItem(LOCAL_KEYS.DATA);
        localStorage.removeItem(LOCAL_KEYS.TIME);
        
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
        saveLocal();
    });

    codeInput.addEventListener('scroll', syncScroll);
    codeInput.addEventListener('keydown', handleTab);

    btnShare.addEventListener('click', shareCode);
    btnCopy.addEventListener('click', copyCode);

    btnClear.addEventListener('click', clearAll);
    fabClear.addEventListener('click', clearAll);

    btnEdit.addEventListener('click', () => switchMode('edit'));
    btnPreview.addEventListener('click', () => switchMode('preview'));
    if (btnFiles) btnFiles.addEventListener('click', () => switchMode('files'));

    langSelect.addEventListener('change', () => {
        syncToFirebase();
        saveLocal();
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
        
        // If not joining a room, try to load offline saved data
        if (loadLocal()) {
            updateLineNumbers();
            updateStats();
            showToast('💾 Restored unsaved code');
        }
    }
})();
