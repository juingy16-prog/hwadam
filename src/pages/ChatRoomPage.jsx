import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  fetchMessages, sendMessage, uploadChatImage, supabase,
} from '../utils/supabaseClient';
import MessageBubble from '../components/MessageBubble';
import ImageUploader from '../components/ImageUploader';
import Toast from '../components/Toast';
import { ArrowLeft, Send, EyeOff, Eye, Bell, BellOff, Users } from 'lucide-react';
import { EMOJI_COLORS } from '../constants/emoji';
const DEFAULT_MY_COLOR = '#1e3a5f';
const EMOJI_KEY = 'hwadam-profile-emoji';

export default function ChatRoomPage() {
  const { roomId }  = useParams();
  const { state }   = useLocation();
  const navigate    = useNavigate();
  const { user, profile } = useAuth();
  const { notifEnabled, toggleNotifications } = useNotification();

  const [messages, setMessages]         = useState([]);
  const [text, setText]                 = useState('');
  const [privacyMode, setPrivacyMode]   = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [onlineCount, setOnlineCount]   = useState(1);
  const [toasts, setToasts]             = useState([]);
  const [hasMore, setHasMore]           = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);

  const profileEmoji  = state?.profileEmoji ?? localStorage.getItem(EMOJI_KEY) ?? null;
  const myBubbleColor = EMOJI_COLORS[profileEmoji] ?? DEFAULT_MY_COLOR;

  const bottomRef       = useRef(null);
  const inputRef        = useRef(null);
  const channelRef      = useRef(null);
  const profileCacheRef = useRef({});   // 프로필 캐시 — DB 중복 조회 방지
  const justLoadedMore  = useRef(false); // 이전 메시지 로드 시 스크롤 방지
  const isInitialLoad   = useRef(true);  // 최초 로드 여부
  const oldestTsRef     = useRef(null);  // 페이지네이션 기준 타임스탬프
  const presenceTimer   = useRef(null);  // presence 디바운스

  // ─── 토스트 ────────────────────────────────────────────────
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ─── 최초 메시지 로드 ───────────────────────────────────────
  useEffect(() => {
    isInitialLoad.current = true;
    fetchMessages(roomId)
      .then((msgs) => {
        setMessages(msgs);
        setHasMore(msgs.length >= 60);
        if (msgs.length) oldestTsRef.current = msgs[0].created_at;
        // 프로필 캐시 초기화
        msgs.forEach((m) => { if (m.profiles?.id) profileCacheRef.current[m.profiles.id] = m.profiles; });
      })
      .catch(() => addToast('메시지를 불러오지 못했습니다.', 'error'));
  }, [roomId, addToast]);

  // ─── 이전 메시지 더 보기 ────────────────────────────────────
  async function loadMore() {
    if (!hasMore || loadingMore || !oldestTsRef.current) return;
    setLoadingMore(true);
    try {
      const older = await fetchMessages(roomId, 60, oldestTsRef.current);
      if (older.length) {
        justLoadedMore.current = true;
        setMessages((prev) => [...older, ...prev]);
        setHasMore(older.length >= 60);
        oldestTsRef.current = older[0].created_at;
        older.forEach((m) => { if (m.profiles?.id) profileCacheRef.current[m.profiles.id] = m.profiles; });
      } else {
        setHasMore(false);
      }
    } catch { /* ignore */ }
    setLoadingMore(false);
  }

  // ─── Realtime 구독 + Presence ───────────────────────────────
  useEffect(() => {
    const myId = profile?.id ?? user?.id ?? 'anon';

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const raw = payload.new;

          // 프로필 캐시 우선 조회 — 없으면 DB 1회만 조회
          let prof = profileCacheRef.current[raw.sender_id];
          if (!prof) {
            const { data: p } = await supabase
              .from('profiles').select('id, nickname, avatar_url')
              .eq('id', raw.sender_id).single();
            if (p) { profileCacheRef.current[p.id] = p; prof = p; }
          }

          const msg = { ...raw, profiles: prof };
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);

          const curId = profile?.id ?? user?.id;
          if (prof?.id !== curId) {
            const preview = raw.is_private ? '🔒 스텔스 메시지' : (raw.content || '📷 이미지');
            addToast(`${prof?.nickname ?? '상대방'}: ${preview}`, 'message');
          }
        }
      )
      // Presence — 디바운스로 잦은 재렌더 방지
      .on('presence', { event: 'sync' }, () => {
        const st = channel.presenceState();
        clearTimeout(presenceTimer.current);
        presenceTimer.current = setTimeout(() => setOnlineCount(Object.keys(st).length), 400);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: myId, joinedAt: Date.now() });
        }
      });

    channelRef.current = channel;
    return () => {
      clearTimeout(presenceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [roomId, profile?.id, user?.id, addToast]);

  // ─── 스크롤 제어 ────────────────────────────────────────────
  // 이전 메시지 로드 시엔 스크롤 고정, 최초 로드는 instant, 신규 메시지는 smooth
  useEffect(() => {
    if (!messages.length) return;
    if (justLoadedMore.current) { justLoadedMore.current = false; return; }
    bottomRef.current?.scrollIntoView({ behavior: isInitialLoad.current ? 'instant' : 'smooth' });
    if (isInitialLoad.current) isInitialLoad.current = false;
  }, [messages]);

  // ─── 클립보드 붙여넣기 ─────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const imgItem = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
      if (imgItem) setImagePreview({ file: imgItem.getAsFile(), url: URL.createObjectURL(imgItem.getAsFile()) });
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, []);

  // ─── 드래그 앤 드롭 ────────────────────────────────────────
  function handleDrop(e) {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) setImagePreview({ file, url: URL.createObjectURL(file) });
  }

  // ─── 전송 ──────────────────────────────────────────────────
  async function handleSend(e) {
    e?.preventDefault();
    if (!text.trim() && !imagePreview) return;

    const senderId = profile?.id ?? user?.id;
    if (!senderId) { addToast('사용자 정보를 불러오지 못했습니다. 새로고침해주세요.', 'error'); return; }

    if (!profile) {
      const { data: authUser } = await supabase.auth.getUser();
      const nickname = authUser?.user?.user_metadata?.nickname
        || authUser?.user?.email?.split('@')[0]
        || `user_${senderId.slice(0, 6)}`;
      await supabase.from('profiles').insert({ id: senderId, nickname }).select().single();
    }

    let imageUrl = null;
    if (imagePreview) {
      setUploading(true);
      try { imageUrl = await uploadChatImage(imagePreview.file, senderId); }
      catch (err) { addToast(`이미지 업로드 실패: ${err.message}`, 'error'); setUploading(false); return; }
      setUploading(false);
      URL.revokeObjectURL(imagePreview.url);
      setImagePreview(null);
    }

    try {
      const sent = await sendMessage({
        roomId, senderId,
        content:    text.trim() || null,
        imageUrl,
        isPrivate:  privacyMode,
        emojiColor: myBubbleColor,
      });
      if (sent) {
        if (sent.profiles?.id) profileCacheRef.current[sent.profiles.id] = sent.profiles;
        setMessages((prev) => prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]);
      }
      setText('');
      inputRef.current?.focus();
    } catch (err) { addToast(`전송 실패: ${err.message}`, 'error'); }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const myId = profile?.id ?? user?.id;

  return (
    <>
    <div
      className="flex flex-col h-screen bg-zinc-950 text-white select-none"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* 헤더 */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/70 backdrop-blur-sm shrink-0">
        <button onClick={() => navigate('/')}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{state?.code ?? '채팅방'}</p>
          <p className="text-xs text-zinc-500 flex items-center gap-1">
            <Users className="w-3 h-3" />
            {onlineCount}명 접속 중
          </p>
        </div>
        <button onClick={toggleNotifications}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
          {notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>
      </header>

      {/* 메시지 리스트 */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scroll-smooth">
        {/* 이전 메시지 더 보기 */}
        {hasMore && (
          <div className="flex justify-center py-1">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-4 py-1.5 rounded-full border border-zinc-700 hover:border-zinc-500 disabled:opacity-40"
            >
              {loadingMore ? '불러오는 중...' : '이전 메시지 보기'}
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMe={msg.profiles?.id === myId}
          />
        ))}
        <div ref={bottomRef} />
      </main>

      {/* 이미지 미리보기 */}
      {imagePreview && (
        <div className="px-4 pb-2 shrink-0 animate-slide-up">
          <div className="relative inline-block">
            <img src={imagePreview.url} alt="preview"
              className="max-h-32 rounded-xl border border-zinc-700 object-cover" />
            <button
              onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null); }}
              className="absolute -top-2 -right-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
              ×
            </button>
          </div>
        </div>
      )}

      {/* 입력창 */}
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 px-4 py-3 border-t border-zinc-800/60 bg-zinc-900/70 backdrop-blur-sm shrink-0"
      >
        <ImageUploader onFile={(file) => setImagePreview({ file, url: URL.createObjectURL(file) })} />

        <button
          type="button"
          onClick={() => setPrivacyMode((p) => !p)}
          title={privacyMode ? '스텔스 ON' : '스텔스 OFF'}
          className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
            privacyMode
              ? 'bg-brand-600/30 text-brand-400 ring-1 ring-brand-600/50'
              : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
          }`}
        >
          {privacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={privacyMode ? '🔒 스텔스 모드' : '메시지 입력...'}
          rows={1}
          className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-brand-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none resize-none max-h-32 transition-colors leading-relaxed"
          style={{ fieldSizing: 'content' }}
        />

        <button
          type="submit"
          disabled={uploading || (!text.trim() && !imagePreview)}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading
            ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <Send className="w-4 h-4" />
          }
        </button>
      </form>
    </div>

    <Toast toasts={toasts} />
    </>
  );
}
