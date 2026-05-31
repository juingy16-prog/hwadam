import { useState, memo, forwardRef, useRef, useEffect } from 'react';
import { Copy, Reply } from 'lucide-react';

function isEmojiAvatar(str) {
  return str && !str.startsWith('http') && str.length <= 4;
}

function Avatar({ profile, size = 'sm' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm';
  const av  = profile?.avatar_url;

  if (isEmojiAvatar(av)) {
    return (
      <div className={`shrink-0 ${dim} rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center`}>
        <span className="text-base leading-none">{av}</span>
      </div>
    );
  }
  if (av) {
    return (
      <img src={av} alt={profile?.nickname}
        className={`shrink-0 ${dim} rounded-full object-cover bg-zinc-700`} />
    );
  }
  return (
    <div className={`shrink-0 ${dim} rounded-full bg-zinc-700 flex items-center justify-center font-bold text-zinc-300 uppercase`}>
      {profile?.nickname?.[0] ?? '?'}
    </div>
  );
}

const MessageBubble = memo(forwardRef(function MessageBubble({ message, isMe, onReply, onJumpTo }, ref) {
  const [menuOpen, setMenuOpen]   = useState(false);
  const [revealed, setRevealed]   = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const menuRef = useRef(null);

  const { content, image_url, is_private, emoji_color, created_at, profiles, reply_to } = message;

  const isHidden     = is_private && !revealed;
  const bubbleBg     = isMe ? (emoji_color ?? '#1e3a5f') : (emoji_color ?? '#27272a');
  const bubbleFilter = (!isMe && emoji_color) ? 'saturate(45%) brightness(75%)' : undefined;

  const time = new Date(created_at).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  // 외부에서 highlight 트리거 (스크롤 이동 후 강조)
  useEffect(() => {
    if (!highlighted) return;
    const t = setTimeout(() => setHighlighted(false), 1000);
    return () => clearTimeout(t);
  }, [highlighted]);

  function handleBubbleClick() {
    setMenuOpen((p) => !p);
    if (is_private) setRevealed((r) => !r);
  }

  function handleCopy() {
    const text = content || (image_url ? image_url : '');
    if (text) navigator.clipboard.writeText(text).catch(() => {});
    setMenuOpen(false);
  }

  function handleReply() {
    onReply?.(message);
    setMenuOpen(false);
  }

  function handleJumpToReply(e) {
    e.stopPropagation();
    onJumpTo?.(reply_to.id);
  }

  return (
    <div
      ref={ref}
      className={`flex items-end gap-2 animate-fade-in ${isMe ? 'flex-row-reverse' : 'flex-row'} ${highlighted ? 'rounded-2xl ring-2 ring-brand-500/50' : ''} transition-all duration-300`}
    >
      <Avatar profile={profiles} />

      <div className={`flex flex-col gap-1 max-w-[72%] ${isMe ? 'items-end' : 'items-start'}`}>
        {!isMe && (
          <span className="text-xs text-zinc-500 px-1">{profiles?.nickname}</span>
        )}

        <div className="relative" ref={menuRef}>
          {/* 컨텍스트 메뉴 */}
          {menuOpen && (
            <div className={`absolute bottom-full mb-1.5 z-20 ${isMe ? 'right-0' : 'left-0'}`}>
              <div className="flex gap-0.5 bg-zinc-800 border border-zinc-700 rounded-xl px-1.5 py-1.5 shadow-xl backdrop-blur-sm">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Copy className="w-3 h-3" />
                  복사
                </button>
                <button
                  onClick={handleReply}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Reply className="w-3 h-3" />
                  답장
                </button>
              </div>
            </div>
          )}

          {/* 말풍선 */}
          <div
            className="relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-md cursor-pointer"
            style={{ backgroundColor: bubbleBg, filter: bubbleFilter }}
            onClick={handleBubbleClick}
            onMouseLeave={() => is_private && setRevealed(false)}
            title={is_private ? (isHidden ? '클릭해서 보기' : '마우스를 떼면 숨김') : undefined}
          >
            {/* 답장 미리보기 */}
            {reply_to && (
              <div
                onClick={handleJumpToReply}
                className="border-l-2 border-white/40 pl-2 pr-1 mb-2.5 rounded-r cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
              >
                <p className="text-[10px] font-semibold text-white/80 mb-0.5 truncate">
                  {reply_to.profiles?.nickname ?? '알 수 없음'}
                </p>
                <p className="text-xs text-white/60 truncate max-w-[180px]">
                  {reply_to.content || (reply_to.image_url ? '📷 이미지' : '...')}
                </p>
              </div>
            )}

            {image_url && (
              <img src={image_url} alt="첨부 이미지"
                className="max-w-[240px] max-h-48 rounded-xl object-cover mb-1" loading="lazy" />
            )}

            {content && (
              <span
                className="select-text"
                style={isHidden
                  ? { color: bubbleBg, userSelect: 'all' }
                  : { color: '#f4f4f5' }}
              >
                {content}
              </span>
            )}

            {is_private && (
              <span className="ml-2 text-[10px] opacity-40 align-middle">
                {isHidden ? '👁' : '🔒'}
              </span>
            )}
          </div>
        </div>

        <span className="text-[10px] text-zinc-600 px-1">{time}</span>
      </div>
    </div>
  );
}));

export default MessageBubble;
