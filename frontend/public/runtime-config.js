// Default runtime configuration: the backend shares the page's origin.
//
// The Docker entrypoint (docker-entrypoint.sh) rewrites this file at container
// start from BACKEND_PUBLIC_URL, so the same built image works locally and on
// AWS without a rebuild. During `npm run dev` the Vite proxy forwards /api and
// /ws to the Go backend, so the empty default is also correct there.
window.__DUCKDUCKCODE__ = { backendUrl: "" };
