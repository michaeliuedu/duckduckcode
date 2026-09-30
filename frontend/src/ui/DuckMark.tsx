/**
 * The duck, drawn rather than fetched.
 *
 * Inline SVG so the mark is present on first paint with no extra request, and
 * so it stays crisp from the 18px header to a 128px splash. The colours are
 * fixed rather than tokenised: a rubber duck is yellow in both themes, and a
 * mark that changed colour with the theme would stop being a logo.
 */

export function DuckMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* Tail, a shade darker so it still separates from the body at 18px. */}
      <path d="M47 23c5.5-4.5 10.6-7.4 13.3-7.4 1.8 0 2.5 1.7 1.4 3.1-2.8 3.6-4.6 7.7-5.4 12L47 23Z" fill="#f7c600" />
      {/* Head and body as one silhouette, the way a moulded toy reads. */}
      <path
        d="M43.6 21.4a15.2 15.2 0 1 0-25.9 9.9C10.6 34.3 6 40.5 6 47.2 6 55.4 13.9 60 25.6 60h12.6C50.5 60 60 51.6 60 41.2c0-8.4-6.6-15.4-16.4-19.8Z"
        fill="#ffd21e"
      />
      <path
        d="M22.8 26.3C14.2 26.8 7.8 28.3 5 30.1c-2.5 1.6-2.3 4.7.4 6.1 2.8 1.6 9.1 2.8 17.4 3.3 1.6-4.3 1.6-8.9 0-13.2Z"
        fill="#f2703a"
      />
      <ellipse cx="26.6" cy="25.8" rx="2.8" ry="3.3" fill="#ffffff" />
      <ellipse cx="26.9" cy="26.1" rx="2.1" ry="2.6" fill="#1f6f9e" />
      <circle cx="26.9" cy="25" r="1.9" fill="#20242b" />
      <circle cx="27.9" cy="26.2" r=".85" fill="#ffffff" />
    </svg>
  );
}
