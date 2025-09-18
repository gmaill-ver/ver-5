// Firebase設定
const firebaseConfig = {
    apiKey: "AIzaSyC16_eHOmV0nVtabM_9ce4mdwnMJ8b_Ksw",
    authDomain: "tunagaruyo-e10ba.firebaseapp.com",
    databaseURL: "https://tunagaruyo-e10ba-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "tunagaruyo-e10ba",
    storageBucket: "tunagaruyo-e10ba.firebasestorage.app",
    messagingSenderId: "433962055615",
    appId: "1:433962055615:web:5022d493481725cd8e930a",
    measurementId: "G-M5J1RKNN1R"
};

// グローバル変数
let userId = null;
let userName = null;
let database = null;
let messaging = null;
let localStream = null;
let peerConnection = null;
let mediaRecorder = null;
let recordedChunks = [];
let callTimer = null;
let callStartTime = null;
let currentCall = null;
let contacts = [];
let incomingOffer = null;
let iceCandidatesQueue = [];
let offerListener = null;
let answerListener = null;
let iceListener = null;
let callTimeout = null;
let deferredPrompt = null;

// Firebase初期化
try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    messaging = firebase.messaging();
    
    // 接続状態監視
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
            console.log('🔥 Firebase接続成功！');
            updateStatus('online');
        } else {
            console.log('🔥 Firebase接続失敗');
            updateStatus('offline');
        }
    });
    
} catch (error) {
    console.error('Firebase初期化エラー:', error);
    updateStatus('offline');
}

// ステータス更新
function updateStatus(status) {
    const indicator = document.getElementById('statusIndicator');
    if (status === 'online') {
        indicator.textContent = '🟢 オンライン';
        indicator.className = 'status-indicator online';
    } else {
        indicator.textContent = '🔴 オフライン';
        indicator.className = 'status-indicator offline';
    }
}

// ユーザーID生成
function generateUserId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// タブ切り替え
function showTab(tabName) {
    // すべてのタブコンテンツを非表示
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // すべてのナビタブを非アクティブ
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 選択されたタブを表示
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    // 対応するナビタブをアクティブに
    const navTabs = document.querySelectorAll('.nav-tab');
    if (tabName === 'home') navTabs[0].classList.add('active');
    else if (tabName === 'contacts') navTabs[1].classList.add('active');
    else if (tabName === 'settings') navTabs[2].classList.add('active');
    
    // 連絡先タブの場合、リストを更新
    if (tabName === 'contacts') {
        renderContactsList();
    }
}

// 初期化
async function init() {
    // ユーザーID設定
    userId = localStorage.getItem('userId');
    if (!userId) {
        userId = generateUserId();
        localStorage.setItem('userId', userId);
    }
    document.getElementById('userId').textContent = userId;

    // ユーザー名設定
    userName = localStorage.getItem('userName') || 'ユーザー';
    document.getElementById('userName').value = userName;

    // 保存された連絡先を読み込み
    loadContacts();

    // Firebase リスナー設定
    if (database) {
        // 自分のプレゼンス設定
        const presenceRef = database.ref(`presence/${userId}`);
        presenceRef.set({
            online: true,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
        presenceRef.onDisconnect().set({
            online: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });

        // 着信リスナー
        listenForCalls();
        
        // FCMトークン取得（バックグラウンド通知用）
        setupFCM();
    }

    // PWAインストールプロンプト
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('installBtn').style.display = 'block';
    });

    // URLパラメータからクイックコール処理
    handleQuickCall();

    // ページ離脱時のクリーンアップ
    window.addEventListener('beforeunload', () => {
        if (currentCall) {
            endCall();
        }
    });
}

