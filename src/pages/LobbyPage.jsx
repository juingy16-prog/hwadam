import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getOrCreateRoom, supabase } from '../utils/supabaseClient';
import { Bell, BellOff, LogOut, X } from 'lucide-react';
import { EMOJI_LIST, EMOJI_COLORS } from '../constants/emoji';

const RECENT_KEY = 'hwadam-recent-rooms';
const EMOJI_KEY  = 'hwadam-profile-emoji';
const MAX_RECENT = 5;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}
function saveRecent(list) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export default function LobbyPage() {
  const { user, profile, logout } = useAuth();
  const { notifEnabled, toggleNotifications } = useNotification();
  const navigate = useNavigate();

  const [code, setCode]         = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [recentRooms, setRecentRooms] = useState(loadRecent);

  // 프로필 이모티콘 (1 로비 선택 → 2 채팅방 말풍선 색에 반영)
  const [profileEmoji, setProfileEmoji] = useState(
    () => localStorage.getItem(EMOJI_KEY) || null
  );
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // 이모티콘 변경 시 localStorage + profiles.avatar_url 동기화
  useEffect(() => {
    if (profileEmoji) localStorage.setItem(EMOJI_KEY, profileEmoji);
    else localStorage.removeItem(EMOJI_KEY);

    const userId = profile?.id ?? user?.id;
    if (!userId) return;
    // avatar_url 컬럼에 이모티콘 문자 저장 (상대방 아바타로 표시됨)
    // .then() 없이 호출하면 요청이 실제로 전송되지 않으므로 반드시 실행
    supabase
      .from('profiles')
      .update({ avatar_url: profileEmoji ?? null })
      .eq('id', userId)
      .then(() => {});
  }, [profileEmoji, profile?.id, user?.id]);

  async function enterRoom(roomCode) {
    const trimmed = roomCode.trim();
    if (!trimmed || trimmed.length < 2) { setError('최소 2자 이상의 코드를 입력하세요.'); return; }
    setError('');
    setLoading(true);
    try {
      const userId = profile?.id ?? user?.id;
      if (!userId) { setError('사용자 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.'); setLoading(false); return; }
      const room = await getOrCreateRoom(trimmed, userId);

      // 최근 방 목록 갱신
      const updated = [
        { code: trimmed, roomId: room.id, enteredAt: Date.now() },
        ...loadRecent().filter((r) => r.code !== trimmed),
      ].slice(0, MAX_RECENT);
      setRecentRooms(updated);
      saveRecent(updated);

      navigate(`/room/${room.id}`, { state: { code: trimmed, profileEmoji } });
    } catch (err) {
      setError(err.message || '방 입장에 실패했습니다.');
    } finally { setLoading(false); }
  }

  function handleEnter(e) { e.preventDefault(); enterRoom(code); }

  function removeRecent(roomCode, e) {
    e.stopPropagation();
    const updated = recentRooms.filter((r) => r.code !== roomCode);
    setRecentRooms(updated);
    saveRecent(updated);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* 헤더 (6번 — 영문만, 4번 — 다크/라이트 버튼 제거) */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
        <h1 className="text-2xl font-bold tracking-tight text-white">HWADAM</h1>
        <div className="flex items-center gap-3">
          <button onClick={toggleNotifications} title={notifEnabled ? '알림 끄기' : '알림 켜기'}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            {notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
          <button onClick={logout}
            className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {/* 인사말 */}
        <div className="text-center space-y-1 animate-fade-in">
          <p className="text-zinc-400 text-sm">반가워요,</p>
          <p className="text-2xl font-semibold text-white">{profile?.nickname}</p>
        </div>

        {/* 채팅방 입장 카드 */}
        <div className="w-full max-w-sm bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 shadow-xl backdrop-blur-sm animate-slide-up">

          {/* 2번 — 이모티콘 선택 영역 (기존 # 아이콘 자리) */}
          <div className="text-center mb-6">
            <p className="text-xs text-zinc-500 mb-2">프로필 선택</p>
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((p) => !p)}
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 hover:bg-brand-600/30 transition-colors mb-3 text-3xl"
              title="말풍선 색상 이모티콘 선택"
            >
              {profileEmoji ?? '🎨'}
            </button>

            {/* 이모티콘 피커 */}
            {emojiPickerOpen && (
              <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 flex flex-wrap justify-center gap-2 mb-3 animate-slide-up">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { setProfileEmoji(emoji); setEmojiPickerOpen(false); }}
                    className={`text-2xl transition-transform hover:scale-125 rounded p-0.5 ${
                      profileEmoji === emoji ? 'ring-2 ring-brand-500 scale-110' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setProfileEmoji(null); setEmojiPickerOpen(false); }}
                  className="text-xs text-zinc-400 hover:text-white w-full mt-1"
                >
                  초기화
                </button>
              </div>
            )}

            <h2 className="text-lg font-semibold">채팅방 입장</h2>
            <p className="text-zinc-500 text-xs mt-1">비밀 코드를 입력하면 방이 생성되거나 입장됩니다</p>
          </div>

          <form onSubmit={handleEnter} className="space-y-4">
            <input
              type="text"
              placeholder="비밀 코드 입력 (영문·한글·숫자)"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-brand-500 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors text-center tracking-widest font-mono"
            />
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors text-sm">
              {loading ? '입장 중...' : '입장하기'}
            </button>
          </form>
        </div>

        {/* 1번 — 최근 입장한 방 목록 */}
        {recentRooms.length > 0 && (
          <div className="w-full max-w-sm animate-fade-in">
            <p className="text-xs text-zinc-500 mb-2 px-1">최근 입장한 방</p>
            <div className="flex flex-col gap-2">
              {recentRooms.map((r) => (
                <div
                  key={r.code}
                  className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-brand-600/50 hover:bg-zinc-800/60 transition-colors group"
                  onClick={() => enterRoom(r.code)}
                >
                  <span className="text-lg">🔑</span>
                  <span className="flex-1 font-mono text-sm text-zinc-200 tracking-widest truncate">
                    {r.code}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => removeRecent(r.code, e)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all p-1 rounded"
                    title="삭제"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
