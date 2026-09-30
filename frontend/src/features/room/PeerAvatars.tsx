/** Who else is here, as initials in their caret colour. */

import type { PeerInfo } from "@/collab/session";
import { initials } from "@/lib/format";

const MAX_SHOWN = 5;

export function PeerAvatars({ peers }: { peers: readonly PeerInfo[] }) {
  const shown = peers.slice(0, MAX_SHOWN);
  const overflow = peers.length - shown.length;

  return (
    <ul className="flex shrink-0 items-center -space-x-1.5" aria-label="Participants" data-testid="peer-list">
      {shown.map((peer) => (
        <li
          key={peer.clientId}
          title={peer.isLocal ? `${peer.name} (you)` : peer.name}
          data-testid="peer"
          data-peer-name={peer.name}
          data-peer-local={peer.isLocal ? "true" : undefined}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--panel)] text-[10px] font-semibold text-white"
          style={{ backgroundColor: peer.color }}
        >
          <span aria-hidden>{initials(peer.name)}</span>
          <span className="sr-only">{peer.isLocal ? `${peer.name} (you)` : peer.name}</span>
        </li>
      ))}
      {overflow > 0 && (
        <li
          title={peers
            .slice(MAX_SHOWN)
            .map((peer) => peer.name)
            .join(", ")}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--panel)] bg-[var(--chip)] text-[10px] font-semibold text-[var(--ink-soft)]"
        >
          +{overflow}
        </li>
      )}
    </ul>
  );
}