// FCMセットアップ
async function setupFCM() {
    try {
        // 通知権限確認
        if ('Notification' in window && Notification.permission === 'granted') {
            // FCMトークン取得
            const token = await messaging.getToken();
            if (token) {
                // トークンをFirebaseに保存
                await database.ref(`users/${userId}/fcmToken`).set(token);
                console.log('FCMトークン取得成功:', token);
            }
        }
        
        // フォアグラウンド通知ハンドリング
        messaging.onMessage((payload) => {
            console.log('Message received. ', payload);
            if (payload.notification) {
                showNotification(payload.notification.title + ': ' + payload.notification.body);
            }
        });
    } catch (error) {
        console.error('FCMセットアップエラー:', error);
    }
}

// クイックコール処理（URLパラメータから直接発信）
function handleQuickCall() {
    const params = new URLSearchParams(window.location.search);
    const callId = params.get('call');
    
    if (callId) {
        // 連絡先から対象を探す
        const contact = contacts.find(c => c.id === callId);
        if (contact) {
            setTimeout(() => {
                startCall(contact);
            }, 1000);
        }
    }
}

// ユーザー名保存
function saveUserName() {
    const nameInput = document.getElementById('userName');
    userName = nameInput.value.trim() || 'ユーザー';
    localStorage.setItem('userName', userName);
    
    // Firebaseにも保存
    if (database && userId) {
        database.ref(`users/${userId}/name`).set(userName);
    }
    
    showNotification('名前を保存しました 👤');
}

// 連絡先を保存
function saveContacts() {
    localStorage.setItem('contacts', JSON.stringify(contacts));
    sessionStorage.setItem('contacts', JSON.stringify(contacts));
    
    // Firebaseにもバックアップ保存
    if (database && userId) {
        database.ref(`users/${userId}/contacts`).set(contacts).catch(error => {
            console.log('連絡先のクラウド保存に失敗:', error);
        });
    }
}

// 連絡先を復元
async function loadContacts() {
    // まずローカルストレージから
    let savedContacts = localStorage.getItem('contacts');
    
    // なければセッションストレージから
    if (!savedContacts) {
        savedContacts = sessionStorage.getItem('contacts');
    }
    
    // それでもなければFirebaseから復元を試行
    if (!savedContacts && database && userId) {
        try {
            const snapshot = await database.ref(`users/${userId}/contacts`).once('value');
            if (snapshot.exists()) {
                savedContacts = JSON.stringify(snapshot.val());
                console.log('Firebaseから連絡先を復元しました');
            }
        } catch (error) {
            console.log('Firebaseからの連絡先復元に失敗:', error);
        }
    }
    
    if (savedContacts) {
        contacts = JSON.parse(savedContacts);
        renderContacts();
        updateContactCount();
    }
}

// 連絡先数更新
function updateContactCount() {
    const countElement = document.getElementById('contactCount');
    if (countElement) {
        countElement.textContent = `${contacts.length}件`;
    }
}

// ユーザーIDコピー
function copyUserId() {
    navigator.clipboard.writeText(userId).then(() => {
        showNotification('IDをコピーしました！ 📋');
    });
}

// 連絡先追加
function addContact() {
    const name = document.getElementById('contactName').value.trim();
    const contactId = document.getElementById('contactId').value.trim().toUpperCase();

    if (!name || !contactId) {
        showNotification('入力してください 😅', 'error');
        return;
    }

    if (contactId === userId) {
        showNotification('自分は追加できません 😂', 'error');
        return;
    }

    if (contactId.length !== 8) {
        showNotification('IDは8文字です 📝', 'error');
        return;
    }

    // 重複チェック
    if (contacts.some(c => c.id === contactId)) {
        showNotification('すでに追加済みです 🤔', 'error');
        return;
    }

    contacts.push({ 
        name, 
        id: contactId,
        addedAt: Date.now()
    });
    
    saveContacts();
    
    document.getElementById('contactName').value = '';
    document.getElementById('contactId').value = '';
    
    renderContacts();
    updateContactCount();
    showNotification(`${name}を追加しました！ 🎉`);
    
    // ショートカットリンクを案内
    const quickCallUrl = `${window.location.origin}${window.location.pathname}?call=${contactId}`;
    console.log(`クイックコールURL: ${quickCallUrl}`);
}

