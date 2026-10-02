/** Entry point: fonts, styles, router. */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";

import { ensureSession } from "./auth/session";
import { router } from "./routes/router";

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");

// Start resolving the session before the first render, so the header does not
// flicker from "Sign in" to an avatar. Route guards await the same promise, so
// correctness does not depend on this finishing first — only the flicker does.
await ensureSession();

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
