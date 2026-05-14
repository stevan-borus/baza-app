import { queryOptions } from "@tanstack/react-query";
import {
  legalDocumentResponseSchema,
  legalDocumentsListResponseSchema,
  type ConsentDocumentKey,
} from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

const BASE = `${sharedEnv.EXPO_PUBLIC_API_URL}/api/legal`;

export const legalQueries = {
  list: () =>
    queryOptions({
      queryKey: ["legal", "documents", "list"] as const,
      queryFn: async () => {
        const res = await apiFetch(`${BASE}/documents`);
        if (!res.ok) throw new Error(`Unable to list legal documents (${res.status})`);
        return legalDocumentsListResponseSchema.parse(await res.json());
      },
      staleTime: 60 * 60 * 1000,
    }),

  byKey: (key: ConsentDocumentKey, locale: "sr" | "en") =>
    queryOptions({
      queryKey: ["legal", "documents", key, locale] as const,
      queryFn: async () => {
        const res = await apiFetch(`${BASE}/documents/${key}?locale=${locale}`);
        if (!res.ok) throw new Error(`Unable to load ${key}/${locale} (${res.status})`);
        return legalDocumentResponseSchema.parse(await res.json());
      },
      staleTime: 60 * 60 * 1000,
    }),
};
