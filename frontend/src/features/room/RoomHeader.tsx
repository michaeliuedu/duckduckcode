/**
 * The room's top bar: what you are working on, who is here, and the controls that
 * belong to the room rather than to the code.
 *
 * Kept to one row at every width. Below `sm` the labels drop away and the icon
 * buttons stay, which is the part you actually need on a phone.
 */

import { useConnectionState, usePeers } from "@/collab/useRoomSession";
import { useCopyToClipboard } from "@/lib/hooks";
import { DifficultyBadge } from "@/ui/Badge";
import { HeaderSeparator } from "@/ui/AppHeader";
import { Brand } from "@/ui/Brand";
import { Button } from "@/ui/Button";
import { CheckIcon, CopyIcon, PanelBottomIcon, PanelLeftIcon, PlugIcon, ResetIcon, UnplugIcon } from "@/ui/Icons";
import { IconButton } from "@/ui/IconButton";
import { AccountMenu } from "@/ui/AccountMenu";
import { ThemeToggle } from "@/ui/ThemeToggle";
import { ConnectionPill } from "./ConnectionPill";
import { IdentityControl } from "./IdentityControl";
import { PeerAvatars } from "./PeerAvatars";
import { roomTitle, useRoom } from "./RoomContext";
import type { RoomLayout } from "./useRoomLayout";

export interface RoomHeaderProps {
  layout: RoomLayout;
  /** Hidden on narrow screens, where the panes are tabs instead. */
  showLayoutControls: boolean;
}

export function RoomHeader({ layout, showLayoutControls }: RoomHeaderProps) {
  const { problem, session, shareLink } = useRoom();
  const connection = useConnectionState(session);
  const peers = usePeers(session);
  const [copied, copy] = useCopyToClipboard();

  return (
    <header className="app-header">
      <Brand />
      <HeaderSeparator />
      <h1 className="min-w-0 truncate text-[14px] font-medium" data-testid="room-title">
        {roomTitle(problem)}
      </h1>
      {problem && <DifficultyBadge level={problem.difficulty} className="hidden shrink-0 sm:inline" />}
      <ConnectionPill connection={connection} />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <PeerAvatars peers={peers} />
        <IdentityControl />

        {/* The link is in the DOM whether or not the clipboard is available. */}
        <input
          readOnly
          aria-label="Shareable room link"
          data-testid="share-link"
          value={shareLink}
          tabIndex={-1}
          className="sr-only"
        />
        <Button
          variant="ghost"
          icon={copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          onClick={() => void copy(shareLink)}
          title={`Copy ${shareLink}`}
          data-testid="share-button"
        >
          <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
        </Button>

        <IconButton
          label={connection.offline ? "Reconnect to the room" : "Work offline"}
          title={
            connection.offline
              ? "Reconnect; edits made offline merge automatically."
              : "Drop the connection. You can keep editing, and edits merge when you reconnect."
          }
          data-testid="offline-toggle"
          active={connection.offline}
          onClick={() => (connection.offline ? session.goOnline() : session.goOffline())}
          icon={connection.offline ? <UnplugIcon /> : <PlugIcon />}
        />

        {showLayoutControls && (
          <>
            {problem && (
              <IconButton
                label={layout.problemCollapsed ? "Show the problem pane" : "Hide the problem pane"}
                data-testid="toggle-problem"
                active={!layout.problemCollapsed}
                onClick={layout.toggleProblem}
                icon={<PanelLeftIcon />}
              />
            )}
            <IconButton
              label={layout.consoleCollapsed ? "Show the console pane" : "Hide the console pane"}
              data-testid="toggle-console"
              active={!layout.consoleCollapsed}
              onClick={layout.toggleConsole}
              icon={<PanelBottomIcon />}
            />
            <IconButton
              label="Reset the pane layout"
              title="Reset every pane to its default size"
              data-testid="reset-layout"
              onClick={layout.reset}
              icon={<ResetIcon />}
            />
          </>
        )}

        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
