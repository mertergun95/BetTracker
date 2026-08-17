/**
 * The BT monogram.
 *
 * Letters only — no wordmark. The forms are drawn as strokes rather than filled
 * outlines so the mark stays legible at 20px in the collapsed sidebar rail and
 * at 192px as an Android launcher icon, from one set of coordinates.
 */
export function Logo({
  size = 32,
  rounded = true,
  title,
}: {
  size?: number;
  /** Draw the gradient tile behind the letters. */
  rounded?: boolean;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="bt-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a78d6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      {rounded && <rect width="64" height="64" rx="15" fill="url(#bt-mark)" />}

      {/* The mark is drawn around (33, 31), so it is nudged onto the canvas centre. */}
      <g
        transform="translate(-1, 1)"
        fill="none"
        stroke={rounded ? '#ffffff' : 'currentColor'}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* B — one stem, two bowls */}
        <path d="M16 17 V45" />
        <path d="M16 17 H20 A7 7 0 0 1 20 31 H16" />
        <path d="M16 31 H20 A7 7 0 0 1 20 45 H16" />

        {/* T — crossbar and stem */}
        <path d="M34 17 H50" />
        <path d="M42 17 V45" />
      </g>
    </svg>
  );
}

export default Logo;
