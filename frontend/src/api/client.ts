/**
 * HTTP client for the room API.
 *
 * Callers get `api.getRoom(id, { signal })` rather than having to thread the
 * backend base URL through every component; the base comes from the resolved
 * runtime config. `createApi` exists so tests (and any future multi-backend use)
 * can supply their own.
 */

import { config } from "@/config";
import { apiUrl } from "./urls";
import type {
  AuthResponse,
  ChangePasswordRequest,
  CreateRoomRequest,
  HomeFeed,
  List,
  ListDraft,
  ListResponse,
  LoginRequest,
  MyListsResponse,
  ProblemDraft,
  ProblemListResponse,
  ProblemResponse,
  ProblemSearch,
  ProfileResponse,
  RoomResponse,
  SignupRequest,
  UpdateProfileRequest,
  Visibility,
} from "./types";

/** Per-field messages from a rejected form, keyed by the form field name. */
export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Populated when the server rejected specific fields. */
    readonly fields: FieldErrors = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The room or problem does not exist. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** The caller is not signed in, or not signed in as the right person. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
}

async function readError(response: Response): Promise<ApiError> {
  let message = `${response.status} ${response.statusText}`.trim();
  let fields: FieldErrors = {};
  try {
    const body = (await response.json()) as { error?: unknown; fields?: unknown };
    if (typeof body.error === "string" && body.error) message = body.error;
    if (body.fields && typeof body.fields === "object") {
      fields = Object.fromEntries(
        Object.entries(body.fields as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  } catch {
    /* non-JSON error bodies are common enough */
  }
  return new ApiError(response.status, message, fields);
}

export interface Api {
  home(options?: RequestOptions): Promise<HomeFeed>;
  searchProblems(search: ProblemSearch, options?: RequestOptions): Promise<ProblemListResponse>;
  getProblem(slug: string, options?: RequestOptions): Promise<ProblemResponse>;
  createProblem(draft: ProblemDraft, options?: RequestOptions): Promise<ProblemResponse>;
  updateProblem(slug: string, draft: ProblemDraft, options?: RequestOptions): Promise<ProblemResponse>;
  setProblemVisibility(slug: string, visibility: Visibility, options?: RequestOptions): Promise<ProblemResponse>;
  deleteProblem(slug: string, options?: RequestOptions): Promise<{ deleted: boolean }>;

  myLists(containsProblem?: string, options?: RequestOptions): Promise<MyListsResponse>;
  createList(draft: ListDraft, options?: RequestOptions): Promise<{ list: List }>;
  getList(id: string, options?: RequestOptions): Promise<ListResponse>;
  updateList(id: string, draft: ListDraft, options?: RequestOptions): Promise<ListResponse>;
  deleteList(id: string, options?: RequestOptions): Promise<{ deleted: boolean }>;
  addToList(id: string, problemId: string, options?: RequestOptions): Promise<ListResponse>;
  removeFromList(id: string, problemId: string, options?: RequestOptions): Promise<ListResponse>;

  getProfile(handle: string, options?: RequestOptions): Promise<ProfileResponse>;
  /** Records that the signed-in person ran a problem's tests. */
  recordAttempt(problemId: string, solved: boolean, options?: RequestOptions): Promise<{ recorded: boolean }>;

  createRoom(request: CreateRoomRequest, options?: RequestOptions): Promise<RoomResponse>;
  getRoom(id: string, options?: RequestOptions): Promise<RoomResponse>;

  signup(request: SignupRequest, options?: RequestOptions): Promise<AuthResponse>;
  login(request: LoginRequest, options?: RequestOptions): Promise<AuthResponse>;
  logout(options?: RequestOptions): Promise<AuthResponse>;
  me(options?: RequestOptions): Promise<AuthResponse>;
  updateProfile(request: UpdateProfileRequest, options?: RequestOptions): Promise<AuthResponse>;
  changePassword(request: ChangePasswordRequest, options?: RequestOptions): Promise<AuthResponse>;
}

export function createApi(base: string, fetchImpl: typeof fetch = fetch): Api {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(apiUrl(base, path), {
        ...init,
        headers: { "content-type": "application/json", ...init.headers },
        cache: "no-store",
        // The session lives in a cookie. Same-origin requests would send it
        // anyway; being explicit also covers running the dev server against a
        // backend on another origin.
        credentials: "include",
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw new ApiError(0, "Could not reach the server. Check your connection.");
    }
    if (!response.ok) throw await readError(response);
    return (await response.json()) as T;
  }

  const problemPath = (slug: string) => `/api/problems/${encodeURIComponent(slug)}`;
  const listPath = (id: string) => `/api/lists/${encodeURIComponent(id)}`;

  return {
    home: (options) => request("/api/home", { ...options }),
    searchProblems: (search, options) => request(`/api/problems${searchQuery(search)}`, { ...options }),
    getProblem: (slug, options) => request(problemPath(slug), { ...options }),
    createProblem: (draft, options) =>
      request("/api/problems", { ...options, method: "POST", body: JSON.stringify(draft) }),
    updateProblem: (slug, draft, options) =>
      request(problemPath(slug), { ...options, method: "PATCH", body: JSON.stringify(draft) }),
    setProblemVisibility: (slug, visibility, options) =>
      request(`${problemPath(slug)}/visibility`, { ...options, method: "PUT", body: JSON.stringify({ visibility }) }),
    deleteProblem: (slug, options) => request(problemPath(slug), { ...options, method: "DELETE" }),

    myLists: (containsProblem, options) =>
      request(`/api/lists${containsProblem ? `?contains=${encodeURIComponent(containsProblem)}` : ""}`, { ...options }),
    createList: (draft, options) => request("/api/lists", { ...options, method: "POST", body: JSON.stringify(draft) }),
    getList: (id, options) => request(listPath(id), { ...options }),
    updateList: (id, draft, options) =>
      request(listPath(id), { ...options, method: "PATCH", body: JSON.stringify(draft) }),
    deleteList: (id, options) => request(listPath(id), { ...options, method: "DELETE" }),
    addToList: (id, problemId, options) =>
      request(`${listPath(id)}/items`, { ...options, method: "POST", body: JSON.stringify({ problemId }) }),
    removeFromList: (id, problemId, options) =>
      request(`${listPath(id)}/items/${encodeURIComponent(problemId)}`, { ...options, method: "DELETE" }),

    getProfile: (handle, options) => request(`/api/users/${encodeURIComponent(handle)}`, { ...options }),
    recordAttempt: (problemId, solved, options) =>
      request("/api/progress", { ...options, method: "POST", body: JSON.stringify({ problemId, solved }) }),

    createRoom: (body, options) => request("/api/rooms", { ...options, method: "POST", body: JSON.stringify(body) }),
    getRoom: (id, options) => request(`/api/rooms/${encodeURIComponent(id)}`, { ...options }),

    signup: (body, options) => request("/api/auth/signup", { ...options, method: "POST", body: JSON.stringify(body) }),
    login: (body, options) => request("/api/auth/login", { ...options, method: "POST", body: JSON.stringify(body) }),
    logout: (options) => request("/api/auth/logout", { ...options, method: "POST" }),
    me: (options) => request("/api/auth/me", { ...options }),
    updateProfile: (body, options) =>
      request("/api/auth/profile", { ...options, method: "PATCH", body: JSON.stringify(body) }),
    changePassword: (body, options) =>
      request("/api/auth/password", { ...options, method: "POST", body: JSON.stringify(body) }),
  };
}

/** Serialises a search into a query string, omitting anything unset. */
export function searchQuery(search: ProblemSearch): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const api: Api = createApi(config.backendUrl);
