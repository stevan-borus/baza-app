/**
 * useBookingSheet + ClientBookingSheet — shared booking-sheet plumbing.
 *
 * The booking sheet (open/book/cancel + mutation wiring + success/error
 * mapping) is identical on the client calendar and the home overview, so it
 * lives here once. A screen calls `const booking = useBookingSheet()`, opens it
 * with `booking.open(session)` from a row press, and renders
 * `<ClientBookingSheet controller={booking} />`. The sheet stays open after a
 * successful mutation so its in-sheet confirmation can show; it closes when the
 * user dismisses it.
 */
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { BookingSheet } from "@/components/client/booking-sheet";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import type { AvailabilitySession } from "@baza/types/scheduling";

/** Which step the sheet opens on. "cancel" jumps a booked session straight to
 * the cancel-confirmation (used by the hero's OTKAŽI button). */
export type BookingIntent = "view" | "cancel";

export type BookingSheetController = {
  open: (session: AvailabilitySession, intent?: BookingIntent) => void;
  selectedSession: AvailabilitySession | null;
  intent: BookingIntent;
  mutation: ReturnType<typeof useBookingMutation>;
  close: () => void;
};

function useBookingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    ...bookingsQueries.mutateBooking(),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Broad invalidation so both the calendar's and the overview's
      // availability queries (all keyed under ["sessions", ...]) refetch.
      await queryClient.invalidateQueries({ queryKey: sessionsQueries.all });
      await queryClient.invalidateQueries({ queryKey: packagesQueries.all });
    },
  });
}

export function useBookingSheet(): BookingSheetController {
  const [selectedSession, setSelectedSession] =
    useState<AvailabilitySession | null>(null);
  const [intent, setIntent] = useState<BookingIntent>("view");
  const mutation = useBookingMutation();

  return {
    open: (session, nextIntent = "view") => {
      setIntent(nextIntent);
      setSelectedSession(session);
    },
    close: () => {
      setSelectedSession(null);
      mutation.reset();
    },
    selectedSession,
    intent,
    mutation,
  };
}

export function ClientBookingSheet({
  controller,
  sessions,
}: {
  controller: BookingSheetController;
  /**
   * Live sessions array from the screen's availability query. The sheet
   * re-hydrates its open session from this on every render so it reflects
   * fresh bookedCount / isBookedByMe after a mutation — derived, not stored,
   * so there's no state-syncing effect.
   */
  sessions: AvailabilitySession[];
}) {
  const { selectedSession, intent, mutation, close } = controller;

  // Re-hydrate the open sheet's session from the freshly-fetched array so the
  // post-success state reflects current data (e.g. 1/6 → after booking).
  const freshSelectedSession = selectedSession
    ? (sessions.find((s) => s.id === selectedSession.id) ?? selectedSession)
    : null;

  const resultState = mutation.data?.state as string | undefined;

  return (
    <BookingSheet
      session={freshSelectedSession}
      initialStep={
        intent === "cancel" && freshSelectedSession?.isBookedByMe
          ? "confirmCancel"
          : "idle"
      }
      onClose={close}
      onBook={(id) => mutation.mutate({ sessionId: id, action: "BOOK" })}
      onCancel={(id) => mutation.mutate({ sessionId: id, action: "CANCEL" })}
      pending={mutation.isPending}
      successState={
        mutation.isSuccess
          ? resultState === "BOOKED" || resultState === "BOOKED_ALREADY"
            ? "BOOKED"
            : resultState === "WAITLISTED"
              ? "WAITLISTED"
              : resultState === "CANCELED"
                ? "CANCELED"
                : null
          : null
      }
      errorCode={
        mutation.isError
          ? // Only the structured `code` is meaningful here — BookingSheet maps
            // known codes to localized copy and shows a generic message for the
            // rest. Never fall back to `error.message`: it can be a raw Zod blob,
            // and an unmapped code already lands on the friendly fallback.
            ((mutation.error as Error & { code?: string })?.code ?? "UNKNOWN")
          : null
      }
    />
  );
}
