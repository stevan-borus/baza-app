/**
 * Katalog → Treneri → one trainer's percentages, in real Chromium with real
 * RNW, the shipped Serbian copy and a real seeded QueryClient.
 *
 * What the screen has to get right is the DIFFERENCE between a class type that
 * carries its own agreement and one that merely inherits the base: both show a
 * number, and if they look the same the admin cannot tell which ones they have
 * actually negotiated. So the override renders its own percent plainly and the
 * inheritor renders the base marked "(osnovni)".
 *
 * `apiRequest` is stubbed at the transport seam so POST bodies are assertable —
 * everything above it (query factory, rate selection, sheets, i18n) is real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import type { TrainerRateRow } from "@/lib/trainer-rate-selection";

/** "Today" for this spec — every rate below is dated relative to it. */
const TODAY = "2026-08-19T09:00:00.000Z";

const TRAINER = { id: "trainer-1", fullName: "Mila Milić", role: "TRAINER" as const };

const CLASS_TYPES = [
  { id: "ct-group", name: "Grupni pilates", maxClients: 8, durationMins: 55 },
  { id: "ct-individual", name: "Individualni", maxClients: 1, durationMins: 55 },
];

/** The default 40% plus a live 60% override on the individual class type. */
const RATES: TrainerRateRow[] = [
  {
    id: "rate-default",
    trainerUserId: TRAINER.id,
    percent: 40,
    classTypeId: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    note: null,
    seq: 1,
  },
  {
    id: "rate-individual",
    trainerUserId: TRAINER.id,
    percent: 60,
    classTypeId: "ct-individual",
    effectiveFrom: "2026-02-01T00:00:00.000Z",
    note: null,
    seq: 2,
  },
];

const postBodies: { path: string; body: Record<string, unknown> }[] = [];
let ratesRows: TrainerRateRow[] = RATES;

const apiRequestMock = vi.fn(
  async (
    path: string,
    opts?: { method?: string; body?: Record<string, unknown> },
  ) => {
    if (opts?.method === "POST") {
      postBodies.push({ path, body: opts.body ?? {} });
      return { success: true, rate: { id: "rate-new" } };
    }
    if (path === "/api/payroll/rates") {
      return {
        success: true,
        rates: ratesRows.map((rate) => ({
          ...rate,
          classTypeName:
            CLASS_TYPES.find((ct) => ct.id === rate.classTypeId)?.name ?? null,
          createdAt: rate.createdAt ?? rate.effectiveFrom,
        })),
      };
    }
    if (path === "/api/trainings/class-types") {
      return { success: true, classTypes: CLASS_TYPES };
    }
    if (path === "/api/users/trainers") {
      return { success: true, users: [TRAINER] };
    }
    if (path === "/api/invites") {
      return { success: true, invites: [] };
    }
    return { success: true };
  },
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

vi.mock("./stubs/expo-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocalSearchParams: () => ({ trainerId: TRAINER.id }),
  };
});

import TrainerRates from "@/app/(admin)/katalog/treneri/[trainerId]";
import TrainerRoster from "@/app/(admin)/katalog/treneri/index";

beforeEach(() => {
  process.env.TEST_ANCHOR_TIME = TODAY;
  postBodies.length = 0;
  ratesRows = RATES;
  apiRequestMock.mockClear();
});

describe("Trainer rates screen", () => {
  it("shows the base percentage, an override's own percent, and the inherited base marked", async () => {
    const screen = renderWithQueryClient(<TrainerRates />);

    // The base rate leads — it is what every unnegotiated class type pays.
    const defaultRow = await screen.findByTestId("procenti-default-row");
    expect(defaultRow.textContent).toContain("Osnovni procenat");
    expect(defaultRow.textContent).toContain("40%");

    // The negotiated one states its own number, unqualified.
    const individual = await screen.findByTestId(
      "procenti-class-type-row-ct-individual",
    );
    expect(individual.textContent).toContain("Individualni");
    expect(individual.textContent).toContain("60%");
    expect(individual.textContent).not.toContain("osnovni");

    // The inheritor shows the same figure the base does, but says so — the
    // admin must not read it as an agreement they made.
    const group = await screen.findByTestId("procenti-class-type-row-ct-group");
    expect(group.textContent).toContain("Grupni pilates");
    expect(group.textContent).toContain("40% (osnovni)");
  });
});

