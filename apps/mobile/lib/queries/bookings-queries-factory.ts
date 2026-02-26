import { mutationOptions } from "@tanstack/react-query";
import { bookingMutationResultSchema } from "@baza/types";
import { apiFetch } from "@/lib/api";
import { sharedEnv } from "@/lib/env.shared";

export const bookingsQueries = {
  mutateBooking: () =>
    mutationOptions({
      mutationKey: ["bookings", "mutate"] as const,
      mutationFn: async (payload: { sessionId: string; action: "BOOK" | "CANCEL" }) => {
        const response = await apiFetch(`${sharedEnv.EXPO_PUBLIC_API_URL}/api/bookings`, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`Booking request failed (${response.status})`);
        }
        const result = await response.json();
        return bookingMutationResultSchema.parse(result);
      },
    }),
};