// 連絡先削除
function deleteContact(contactId) {
    const contact = contacts.find(c => c.id === contactId);
    if (contact && confirm(`${contact.name}を削除しますか？`)) {
        contacts = contacts.filter(c => c.id !== contactId);
        saveContacts();
        renderContacts();
        renderContactsList();
        updateContactCount();
        showNotification(`${contact.name}を削除しました 🗑️`);
    }
}

// 連絡先表示（ホーム画面）
function renderContacts() {
    const grid = document.getElementById('favoritesGrid');
    
    if (contacts.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">📱</div>
                <p>友達を追加してワンタップ通話！</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';
    contacts.forEach((contact) => {
        const card = document.createElement('div');
        card.className = 'contact-card';
        card.onclick = () => startCall(contact);
        card.innerHTML = `
            <div class="contact-icon">👤</div>
            <div class="contact-name">${contact.name}</div>
            <div class="contact-status">タップで発信</div>
        `;
        grid.appendChild(card);
    });
}

// 連絡先リスト表示（連絡先タブ）
function renderContactsList() {
    const listContainer = document.getElementById('contactsList');
    
    if (contacts.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>まだ連絡先がありません</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = '';
    contacts.forEach((contact) => {
        const item = document.createElement('div');
        item.className = 'contact-list-item';
        item.innerHTML = `
            <div class="contact-info" onclick="startCall('${contact.id}', '${contact.name}')">
                <div class="contact-avatar">👤</div>
                <div class="contact-details">
                    <div class="contact-list-name">${contact.name}</div>
                    <div class="contact-list-id">${contact.id}</div>
                </div>
            </div>
            <div class="contact-actions">
                <button class="call-btn" onclick="event.stopPropagation(); startCall({id: '${contact.id}', name: '${contact.name}'})">📞</button>
                <button class="delete-btn" onclick="event.stopPropagation(); deleteContact('${contact.id}')">🗑️</button>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

// 連絡先エクスポート
function exportContacts() {
    if (contacts.length === 0) {
        showNotification('エクスポートする連絡先がありません 📋', 'error');
        return;
    }
    
    const dataStr = JSON.stringify(contacts, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `contacts_${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showNotification('連絡先をエクスポートしました 💾');
}

// 連絡先インポート
function importContacts(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedContacts = JSON.parse(e.target.result);
            if (Array.isArray(importedContacts)) {
                // 既存の連絡先とマージ
                importedContacts.forEach(newContact => {
                    if (!contacts.some(c => c.id === newContact.id)) {
                        contacts.push(newContact);
                    }
                });
                saveContacts();
                renderContacts();
                renderContactsList();
                updateContactCount();
                showNotification(`${importedContacts.length}件の連絡先をインポートしました 📥`);
            }
        } catch (error) {
            showNotification('インポートに失敗しました 😢', 'error');
        }
    };
    reader.readAsText(file);
}

// 通知許可リクエスト
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification('通知が有効になりました！ 🔔');
                setupFCM();
            } else {
                showNotification('通知は無効のままです 🔕', 'error');
            }
        });
    } else if (Notification.permission === 'granted') {
        showNotification('通知はすでに有効です 🔔');
    } else {
        showNotification('通知が拒否されています 🔕', 'error');
    }
}

// PWAインストール
async function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            showNotification('アプリをインストールしました！ 📱');
        }
        deferredPrompt = null;
        document.getElementById('installBtn').style.display = 'none';
    }
}

