importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC16_eHOmV0nVtabM_9ce4mdwnMJ8b_Ksw",
  authDomain: "tunagaruyo-e10ba.firebaseapp.com",
  projectId: "tunagaruyo-e10ba",
  storageBucket: "tunagaruyo-e10ba.firebasestorage.app",
  messagingSenderId: "433962055615",
  appId: "1:433962055615:web:5022d493481725cd8e930a"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'incoming-call',
    requireInteraction: true,
    actions: [
      { action: 'answer', title: '応答' },
      { action: 'decline', title: '拒否' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
