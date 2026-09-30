/** Shapes returned by the Go backend. See the API table in the README. */

export type RoomMode = "practice" | "blank";

export type Difficulty = "easy" | "medium" | "hard";

export interface Room {
  id: string;
  mode: RoomMode;
  problemId: string | null;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

/** How much of the world can see a problem or a list. */
export type Visibility = "draft" | "unlisted" | "public" | "private";

/** The public face of an account: never an email address. */
export interface Author {
  handle: string;
  displayName: string;
}

export interface ProblemSummary {
  /** The slug. It is what appears in URLs and never changes. */
  id: string;
  title: string;
  summary: string;
  difficulty: Difficulty | string;
  language: string;
  visibility: Visibility;
  /** Ships with the app rather than written by a member. */
  official: boolean;
  /** How many rooms have been started from it — the popularity signal. */
  roomCount: number;
  testCount: number;
  author: Author;
  updatedAt: string;
}

/**
 * A test case. `args` are spread into the entry point and the return value is
 * compared to `expected`.
 */
export interface TestCase {
  name: string;
  args: unknown[];
  expected: unknown;
  /** Not shown before running. Not secret — the browser runs the tests. */
  hidden: boolean;
}

export interface Problem extends ProblemSummary {
  /** Markdown. Must be sanitised before it reaches the DOM. */
  statement: string;
  examples: ProblemExample[];
  starterCode: string;
  /** The function the test cases call. Empty when there are no tests. */
  entryPoint: string;
  tests: TestCase[];
  publishedAt?: string;
}

export interface RoomResponse {
  room: Room;
  /**
   * The copy stored with the room, not a live read: an author editing their
   * problem must not change what a pair is already looking at. Absent for a
   * blank room, or when an old room's problem has since been deleted.
   */
  problem?: Problem;
}

export interface ProblemListResponse {
  problems: ProblemSummary[];
}

export interface ProblemResponse {
  problem: Problem;
  /** Whether the signed-in caller may edit it. */
  canEdit: boolean;
}

export interface HomeFeed {
  official: ProblemSummary[];
  popular: ProblemSummary[];
  recent: ProblemSummary[];
  /** Present only for a signed-in viewer. */
  progress?: Progress;
  /** Slugs in this feed the viewer has solved. */
  solved?: string[];
}

/** The writable half of a problem. */
export interface ProblemDraft {
  title: string;
  summary: string;
  statement: string;
  difficulty: string;
  starterCode: string;
  entryPoint: string;
  examples: ProblemExample[];
  tests: TestCase[];
}

export interface ProblemSearch {
  q?: string;
  difficulty?: string;
  author?: string;
  sort?: "popular" | "recent" | "relevance";
  official?: boolean;
  limit?: number;
  offset?: number;
}

// --- Lists -----------------------------------------------------------------

export interface List {
  id: string;
  slug: string;
  title: string;
  description: string;
  visibility: Visibility;
  owner: Author;
  itemCount: number;
  items?: ProblemSummary[];
  updatedAt: string;
}

export interface ListResponse {
  list: List;
  canEdit: boolean;
}

export interface MyListsResponse {
  lists: List[];
  /** Ids of the lists already holding the problem named in `?contains=`. */
  containing: string[];
}

export interface ListDraft {
  title: string;
  description: string;
  visibility: Visibility;
}

// --- Progress ---------------------------------------------------------------

/** One square in the contribution grid. */
export interface ActivityDay {
  /** ISO date, UTC. */
  day: string;
  runs: number;
  solves: number;
}

export interface Progress {
  solved: number;
  attempted: number;
  runs: number;
  currentStreak: number;
  longestStreak: number;
  days: ActivityDay[];
}

// --- Profiles ---------------------------------------------------------------

export interface Profile {
  handle: string;
  displayName: string;
  createdAt: string;
  official: boolean;
}

export interface ProfileResponse {
  profile: Profile;
  problems: ProblemSummary[];
  lists: List[];
  progress?: Progress;
  solved?: string[];
}

/** `problemId` is a problem slug. */
export type CreateRoomRequest = { mode: "blank" } | { mode: "practice"; problemId: string };

// --- Accounts --------------------------------------------------------------

/** A signed-in person, as the API returns them. Never includes a password. */
export interface User {
  id: string;
  email: string;
  /** Lowercase, URL-safe; appears in /u/<handle>. */
  handle: string;
  displayName: string;
  createdAt: string;
}

/** `user` is null for an anonymous caller — that is not an error. */
export interface AuthResponse {
  user: User | null;
}

export interface SignupRequest {
  email: string;
  handle: string;
  displayName: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  handle: string;
  displayName: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