// WebRTC設定
function createPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    peerConnection = new RTCPeerConnection(configuration);

    // ローカルストリームを追加
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // リモートストリーム受信
    peerConnection.ontrack = (event) => {
        console.log('リモートストリーム受信');
        const remoteAudio = document.getElementById('remoteAudio');
        remoteAudio.srcObject = event.streams[0];
    };

    // ICE候補
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentCall) {
            console.log('ICE候補送信');
            database.ref(`calls/${currentCall.id}/ice-candidates/${userId}`).push({
                candidate: event.candidate.toJSON(),
                timestamp: Date.now()
            });
        }
    };

    // 接続状態監視
    peerConnection.onconnectionstatechange = () => {
        console.log('接続状態:', peerConnection.connectionState);
        const statusElement = document.getElementById('callStatus');
        
        switch (peerConnection.connectionState) {
            case 'connecting':
                statusElement.textContent = '接続中...';
                break;
            case 'connected':
                statusElement.textContent = '通話中';
                startCallTimer();
                showNotification('通話接続完了！ 🎉');
                if (callTimeout) {
                    clearTimeout(callTimeout);
                    callTimeout = null;
                }
                break;
            case 'disconnected':
                statusElement.textContent = '切断中...';
                break;
            case 'failed':
                statusElement.textContent = '接続失敗';
                showNotification('接続失敗 😢', 'error');
                setTimeout(() => endCall(), 2000);
                break;
            case 'closed':
                statusElement.textContent = '通話終了';
                break;
        }
    };

    return peerConnection;
}

// 通話開始（発信）
async function startCall(contact) {
    if (currentCall) {
        showNotification('すでに通話中です 📞', 'error');
        return;
    }

    currentCall = contact;
    
    // 通話画面表示
    document.getElementById('callPanel').classList.add('active');
    document.getElementById('callingName').textContent = `${contact.name}`;
    document.getElementById('callStatus').textContent = '呼び出し中...';

    try {
        // メディア取得
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
        });

        // WebRTC接続を開始
        createPeerConnection();

        // オファー作成
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Firebaseにオファーを送信
        const callRef = database.ref(`calls/${contact.id}/offer`);
        await callRef.set({
            from: userId,
            fromName: userName,
            offer: {
                type: offer.type,
                sdp: offer.sdp
            },
            timestamp: Date.now()
        });

        // プッシュ通知送信（相手がオフラインの場合）
        sendCallNotification(contact.id);

        console.log('オファー送信完了');
        showNotification(`${contact.name}に発信中... 📞`);

        // アンサー待機
        waitForAnswer(contact.id);

        // 30秒でタイムアウト
        callTimeout = setTimeout(() => {
            if (currentCall && peerConnection && peerConnection.connectionState !== 'connected') {
                showNotification('応答がありません ⏰', 'error');
                endCall();
            }
        }, 30000);

    } catch (error) {
        console.error('通話開始エラー:', error);
        showNotification('マイクへのアクセスが必要です 🎤', 'error');
        endCall();
    }
}

// プッシュ通知送信
async function sendCallNotification(targetId) {
    try {
        // 相手のFCMトークンを取得
        const tokenSnapshot = await database.ref(`users/${targetId}/fcmToken`).once('value');
        const targetToken = tokenSnapshot.val();
        
        if (targetToken) {
            // Cloud Functionsを通じて通知送信（要実装）
            // ここではFirebaseにフラグを立てる
            await database.ref(`notifications/${targetId}`).push({
                type: 'incoming_call',
                from: userId,
                fromName: userName,
                timestamp: Date.now()
            });
        }
    } catch (error) {
        console.error('通知送信エラー:', error);
    }
}

// アンサー待機
function waitForAnswer(targetId) {
    const answerRef = database.ref(`calls/${userId}/answer`);
    answerListener = answerRef.on('value', async (snapshot) => {
        const data = snapshot.val();
        if (data && peerConnection && peerConnection.currentRemoteDescription === null) {
            console.log('アンサー受信');
            try {
                const answer = new RTCSessionDescription(data.answer);
                await peerConnection.setRemoteDescription(answer);
                
                // ICE候補処理
                processIceCandidates(targetId);
                
                // アンサーを削除
                answerRef.remove();
                
                // キューに溜まったICE候補を処理
                while (iceCandidatesQueue.length > 0) {
                    const candidate = iceCandidatesQueue.shift();
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                        console.log('キューからICE候補追加');
                    } catch (error) {
                        console.error('キューからのICE候補追加エラー:', error);
                    }
                }
            } catch (error) {
                console.error('アンサー処理エラー:', error);
                showNotification('通話接続エラー 😢', 'error');
                endCall();
            }
        }
    });
}

