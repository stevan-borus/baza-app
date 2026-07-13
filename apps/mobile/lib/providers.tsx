import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useState } from "react";

export function Providers({
  children,
}: PropsWithChildren<{ colorScheme: "light" | "dark" }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            retry: false,
          },
          // Mutations must NEVER auto-retry. TanStack already defaults
          // mutation retry to 0, but that default is implicit — a future
          // global tweak could flip it on. A silent retry on a flaky staging
          // connection is the one accident vector that can double-create a
          // ClientPackage or BillingRecord (the assign/billing POSTs are not
          // idempotent), so we pin it off explicitly at the one place that
          // governs every mutation.
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
