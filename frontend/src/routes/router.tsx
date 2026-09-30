/**
 * The route table — the whole navigable surface of the app in one screen.
 *
 * Data is fetched by loaders, writes go through actions, and failures are
 * handled by one error boundary. The room chunk is loaded lazily while its data
 * request is already in flight, so the editor bundle never delays the home page.
 */

import { createBrowserRouter } from "react-router";
import { createRoomAction } from "./actions";
import { loginAction, logoutAction, settingsAction, signupAction } from "./authActions";
import { EditProblemPage } from "./EditProblemPage";
import { AppLoading, NotFoundPage, RouteErrorBoundary } from "./ErrorPages";
import { HomePage, HomeSkeleton } from "./HomePage";
import { ListPage } from "./ListPage";
import { ListsPage } from "./ListsPage";
import { LoginPage } from "./LoginPage";
import {
  homeLoader,
  listLoader,
  listsLoader,
  myProfileLoader,
  problemEditLoader,
  problemLoader,
  problemsLoader,
  profileLoader,
  requireAnonymous,
  requireUser,
  roomLoader,
} from "./loaders";
import { NewProblemPage } from "./NewProblemPage";
import { createProblemAction, editProblemAction, listAction, listsAction } from "./problemActions";
import { ProblemPage } from "./ProblemPage";
import { ProblemsPage } from "./ProblemsPage";
import { ProfilePage } from "./ProfilePage";
import { SettingsPage } from "./SettingsPage";
import { SignupPage } from "./SignupPage";

export const router = createBrowserRouter([
  {
    path: "/",
    ErrorBoundary: RouteErrorBoundary,
    HydrateFallback: AppLoading,
    children: [
      // The front page is the problem browser: default problems, then popular.
      { index: true, loader: homeLoader, Component: HomePage, HydrateFallback: HomeSkeleton },

      // Problems.
      {
        path: "problems/new",
        loader: async ({ request }) => {
          await requireUser(request);
          return null;
        },
        action: createProblemAction,
        Component: NewProblemPage,
      },
      { path: "problems", loader: problemsLoader, Component: ProblemsPage },
      { path: "problems/:slug", loader: problemLoader, Component: ProblemPage },
      {
        path: "problems/:slug/edit",
        loader: problemEditLoader,
        action: editProblemAction,
        Component: EditProblemPage,
      },

      // Lists.
      { path: "lists", loader: listsLoader, action: listsAction, Component: ListsPage },
      { path: "lists/:id", loader: listLoader, action: listAction, Component: ListPage },

      { path: "u/:handle", loader: profileLoader, Component: ProfilePage },
      { path: "profile", loader: myProfileLoader },

      // Action-only: the home page and problem pages post here to create a
      // room, and the action redirects to it.
      { path: "rooms/new", action: createRoomAction },
      {
        path: "rooms/:roomId",
        loader: roomLoader,
        lazy: { Component: () => import("./RoomPage").then((module) => module.RoomPage) },
      },

      // Accounts.
      { path: "login", loader: requireAnonymous, action: loginAction, Component: LoginPage },
      { path: "signup", loader: requireAnonymous, action: signupAction, Component: SignupPage },
      { path: "logout", action: logoutAction },
      {
        path: "settings",
        loader: async ({ request }) => {
          await requireUser(request);
          return null;
        },
        action: settingsAction,
        Component: SettingsPage,
      },

      { path: "*", Component: NotFoundPage },
    ],
  },
]);