// 着信リスナー
function listenForCalls() {
    const offerRef = database.ref(`calls/${userId}/offer`);
    offerListener = offerRef.on('value', async (snapshot) => {
        const data = snapshot.val();
        if (data && !currentCall) {
            console.log('着信あり:', data);
            incomingOffer = data;
            
            // 着信表示
            document.getElementById('incomingCall').classList.add('active');
            document.getElementById('callerName').textContent = `${data.fromName || data.from}から着信`;
            
            // 通知
            if (Notification.permission === 'granted') {
                new Notification('着信', {
                    body: `${data.fromName || data.from}から着信があります`,
                    icon: '📞',
                    tag: 'incoming-call',
                    requireInteraction: true
                });
            }
            
            // 着信音
            playRingtone();
        }
    });
}

// 着信応答
async function acceptCall() {
    if (!incomingOffer) return;

    document.getElementById('incomingCall').classList.remove('active');
    
    // 通話相手を設定
    currentCall = {
        id: incomingOffer.from,
        name: incomingOffer.fromName || incomingOffer.from
    };

    // 通話画面表示
    document.getElementById('callPanel').classList.add('active');
    document.getElementById('callingName').textContent = currentCall.name;
    document.getElementById('callStatus').textContent = '接続中...';

    try {
        // メディア取得
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
        });

        // WebRTC接続
        createPeerConnection();

        // オファー設定
        const offer = new RTCSessionDescription(incomingOffer.offer);
        await peerConnection.setRemoteDescription(offer);

        // アンサー作成
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // アンサー送信
        await database.ref(`calls/${incomingOffer.from}/answer`).set({
            from: userId,
            answer: {
                type: answer.type,
                sdp: answer.sdp
            },
            timestamp: Date.now()
        });

        // ICE候補処理
        processIceCandidates(incomingOffer.from);

        // オファーを削除
        database.ref(`calls/${userId}/offer`).remove();
        incomingOffer = null;

        console.log('通話応答完了');
        showNotification('通話を開始しました 📞');

    } catch (error) {
        console.error('応答エラー:', error);
        showNotification('通話開始エラー 😢', 'error');
        endCall();
    }
}

// ICE候補処理
function processIceCandidates(peerId) {
    const iceRef = database.ref(`calls/${userId}/ice-candidates/${peerId}`);
    iceListener = iceRef.on('child_added', async (snapshot) => {
        const data = snapshot.val();
        if (data && peerConnection) {
            try {
                if (peerConnection.currentRemoteDescription) {
                    const candidate = new RTCIceCandidate(data.candidate);
                    await peerConnection.addIceCandidate(candidate);
                    console.log('ICE候補追加');
                } else {
                    iceCandidatesQueue.push(data.candidate);
                    console.log('ICE候補をキューに追加');
                }
            } catch (error) {
                console.error('ICE候補追加エラー:', error);
            }
        }
    });
}

// 着信拒否
function rejectCall() {
    document.getElementById('incomingCall').classList.remove('active');
    
    if (incomingOffer) {
        database.ref(`calls/${userId}/offer`).remove();
        incomingOffer = null;
    }
    
    showNotification('着信を拒否しました ❌');
}

// 通話タイマー
function startCallTimer() {
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('callTimer').textContent = `${minutes}:${seconds}`;
    }, 1000);
}

// ミュート切り替え
function toggleMute() {
    const btn = document.getElementById('muteBtn');
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            btn.classList.toggle('active');
            showNotification(audioTrack.enabled ? 'ミュート解除 🎤' : 'ミュート 🔇');
        }
    }
}

// スピーカー切り替え
function toggleSpeaker() {
    const btn = document.getElementById('speakerBtn');
    btn.classList.toggle('active');
    const remoteAudio = document.getElementById('remoteAudio');
    remoteAudio.volume = btn.classList.contains('active') ? 1.0 : 0.5;
    showNotification(btn.classList.contains('active') ? 'スピーカーON 🔊' : 'スピーカーOFF 🔈');
}

