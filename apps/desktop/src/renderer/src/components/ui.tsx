export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm font-black text-ink-950">L</span>
      <span className="text-base font-semibold tracking-tight">Link</span>
    </div>
  );
}

export function LevelMeter({ label, level, active }: { label: string; level: number; active: boolean }) {
  const bars = 12;
  const lit = Math.round(level * bars);
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-xs text-ink-300">{label}</span>
      <div className="flex h-3 flex-1 items-end gap-0.5">
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className={`h-full flex-1 rounded-sm transition-colors ${
              active && i < lit ? (i > bars * 0.8 ? "bg-amber-400" : "bg-emerald-400") : "bg-ink-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{children}</p>;
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}