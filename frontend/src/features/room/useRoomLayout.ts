/**
 * Which panes are showing, and how to put it all back.
 *
 * Divider positions live inside each `SplitPane` (persisted under the same
 * namespace); this hook owns what cannot be expressed as a fraction — whether a
 * pane is collapsed at all — plus the reset that clears both.
 *
 * Layout is a property of the person, not of the room: someone who likes a wide
 * problem pane wants it wide in the next room too.
 */

import { useCallback, useState } from "react";
import { usePersistentBoolean } from "@/lib/hooks";
import { writeString } from "@/lib/storage";

/** Names of the two splits in the room, as `SplitPane` storage keys. */
export const SPLIT_PROBLEM = "room.problem";
export const SPLIT_CONSOLE = "room.console";

const KEY_PROBLEM_COLLAPSED = "duckduckcode.layout.problemCollapsed";
const KEY_CONSOLE_COLLAPSED = "duckduckcode.layout.consoleCollapsed";
const KEY_PREFIX = "duckduckcode.layout.";

export interface RoomLayout {
  problemCollapsed: boolean;
  consoleCollapsed: boolean;
  toggleProblem: () => void;
  toggleConsole: () => void;
  /**
   * Reveals the console if it is collapsed, and does nothing if it is not.
   * Running something has to put the result on screen; toggling would hide it
   * for anyone who already had the pane open.
   */
  showConsole: () => void;
  /** Restores default divider positions and shows every pane again. */
  reset: () => void;
  /**
   * Changes when the layout is reset. Used as part of the splits' React keys so
   * they remount and pick up the cleared sizes.
   */
  version: number;
}

export function useRoomLayout(): RoomLayout {
  const [problemCollapsed, setProblemCollapsed] = usePersistentBoolean(KEY_PROBLEM_COLLAPSED, false);
  const [consoleCollapsed, setConsoleCollapsed] = usePersistentBoolean(KEY_CONSOLE_COLLAPSED, false);
  const [version, setVersion] = useState(0);

  const reset = useCallback(() => {
    writeString(KEY_PREFIX + SPLIT_PROBLEM, "");
    writeString(KEY_PREFIX + SPLIT_CONSOLE, "");
    setProblemCollapsed(false);
    setConsoleCollapsed(false);
    setVersion((previous) => previous + 1);
  }, [setProblemCollapsed, setConsoleCollapsed]);

  const showConsole = useCallback(() => setConsoleCollapsed(false), [setConsoleCollapsed]);

  return {
    problemCollapsed,
    consoleCollapsed,
    toggleProblem: () => setProblemCollapsed(!problemCollapsed),
    toggleConsole: () => setConsoleCollapsed(!consoleCollapsed),
    showConsole,
    reset,
    version,
  };
}
