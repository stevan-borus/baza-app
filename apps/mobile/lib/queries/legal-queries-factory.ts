import { queryOptions } from "@tanstack/react-query";
import { legalDocumentResponseSchema, legalDocumentsListResponseSchema, type ConsentDocumentKey } from "@baza/types/consent";
import { apiRequest } from "@/lib/api-request";

const legalAll = ["legal"] as const;

export const legalQueries = {
  all: legalAll,

  list: () =>
    queryOptions({
      queryKey: [...legalAll, "documents", "list"] as const,
      queryFn: () =>
        apiRequest("/api/legal/documents", {
          schema: legalDocumentsListResponseSchema,
          errorMessage: "Unable to list legal documents",
        }),
      staleTime: 60 * 60 * 1000,
    }),

  byKey: (key: ConsentDocumentKey, locale: "sr" | "en") =>
    queryOptions({
      queryKey: [...legalAll, "documents", key, locale] as const,
      queryFn: () =>
        apiRequest(`/api/legal/documents/${key}`, {
          params: { locale },
          schema: legalDocumentResponseSchema,
          errorMessage: `Unable to load ${key}/${locale}`,
        }),
      staleTime: 60 * 60 * 1000,
    }),
};
