/** Shared pieces for the control window and the overlay. */

export function Wordmark({ live = false }: { live?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
      Link
      {live && <span className="h-2 w-2 rounded-full bg-tally" aria-label="Live" />}
    </span>
  );
}

/** A thin, continuous input meter. Turns marker yellow when the signal is close to clipping. */
export function LevelMeter({ label, level, active }: { label: string; level: number; active: boolean }) {
  const pct = active ? Math.min(100, Math.round(level * 100)) : 0;
  return (
    <div className="grid grid-cols-[44px_1fr] items-center gap-3">
      <span className="text-sm text-text-2">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full transition-[width] duration-75 ${pct > 85 ? "bg-marker" : "bg-go"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-faint border-t-text ${className}`}
      aria-hidden
    />
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-tally/40 bg-tally/10 px-3 py-2 text-sm text-[#ffb3b5]">
      {children}
    </p>
  );
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/* -------------------------------------------------------------- */
/*  Icons: 16px grid, 1.5px stroke. Always paired with a label.    */
/* -------------------------------------------------------------- */

type IconProps = { className?: string };

function Svg({ className = "h-4 w-4", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function CrossIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Svg>
  );
}

export function MinusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 8h9" />
    </Svg>
  );
}

export function ListIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m2.5 4 1 1 2-2M7.5 4.5h6M2.5 10l1 1 2-2M7.5 10.5h6" />
    </Svg>
  );
}

/** Clicks pass through: a cursor going through a pane. */
export function PassThroughIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 5.5h11M2.5 10.5h4" />
      <path d="m9 7 4.5 2-2 .75L10.75 12z" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m3.5 8.5 3 3 6-7" />
    </Svg>
  );
}

export function ExternalIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />
    </Svg>
  );
}