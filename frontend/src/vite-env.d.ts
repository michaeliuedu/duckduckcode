/// <reference types="vite/client" />

/** Build/dev-time overrides. See src/config.ts for how they are resolved. */
interface ImportMetaEnv {
  /** Absolute backend URL, for running the dev server against another backend. */
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
