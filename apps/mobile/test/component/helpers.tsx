/**
 * Shared harness for component tests.
 *
 * Components read server state through TanStack Query, so tests provide a
 * real QueryClient with the relevant keys seeded and fetching effectively
 * disabled (staleTime: Infinity, no retries). Assertions then run against
 * the same cache → hook → UI path production uses — no query mocking.
 */
import React from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function renderWithQueryClient(
  ui: React.ReactElement,
  seed?: (client: QueryClient) => void,
) {
  const client = createTestQueryClient();
  seed?.(client);
  const result = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { ...result, client };
}
