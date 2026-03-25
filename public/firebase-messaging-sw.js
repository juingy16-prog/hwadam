// Firebase Cloud Messaging Service Worker
// 백그라운드 푸시 알림 처리

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyCwMVOT9HPHgMRk6QTaa-5ihWS7_610dFk',
  authDomain:        'hwadam-d756a.firebaseapp.com',
  projectId:         'hwadam-d756a',
  storageBucket:     'hwadam-d756a.firebasestorage.app',
  messagingSenderId: '945811643179',
  appId:             '1:945811643179:web:1d5d1af8bc35e9bdc6036e',
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신 처리
messaging.onBackgroundMessage((payload) => {
  const { notification, data } = payload;
  const title = notification?.title ?? 'HWADAM';
  const body  = notification?.body  ?? '';

  self.registration.showNotification(title, {
    body,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag:   data?.roomId ?? 'hwadam',
    data:  { url: data?.roomId ? `/room/${data.roomId}` : '/' },
    vibrate: [100, 50, 100],
  });
});

// 알림 클릭 시 해당 채팅방으로 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(url) && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
