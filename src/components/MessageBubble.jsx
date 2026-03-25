import { useState } from 'react';

/**
 * avatar_url이 이모티콘 문자인지 URL인지 판별
 * 이모티콘: 길이가 짧고 http로 시작하지 않음
 */
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
  // 이모티콘/이미지 없으면 닉네임 첫 글자
  return (
    <div className={`shrink-0 ${dim} rounded-full bg-zinc-700 flex items-center justify-center font-bold text-zinc-300 uppercase`}>
      {profile?.nickname?.[0] ?? '?'}
    </div>
  );
}

export default function MessageBubble({ message, isMe }) {
  const [revealed, setRevealed] = useState(false);

  const { content, image_url, is_private, emoji_color, created_at, profiles } = message;

  const isHidden  = is_private && !revealed;
  const bubbleBg  = isMe
    ? (emoji_color ?? '#1e3a5f')
    : (emoji_color ?? '#27272a');
  // 상대방 말풍선은 채도·밝기를 낮춰 내 말풍선과 시각적으로 구분
  const bubbleFilter = (!isMe && emoji_color) ? 'saturate(45%) brightness(75%)' : undefined;

  const time = new Date(created_at).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return (
    <div className={`flex items-end gap-2 animate-fade-in ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>

      {/* 아바타 — 상대방은 왼쪽, 내 메시지도 오른쪽에 표시 */}
      <Avatar profile={profiles} />

      <div className={`flex flex-col gap-1 max-w-[72%] ${isMe ? 'items-end' : 'items-start'}`}>
        {/* 닉네임 (상대방만) */}
        {!isMe && (
          <span className="text-xs text-zinc-500 px-1">{profiles?.nickname}</span>
        )}

        {/* 말풍선 */}
        <div
          className="relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-md cursor-pointer"
          style={{ backgroundColor: bubbleBg, filter: bubbleFilter }}
          onClick={() => is_private && setRevealed((r) => !r)}
          onMouseUp={() => is_private && setRevealed(true)}
          onMouseLeave={() => is_private && setRevealed(false)}
          title={is_private ? (isHidden ? '클릭 또는 드래그해서 보기' : '마우스를 떼면 숨김') : undefined}
        >
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

        <span className="text-[10px] text-zinc-600 px-1">{time}</span>
      </div>
    </div>
  );
}
