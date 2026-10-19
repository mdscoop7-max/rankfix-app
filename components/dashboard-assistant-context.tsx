"use client";

import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";

type Context = { scanId: string | null; errorContext: string | null };
const empty: Context = { scanId: null, errorContext: null };
const AssistantContext = createContext<{ context: Context; setContext: Dispatch<SetStateAction<Context>> } | null>(null);

export function DashboardAssistantProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState(empty);
  return <AssistantContext.Provider value={{ context, setContext }}>{children}</AssistantContext.Provider>;
}

export function useDashboardAssistantContext() { return useContext(AssistantContext); }

export function DashboardAssistantContext({ scanId = null, errorContext = null }: Partial<Context>) {
  const setContext = useDashboardAssistantContext()?.setContext;
  useEffect(() => {
    setContext?.({ scanId, errorContext });
    return () => setContext?.(empty);
  }, [setContext, scanId, errorContext]);
  return null;
}
