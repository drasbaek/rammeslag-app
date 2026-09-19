"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthGateProvider } from "@/components/auth/auth-gate";
import { NewSessionProvider } from "@/components/session/new-session";

/**
 * Everything is fetched in the browser. No server component in this app reads
 * data — see docs/ARCHITECTURE.md: the frontend is a pure HTTP client.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthGateProvider>
        <NewSessionProvider>{children}</NewSessionProvider>
      </AuthGateProvider>
    </QueryClientProvider>
  );
}
