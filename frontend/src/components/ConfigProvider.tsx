"use client";

import { createContext, useContext, type ReactNode } from "react";

interface Config {
  /** Backend base URL for the browser; "" means same origin. */
  backendUrl: string;
}

const ConfigContext = createContext<Config>({ backendUrl: "" });

export function ConfigProvider({ backendUrl, children }: { backendUrl: string; children: ReactNode }) {
  return <ConfigContext.Provider value={{ backendUrl }}>{children}</ConfigContext.Provider>;
}

export function useConfig(): Config {
  return useContext(ConfigContext);
}
