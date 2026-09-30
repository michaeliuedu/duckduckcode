/**
 * Route loaders.
 *
 * Fetching lives here rather than in effects inside components, so a page is
 * rendered once with the data it needs, failures land in an error boundary
 * instead of a `useState` branch, and navigating away cancels the request.
 */

import { data, redirect, type LoaderFunctionArgs } from "react-router";
import { ApiError, api } from "@/api/client";
import type {
  HomeFeed,
  List,
  Problem,
  ProblemSearch,
  ProblemSummary,
  ProfileResponse,
  Room,
  User,
} from "@/api/types";
import { currentUser, ensureSession } from "@/auth/session";

/**
 * Guards a route that needs an account, sending anonymous visitors to sign in
 * and back again afterwards.
 *
 * Awaiting the session is what makes a cold load of a guarded URL work: without
 * it, the loader runs before the session request has come back and bounces a
 * signed-in person to the sign-in page.
 *
 * This is a convenience, not a security control — the server re-checks every
 * write regardless of what the client believes.
 */
export async function requireUser(request: Request): Promise<User> {
  await ensureSession();
  const user = currentUser();
  if (user) return user;
  const { pathname, search } = new URL(request.url);
  throw redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
}

/** Keeps a signed-in person off the sign-in and sign-up pages. */
export async function requireAnonymous(): Promise<null> {
  await ensureSession();
  if (currentUser()) throw redirect("/");
  return null;
}

/** Shape thrown for a failed load, read back with `isRouteErrorResponse`. */
export interface RouteFailure {
  message: string;
  notFound: boolean;
}

function failure(error: unknown, fallback: string): never {
  if (error instanceof ApiError) {
    throw data<RouteFailure>(
      { message: error.message, notFound: error.isNotFound },
      { status: error.status >= 400 ? error.status : 500 },
    );
  }
  throw data<RouteFailure>({ message: fallback, notFound: false }, { status: 500 });
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

export interface HomeLoaderData {
  feed: HomeFeed;
}

/** The front page: what ships with the app, what people use, what is new. */
export async function homeLoader({ request }: LoaderFunctionArgs): Promise<HomeLoaderData> {
  // The session is needed for the header and for drafts to appear in the feed.
  await ensureSession();
  try {
    return { feed: await api.home({ signal: request.signal }) };
  } catch (error) {
    failure(error, "Could not load the problem list.");
  }
}

export interface ProblemsLoaderData {
  problems: ProblemSummary[];
  search: ProblemSearch;
}

/** Reads the search controls out of the URL, so a search is shareable. */
export function readSearch(url: URL): ProblemSearch {
  const search: ProblemSearch = {};
  const q = url.searchParams.get("q")?.trim();
  const difficulty = url.searchParams.get("difficulty");
  const author = url.searchParams.get("author");
  const sort = url.searchParams.get("sort");
  if (q) search.q = q;
  if (difficulty) search.difficulty = difficulty;
  if (author) search.author = author;
  if (sort === "popular" || sort === "recent" || sort === "relevance") search.sort = sort;
  return search;
}

export async function problemsLoader({ request }: LoaderFunctionArgs): Promise<ProblemsLoaderData> {
  await ensureSession();
  const search = readSearch(new URL(request.url));
  try {
    const { problems } = await api.searchProblems({ ...search, limit: 100 }, { signal: request.signal });
    return { problems, search };
  } catch (error) {
    failure(error, "Could not load the problem list.");
  }
}

export interface ProblemLoaderData {
  problem: Problem;
  canEdit: boolean;
}

export async function problemLoader({ params, request }: LoaderFunctionArgs): Promise<ProblemLoaderData> {
  await ensureSession();
  try {
    return await api.getProblem(params.slug ?? "", { signal: request.signal });
  } catch (error) {
    failure(error, "Could not load that problem.");
  }
}

/** The edit form loads the problem and refuses anyone who cannot change it. */
export async function problemEditLoader(args: LoaderFunctionArgs): Promise<ProblemLoaderData> {
  await requireUser(args.request);
  const loaded = await problemLoader(args);
  if (!loaded.canEdit) {
    throw data<RouteFailure>({ message: "That is not your problem to edit.", notFound: true }, { status: 404 });
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export interface ListsLoaderData {
  lists: List[];
}

export async function listsLoader({ request }: LoaderFunctionArgs): Promise<ListsLoaderData> {
  await requireUser(request);
  try {
    const { lists } = await api.myLists(undefined, { signal: request.signal });
    return { lists };
  } catch (error) {
    failure(error, "Could not load your lists.");
  }
}

export interface ListLoaderData {
  list: List;
  canEdit: boolean;
}

export async function listLoader({ params, request }: LoaderFunctionArgs): Promise<ListLoaderData> {
  await ensureSession();
  try {
    return await api.getList(params.id ?? "", { signal: request.signal });
  } catch (error) {
    failure(error, "Could not load that list.");
  }
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function profileLoader({ params, request }: LoaderFunctionArgs): Promise<ProfileResponse> {
  await ensureSession();
  try {
    return await api.getProfile(params.handle ?? "", { signal: request.signal });
  } catch (error) {
    failure(error, "Could not load that profile.");
  }
}

/**
 * `/profile` is a stable link to your own profile, for menus and bookmarks that
 * cannot know your handle. It redirects rather than rendering, so the page you
 * land on has the same URL anyone else would share.
 */
export async function myProfileLoader({ request }: LoaderFunctionArgs): Promise<Response> {
  const user = await requireUser(request);
  return redirect(`/u/${user.handle}`);
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export interface RoomLoaderData {
  roomId: string;
  room: Room;
  problem: Problem | null;
}

export async function roomLoader({ params, request }: LoaderFunctionArgs): Promise<RoomLoaderData> {
  await ensureSession();
  const roomId = params.roomId ?? "";
  try {
    const response = await api.getRoom(roomId, { signal: request.signal });
    return { roomId, room: response.room, problem: response.problem ?? null };
  } catch (error) {
    failure(error, "Could not open this workspace.");
  }
}
