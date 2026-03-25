import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { requestNotificationPermission, onForegroundMessage, revokeFcmToken } from '../utils/fcm';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifEnabled, setNotifEnabled] = useState(() =>
    localStorage.getItem('hwadam-notif') !== 'false'
  );
  const [fcmToken, setFcmToken] = useState(null);
  const unsubRef = useRef(null);

  // FCM 초기화
  useEffect(() => {
    if (!user || !notifEnabled) return;

    requestNotificationPermission(user.id).then((token) => {
      setFcmToken(token);
    });

    onForegroundMessage((msg) => {
      // 포그라운드 수신 시 인앱 토스트는 Toast 컴포넌트에서 별도 처리
      window.dispatchEvent(new CustomEvent('hwadam:push', { detail: msg }));
    }).then((unsub) => {
      unsubRef.current = unsub;
    });

    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, [user, notifEnabled]);

  async function toggleNotifications() {
    const next = !notifEnabled;
    setNotifEnabled(next);
    localStorage.setItem('hwadam-notif', String(next));

    if (!next && fcmToken) {
      await revokeFcmToken(fcmToken);
      setFcmToken(null);
    } else if (next && user) {
      const token = await requestNotificationPermission(user.id);
      setFcmToken(token);
    }
  }

  return (
    <NotificationContext.Provider value={{ notifEnabled, fcmToken, toggleNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
