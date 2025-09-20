// Firebase SDKをインポート
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Firebase設定
firebase.initializeApp({
  apiKey: "AIzaSyC16_eHOmV0nVtabM_9ce4mdwnMJ8b_Ksw",
  authDomain: "tunagaruyo-e10ba.firebaseapp.com",
  databaseURL: "https://tunagaruyo-e10ba-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "tunagaruyo-e10ba",
  storageBucket: "tunagaruyo-e10ba.firebasestorage.app",
  messagingSenderId: "433962055615",
  appId: "1:433962055615:web:5022d493481725cd8e930a"
});

const messaging = firebase.messaging();

// バックグラウンドメッセージハンドラー
messaging.onBackgroundMessage((payload) => {
  console.log('バックグラウンドメッセージ受信:', payload);
  
  const notificationTitle = payload.notification.title || '着信';
  const notificationOptions = {
    body: payload.notification.body || '新しい着信があります',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'incoming-call',
    requireInteraction: true,
    actions: [
      { action: 'answer', title: '応答' },
      { action: 'decline', title: '拒否' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 通知クリックイベント
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'answer') {
    // 応答ボタンがクリックされた場合
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'decline') {
    // 拒否ボタンがクリックされた場合
    // 何もしない
  } else {
    // 通知本体がクリックされた場合
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
