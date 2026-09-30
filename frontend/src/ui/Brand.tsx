/** The wordmark, which doubles as the way back to the lobby. */

import { Link } from "react-router";
import { DuckMark } from "./DuckMark";

export function Brand({ to = "/", className = "" }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`brand ${className}`.trim()} aria-label="duckduckcode home">
      <DuckMark size={24} className="brand-mark" />
      <span className="brand-word">duckduckcode</span>
    </Link>
  );
}
