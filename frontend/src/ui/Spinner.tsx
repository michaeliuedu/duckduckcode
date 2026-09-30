/** An indeterminate progress indicator; freezes when the OS asks for less motion. */

export function Spinner({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={`spinner ${className}`.trim()}
      role="presentation"
      aria-hidden
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M8 1.8A6.2 6.2 0 0 1 14.2 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
