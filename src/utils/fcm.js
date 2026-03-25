import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { upsertFcmToken, deleteFcmToken } from './supabaseClient';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Firebase 앱 중복 초기화 방지
const firebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

let messaging = null;

/**
 * FCM 지원 여부 확인 후 messaging 인스턴스 반환
 */
async function getMessagingInstance() {
  if (messaging) return messaging;
  const supported = await isSupported();
  if (!supported) return null;
  messaging = getMessaging(firebaseApp);
  return messaging;
}

/**
 * 알림 권한 요청 후 FCM 토큰 발급 및 Supabase 저장
 * @param {string} userId
 * @returns {Promise<string|null>} FCM token
 */
export async function requestNotificationPermission(userId) {
  try {
    const msg = await getMessagingInstance();
    if (!msg) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const token = await getToken(msg, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    if (token) {
      await upsertFcmToken(userId, token);
    }
    return token;
  } catch (err) {
    console.warn('[FCM] 토큰 발급 실패:', err);
    return null;
  }
}

/**
 * 포그라운드 메시지 수신 리스너 등록
 * @param {function} callback - { title, body, data } 수신 시 호출
 * @returns {function} unsubscribe
 */
export async function onForegroundMessage(callback) {
  const msg = await getMessagingInstance();
  if (!msg) return () => {};

  return onMessage(msg, (payload) => {
    const { notification, data } = payload;
    callback({
      title: notification?.title ?? 'HWADAM',
      body:  notification?.body  ?? '',
      data:  data ?? {},
    });
  });
}

/**
 * FCM 토큰 삭제 (알림 비활성화 시)
 * @param {string} token
 */
export async function revokeFcmToken(token) {
  if (!token) return;
  try {
    await deleteFcmToken(token);
  } catch (err) {
    console.warn('[FCM] 토큰 삭제 실패:', err);
  }
}