// 録音切り替え
function toggleRecord() {
    const btn = document.getElementById('recordBtn');
    
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        startRecording();
        btn.classList.add('active');
        showNotification('録音開始 ⏺️');
    } else {
        stopRecording();
        btn.classList.remove('active');
        showNotification('録音停止 ⏹️');
    }
}

// 録音開始
function startRecording() {
    if (!localStream) return;

    recordedChunks = [];
    const options = { mimeType: 'audio/webm;codecs=opus' };
    
    try {
        mediaRecorder = new MediaRecorder(localStream, options);
    } catch (e) {
        console.error('MediaRecorder作成エラー:', e);
        showNotification('録音機能が利用できません 😢', 'error');
        return;
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording_${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('録音ファイルをダウンロード 💾');
    };

    mediaRecorder.start();
}

// 録音停止
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

// 通話終了
async function endCall() {
    console.log('通話終了処理開始');

    // タイムアウトクリア
    if (callTimeout) {
        clearTimeout(callTimeout);
        callTimeout = null;
    }

    // タイマー停止
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }

    // 録音停止
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        stopRecording();
    }

    // ストリーム停止
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
            console.log('トラック停止:', track.kind);
        });
        localStream = null;
    }

    // WebRTC接続終了
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        console.log('PeerConnection終了');
    }

    // Firebaseリスナークリーンアップ
    if (database) {
        if (offerListener) {
            database.ref(`calls/${userId}/offer`).off('value', offerListener);
            offerListener = null;
        }
        if (answerListener) {
            database.ref(`calls/${userId}/answer`).off('value', answerListener);
            answerListener = null;
        }
        if (iceListener) {
            database.ref(`calls/${userId}/ice-candidates`).off('child_added', iceListener);
            iceListener = null;
        }

        // Firebase データクリーンアップ
        if (currentCall) {
            try {
                await database.ref(`calls/${userId}`).remove();
                await database.ref(`calls/${currentCall.id}`).remove();
                console.log('Firebase通話データクリーンアップ完了');
            } catch (error) {
                console.error('Firebaseクリーンアップエラー:', error);
            }
        }
    }

    // UI更新
    document.getElementById('callPanel').classList.remove('active');
    document.getElementById('incomingCall').classList.remove('active');
    document.getElementById('muteBtn').classList.remove('active');
    document.getElementById('speakerBtn').classList.remove('active');
    document.getElementById('recordBtn').classList.remove('active');
    document.getElementById('callTimer').textContent = '00:00';
    
    // リモートオーディオクリア
    const remoteAudio = document.getElementById('remoteAudio');
    remoteAudio.srcObject = null;
    
    // 変数リセット
    const wasInCall = currentCall !== null;
    currentCall = null;
    incomingOffer = null;
    iceCandidatesQueue = [];
    
    if (wasInCall) {
        showNotification('通話を終了しました 👋');
    }
    
    // 着信リスナーを再開
    if (database && !offerListener) {
        listenForCalls();
    }
    
    console.log('通話終了処理完了');
}

// 着信音
function playRingtone() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 0.2;
        const frequency = 440;
        
        function beep() {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
        }
        
        beep();
        setTimeout(beep, 300);
        setTimeout(beep, 600);
    } catch (error) {
        console.error('着信音再生エラー:', error);
    }
}

// 通知表示
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.background = type === 'error' ? 
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' : 
        'white';
    notification.style.color = type === 'error' ? 'white' : '#333';
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// エラーハンドリング
window.addEventListener('error', (event) => {
    console.error('グローバルエラー:', event.error);
    if (currentCall) {
        showNotification('予期しないエラーが発生しました 😢', 'error');
    }
});

// 未処理のPromise拒否をキャッチ
window.addEventListener('unhandledrejection', (event) => {
    console.error('未処理のPromise拒否:', event.reason);
    event.preventDefault();
});

// 初期化実行
window.addEventListener('load', init);
