/**
 * Link's own small icon set: 16px grid, 1.5px stroke, square-ish ends.
 * Icons always sit next to a text label; they help scanning, they never
 * replace the words.
 */

type IconProps = { className?: string; title?: string };

function Svg({ className = "h-4 w-4", title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** A pack: two stacked index cards. */
export function PackIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="5" width="11" height="8" rx="1" />
      <path d="M4.5 3h7" />
    </Svg>
  );
}

/** A call: a short waveform. */
export function CallIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 8h1M5.5 5v6M8 3v10M10.5 5.5v5M13 7.5v1" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  );
}

export function ArrowLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 8H3M7 4 3 8l4 4" />
    </Svg>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8h10M9 4l4 4-4 4" />
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

export function CrossIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Svg>
  );
}

export function FileIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 2.5h5l3 3v8H4z" />
      <path d="M9 2.5v3h3" />
    </Svg>
  );
}

export function LinkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.75.75" />
      <path d="M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.75-.75" />
    </Svg>
  );
}

export function NoteIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 3.5h10M3 6.5h10M3 9.5h7M3 12.5h4" />
    </Svg>
  );
}

export function MicIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6" y="2" width="4" height="7.5" rx="2" />
      <path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14" />
    </Svg>
  );
}

export function StopIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SparkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.2 4.2l1.6 1.6M10.2 10.2l1.6 1.6M11.8 4.2l-1.6 1.6M5.8 10.2l-1.6 1.6" />
    </Svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 9h6l.5-9" />
    </Svg>
  );
}

export function PencilIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.5 3 13 5.5l-7 7H3.5V10z" />
    </Svg>
  );
}

export function RehearseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8a5 5 0 1 0 1.5-3.5" />
      <path d="M3 3v2.5h2.5" />
    </Svg>
  );
}

/** Settings: two sliders. */
export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 5h11M2.5 11h11" />
      <circle cx="6" cy="5" r="1.75" fill="var(--color-canvas)" />
      <circle cx="10.5" cy="11" r="1.75" fill="var(--color-canvas)" />
    </Svg>
  );
}

export function DownloadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
    </Svg>
  );
}

export function PlayIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 3.5v9l7-4.5z" />
    </Svg>
  );
}

/** Ask: a speech bubble with a question tail. */
export function AskIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 3.5h11v7.5H8l-3 2.5V11H2.5z" />
      <path d="M6.5 6a1.5 1.5 0 1 1 2 1.4c-.3.1-.5.4-.5.7v.2" />
    </Svg>
  );
}

/** Send: an arrow pointing up. */
export function SendIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </Svg>
  );
}