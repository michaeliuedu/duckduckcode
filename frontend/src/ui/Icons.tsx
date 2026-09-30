/**
 * The icon set: hand-drawn 16×16 paths on `currentColor`, so icons inherit the
 * colour of whatever control they sit in and there is no icon-font dependency.
 */

import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PlayIcon({ size = 12, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden focusable="false">
      <path d="M3.2 1.7a.7.7 0 0 0-1.05.6v7.4a.7.7 0 0 0 1.05.6l6.4-3.7a.7.7 0 0 0 0-1.2L3.2 1.7Z" />
    </svg>
  );
}

export function StopIcon({ size = 12, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden focusable="false">
      <rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1.2" />
    </svg>
  );
}

export function StepsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 12.5h3.2V9h3.3V5.5h3.5V2" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 2v1.4M8 12.6V14M2 8h1.4M12.6 8H14M3.7 3.7l1 1M11.3 11.3l1 1M3.7 12.3l1-1M11.3 4.7l1-1" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.2 9.4A5.2 5.2 0 0 1 6.6 2.8 5.3 5.3 0 1 0 13.2 9.4Z" />
    </Svg>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.8" y="2.8" width="12.4" height="8.4" rx="1.2" />
      <path d="M5.8 13.6h4.4" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5.6" y="5.6" width="8" height="8" rx="1.4" />
      <path d="M10.4 3.4a1.4 1.4 0 0 0-1.4-1H3.9a1.5 1.5 0 0 0-1.5 1.5v5.1a1.4 1.4 0 0 0 1 1.4" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 8.4 6.2 11.8l7-7.6" />
    </Svg>
  );
}

export function PanelLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.8" y="2.4" width="12.4" height="11.2" rx="1.4" />
      <path d="M6.2 2.4v11.2" />
    </Svg>
  );
}

export function PanelBottomIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.8" y="2.4" width="12.4" height="11.2" rx="1.4" />
      <path d="M1.8 9.8h12.4" />
    </Svg>
  );
}

export function ChevronFirstIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.4 11.4 8 8l3.4-3.4M4.8 4.2v7.6" />
    </Svg>
  );
}

export function ChevronLastIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.6 4.6 8 8l-3.4 3.4M11.2 4.2v7.6" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.4 5.4 8l4.6 4.6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.4 10.6 8 6 12.6" />
    </Svg>
  );
}

export function PlugIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 2v3.2M10 2v3.2M4.4 5.2h7.2v2.2a3.6 3.6 0 0 1-7.2 0V5.2ZM8 11v3" />
    </Svg>
  );
}

export function UnplugIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 2l12 12M6 2v3.2M4.4 5.2h7.2v2.2a3.6 3.6 0 0 1-5.4 3.1M8 11.6V14" />
    </Svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 8H3.4M7 3.6 3 8l4 4.4" />
    </Svg>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 8a5.2 5.2 0 1 0 1.9-4M2.4 2.6v3.2h3.2" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.2" cy="7.2" r="4.6" />
      <path d="M10.6 10.6 13.8 13.8" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 4.4h10.4M6.4 4.4V3a.8.8 0 0 1 .8-.8h1.6a.8.8 0 0 1 .8.8v1.4M4.2 4.4l.6 8.2a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.2" />
    </Svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.2 8.2 7.1 10l3.7-4" />
    </Svg>
  );
}

export function CrossCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6 6l4 4M10 6l-4 4" />
    </Svg>
  );
}

export function BeakerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.2 2.2h3.6M6.8 2.2v4L3.4 12a1.2 1.2 0 0 0 1 1.8h7.2a1.2 1.2 0 0 0 1-1.8L9.2 6.2v-4M4.9 9.2h6.2" />
    </Svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.2 2.6a1.4 1.4 0 0 1 2 2L5.6 12.2l-2.8.8.8-2.8Z" />
    </Svg>
  );
}
