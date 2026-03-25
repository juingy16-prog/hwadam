/**
 * 자체 토스트 컴포넌트
 * props:
 *   toasts: Array<{ id, msg, type: 'info'|'message'|'error'|'push' }>
 */
export default function Toast({ toasts }) {
  if (!toasts.length) return null;

  const colorMap = {
    info:    'bg-zinc-800 border-zinc-700 text-zinc-200',
    message: 'bg-zinc-900 border-brand-700/60 text-zinc-100',
    error:   'bg-red-950 border-red-800/60 text-red-200',
    push:    'bg-zinc-900 border-purple-700/60 text-zinc-100',
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`
            flex items-start gap-2 max-w-xs px-4 py-3 rounded-xl border shadow-xl
            text-xs leading-relaxed backdrop-blur-sm animate-slide-up
            ${colorMap[t.type] ?? colorMap.info}
          `}
        >
          <span className="mt-px">
            {t.type === 'message' && '💬'}
            {t.type === 'error'   && '⚠️'}
            {t.type === 'push'    && '🔔'}
            {t.type === 'info'    && 'ℹ️'}
          </span>
          <span className="truncate">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
