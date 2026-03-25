/**
 * 전체 화면 로딩 스피너 (세션 복원 대기 중 표시)
 */
export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 gap-4">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-brand-500 animate-pulse-dot"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
      <p className="text-zinc-500 text-xs tracking-widest">HWADAM</p>
    </div>
  );
}
