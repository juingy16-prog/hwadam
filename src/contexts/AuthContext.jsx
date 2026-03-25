import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, signIn, signUp, signOut } from '../utils/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // auth.users row
  const [profile, setProfile] = useState(null);   // public.profiles row
  const [loading, setLoading] = useState(true);

  // 프로필 조회 — 없으면 자동 생성 (스키마 적용 전 가입자 대응)
  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) { setProfile(data); return; }

    // 프로필 행이 없으면 auth.users 메타데이터로 직접 생성
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const nickname =
      authUser?.user_metadata?.nickname ||
      authUser?.email?.split('@')[0] ||
      `user_${userId.slice(0, 6)}`;

    const { data: created } = await supabase
      .from('profiles')
      .insert({ id: userId, nickname })
      .select()
      .single();

    setProfile(created ?? null);
  }

  useEffect(() => {
    // 초기 세션 복원
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    // 세션 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) fetchProfile(session.user.id);
        else setProfile(null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function login(nickname, password) {
    const data = await signIn(nickname, password);
    return data;
  }

  async function register(nickname, password) {
    const data = await signUp(nickname, password);
    return data;
  }

  async function logout() {
    await signOut();
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
