import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useState } from "react";
import { TamaguiProvider, Theme } from "tamagui";
import tamaguiConfig from "@/tamagui.config";

export function Providers({
  children,
  colorScheme,
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
        },
      }),
  );

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <Theme name={colorScheme === "dark" ? "dark" : "light"}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </Theme>
    </TamaguiProvider>
  );
}