describe("Saving a rate from the trainer's screen", () => {
  it("posts classTypeId when the sheet was opened from a class-type row", async () => {
    const screen = renderWithQueryClient(<TrainerRates />);

    fireEvent.click(await screen.findByTestId("procenti-class-type-row-ct-group"));

    // The sheet is scoped, and says so — a sheet that looks identical in both
    // modes is one that gets saved into the wrong scope. (Assert inside the
    // sheet: the class type's name is also on the row behind it.)
    const sheet = await screen.findByTestId("stub-bottom-sheet");
    expect(sheet.textContent).toContain("Grupni pilates");
    expect(sheet.textContent).toContain(TRAINER.fullName);

    fireEvent.change(screen.getByTestId("procenti-percent-input"), {
      target: { value: "55" },
    });
    fireEvent.click(screen.getByTestId("procenti-save"));

    await waitFor(() => expect(postBodies).toHaveLength(1));
    expect(postBodies[0]!.path).toBe("/api/payroll/rates");
    expect(postBodies[0]!.body).toMatchObject({
      trainerUserId: TRAINER.id,
      classTypeId: "ct-group",
      percent: 55,
      effectiveFrom: "2026-08-19",
    });
  });

  it("posts WITHOUT classTypeId from the base row", async () => {
    const screen = renderWithQueryClient(<TrainerRates />);

    fireEvent.click(await screen.findByTestId("procenti-default-row"));

    // Seeded from the rate in force, so a correction is a one-character edit.
    const input = (await screen.findByTestId(
      "procenti-percent-input",
    )) as HTMLInputElement;
    expect(input.value).toBe("40");

    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.click(screen.getByTestId("procenti-save"));

    await waitFor(() => expect(postBodies).toHaveLength(1));
    expect(postBodies[0]!.body).toMatchObject({
      trainerUserId: TRAINER.id,
      percent: 45,
      effectiveFrom: "2026-08-19",
    });
    // Omitted, not null — null is the tombstone, and sending it here would
    // read as "revert" rather than "the base is 45%".
    expect(postBodies[0]!.body.classTypeId).toBeUndefined();
  });

  it("appends a dated tombstone when an override is reverted", async () => {
    const screen = renderWithQueryClient(<TrainerRates />);

    fireEvent.click(await screen.findByTestId("procenti-revert-ct-individual"));
    fireEvent.click(await screen.findByTestId("procenti-revert-confirm"));

    await waitFor(() => expect(postBodies).toHaveLength(1));
    expect(postBodies[0]!.path).toBe("/api/payroll/rates");
    expect(postBodies[0]!.body).toEqual({
      trainerUserId: TRAINER.id,
      percent: null,
      classTypeId: "ct-individual",
      effectiveFrom: "2026-08-19",
    });
  });

  it("offers no revert on a class type that only inherits the base", async () => {
    const screen = renderWithQueryClient(<TrainerRates />);

    await screen.findByTestId("procenti-class-type-row-ct-group");
    // There is nothing to revert — the row already pays the base.
    expect(screen.queryByTestId("procenti-revert-ct-group")).toBeNull();
  });
});

describe("Trainer roster override hint", () => {
  it("counts the live overrides on the trainer row", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    const hint = await screen.findByTestId(
      `procenti-overrides-hint-${TRAINER.id}`,
    );
    expect(hint.textContent).toContain("+1 posebna");
    // The row still leads with the BASE percentage — the hint is a count, not
    // a replacement for the number the admin came to read.
    expect(
      (await screen.findByTestId(`procenti-value-${TRAINER.id}`)).textContent,
    ).toContain("40%");
  });

  it("drops the hint once the override has been reverted", async () => {
    // A tombstone ENDS the override without deleting its history. The row must
    // follow the effective state, not the presence of scoped rows — otherwise
    // a trainer who was moved back to the base keeps advertising a special
    // rate they no longer have.
    ratesRows = [
      ...RATES,
      {
        id: "rate-individual-end",
        trainerUserId: TRAINER.id,
        percent: null,
        classTypeId: "ct-individual",
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        note: null,
        seq: 3,
      },
    ];

    const screen = renderWithQueryClient(<TrainerRoster />);

    // Wait for the row itself, then assert the hint is absent — otherwise the
    // assertion passes on an empty first render.
    await screen.findByTestId(`procenti-value-${TRAINER.id}`);
    expect(
      screen.queryByTestId(`procenti-overrides-hint-${TRAINER.id}`),
    ).toBeNull();
  });

  it("opens the trainer's rates screen instead of a sheet", async () => {
    const { routerCalls } = await import("./stubs/expo-router");
    routerCalls.length = 0;
    const screen = renderWithQueryClient(<TrainerRoster />);

    fireEvent.click(await screen.findByTestId(`procenti-trainer-${TRAINER.id}`));

    await waitFor(() => expect(routerCalls).toHaveLength(1));
    expect(routerCalls[0]).toMatchObject({
      method: "push",
      args: [
        {
          pathname: "/(admin)/katalog/treneri/[trainerId]",
          params: { trainerId: TRAINER.id },
        },
      ],
    });
    // The roster no longer edits in place.
    expect(screen.queryByTestId("procenti-percent-input")).toBeNull();
  });
});
