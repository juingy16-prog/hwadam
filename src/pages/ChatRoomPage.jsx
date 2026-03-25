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

// 이모티콘 → 말풍선 배경색
const EMOJI_COLORS = {
  '❤️':'#7f1d1d','🧡':'#7c2d12','💛':'#713f12','💚':'#14532d',
  '💙':'#1e3a5f','💜':'#4c1d95','🖤':'#18181b','🤍':'#52525b',
  '🔥':'#7c2d12','⭐':'#78350f','🎉':'#1e3a5f','✨':'#4c1d95',
  '😊':'#14532d','😎':'#1e3a5f','😭':'#1e3a8a','🤬':'#7f1d1d',
  '🤢':'#166534','🥸':'#78350f','🤡':'#991b1b','💩':'#78350f',
  '😺':'#7c2d12','🐶':'#78350f','🦊':'#7c2d12','🐯':'#78350f','🐷':'#9d174d','🐻':'#44403c',
  '👀':'#1c3a4a','🌞':'#78350f','🍚':'#44403c','🍎':'#7f1d1d',
};
const DEFAULT_MY_COLOR = '#1e3a5f';
const EMOJI_KEY = 'hwadam-profile-emoji';

export default function ChatRoomPage() {
  const { roomId }  = useParams();
  const { state }   = useLocation();
  const navigate    = useNavigate();
  const { user, profile } = useAuth();
  const { notifEnabled, toggleNotifications } = useNotification();

  const [messages, setMessages]       = useState([]);
  const [text, setText]               = useState('');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);  // 5번 — 온라인 유저 수
  const [toasts, setToasts]           = useState([]);

  // 2번 — 로비에서 선택한 이모티콘 → 말풍선 색
  const profileEmoji = state?.profileEmoji ?? localStorage.getItem(EMOJI_KEY) ?? null;
  const myBubbleColor = EMOJI_COLORS[profileEmoji] ?? DEFAULT_MY_COLOR;

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const channelRef = useRef(null);

  // ─── 토스트 ────────────────────────────────────────────────
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ─── 메시지 불러오기 ────────────────────────────────────────
  useEffect(() => {
    fetchMessages(roomId)
      .then(setMessages)
      .catch(() => addToast('메시지를 불러오지 못했습니다.', 'error'));
  }, [roomId, addToast]);

  // ─── Realtime 구독 + Presence (5번 — 온라인 유저 수) ───────
  useEffect(() => {
    const myId = profile?.id ?? user?.id ?? 'anon';

    const channel = supabase
      .channel(`room:${roomId}`)
      // 메시지 INSERT
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const newId = payload.new.id;
          const { data: msg } = await supabase
            .from('messages')
            .select(`id, content, image_url, is_private, emoji_color, created_at,
              profiles:sender_id ( id, nickname, avatar_url )`)
            .eq('id', newId)
            .single();
          if (msg) {
            setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
            const curId = profile?.id ?? user?.id;
            if (msg.profiles?.id !== curId) {
              const preview = msg.is_private ? '🔒 스텔스 메시지' : (msg.content || '📷 이미지');
              addToast(`${msg.profiles?.nickname ?? '상대방'}: ${preview}`, 'message');
            }
          }
        }
      )
      // Presence — 접속자 수 추적
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: myId, joinedAt: Date.now() });
        }
      });

    channelRef.current = channel;
    return () => supabase.removeChannel(channel);
  }, [roomId, profile?.id, user?.id, addToast]);

  // ─── 스크롤 하단 고정 ───────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── 푸시 이벤트 ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => addToast(e.detail.body, 'push');
    window.addEventListener('hwadam:push', handler);
    return () => window.removeEventListener('hwadam:push', handler);
  }, [addToast]);

  // ─── 클립보드 붙여넣기 ─────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find((i) => i.type.startsWith('image/'));
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
      if (sent) setMessages((prev) => prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]);
      setText('');
      inputRef.current?.focus();
    } catch (err) { addToast(`전송 실패: ${err.message}`, 'error'); }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <>
    <div
      className="flex flex-col h-screen bg-zinc-950 text-white select-none"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* ── 헤더 (4번 — 다크/라이트 제거, 5번 — 온라인 유저 수, 6번 — 영문만) ── */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/70 backdrop-blur-sm shrink-0">
        <button onClick={() => navigate('/')}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{state?.code ?? '채팅방'}</p>
          {/* 5번 — 메시지 수 → 접속자 수 */}
          <p className="text-xs text-zinc-500 flex items-center gap-1">
            <Users className="w-3 h-3" />
            {onlineCount}명 접속 중
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleNotifications}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            {notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ── 메시지 리스트 ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scroll-smooth">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMe={msg.profiles?.id === (profile?.id ?? user?.id)}
          />
        ))}
        <div ref={bottomRef} />
      </main>

      {/* ── 이미지 미리보기 ───────────────────────────────────── */}
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

      {/* ── 입력창 (3번 — 첨부 | 스텔스 | 입력 | 전송) ──────── */}
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 px-4 py-3 border-t border-zinc-800/60 bg-zinc-900/70 backdrop-blur-sm shrink-0"
      >
        {/* 첨부 */}
        <ImageUploader onFile={(file) => setImagePreview({ file, url: URL.createObjectURL(file) })} />

        {/* 스텔스 모드 (3번 — 입력창 쪽으로 이동) */}
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

        {/* 텍스트 입력 */}
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

        {/* 전송 */}
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
