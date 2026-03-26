import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Lock, User } from 'lucide-react';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode]         = useState('login');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!nickname.trim() || !password.trim()) { setError('닉네임과 비밀번호를 입력해주세요.'); return; }
    if (password.length < 6) { setError('비밀번호는 최소 6자 이상이어야 합니다.'); return; }
    setLoading(true);
    try {
      if (mode === 'login') await login(nickname.trim(), password);
      else await register(nickname.trim(), password);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('Invalid login credentials')) setError('닉네임 또는 비밀번호가 올바르지 않습니다.');
      else if (msg.includes('already registered'))   setError('이미 사용 중인 닉네임입니다.');
      else setError(msg || '오류가 발생했습니다. 다시 시도해주세요.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 overflow-hidden">

      {/* ── 배경 빛 효과 (6, 8번) ── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* 중앙 메인 글로우 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-600/10 blur-[120px]" />
        {/* 보조 글로우 — 우상단 */}
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-brand-500/15 blur-[100px]" />
        {/* 보조 글로우 — 좌하단 */}
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-violet-700/15 blur-[100px]" />
        {/* 카드 뒤 집중 글로우 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-64 rounded-full bg-brand-600/8 blur-[60px]" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* 로고 */}
        <div className="text-center mb-10">
          <h1 className="text-6xl font-bold tracking-tight text-white drop-shadow-lg">
            HWADAM
          </h1>
        </div>

        {/* 카드 주변 ambient glow */}
        <div className="absolute -inset-4 rounded-3xl bg-brand-600/8 blur-2xl pointer-events-none" />
        <div className="absolute -inset-8 rounded-3xl bg-violet-700/6 blur-3xl pointer-events-none" />

        {/* 카드 */}
        <div className="relative bg-zinc-900/70 border border-zinc-700/60 rounded-2xl p-8 shadow-2xl backdrop-blur-md ring-1 ring-brand-600/10">
          {/* 탭 */}
          <div className="flex mb-8 bg-zinc-800/60 rounded-xl p-1">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  mode === m ? 'bg-brand-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
              <input
                type="text"
                placeholder="닉네임"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className="w-full bg-zinc-800/80 border border-zinc-700 focus:border-brand-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="비밀번호 (최소 6자)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-800/80 border border-zinc-700 focus:border-brand-500 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
              />
              <button type="button" onClick={() => setShowPw((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-red-400 text-xs px-1 animate-fade-in">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors duration-200 text-sm mt-2">
              {loading ? '처리 중...' : mode === 'login' ? '입장하기' : '가입하기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
