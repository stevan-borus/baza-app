import { describe, expect, it } from "vitest";
import {
  accumulateByKey,
  accumulateIntoBucketSeries,
  accumulateIntoSlots,
  accumulatePeriodSeries,
  parseOptionalWindow,
  resolveBucketedWindow,
  roundedRatio,
  sortedByMetricDesc,
} from "@/lib/server/report-aggregation";

describe("accumulatePeriodSeries", () => {
  it("groups rows into day-labeled buckets in first-seen (chronological) order", () => {
    const rows = [
      { at: new Date("2026-05-01T08:00:00Z"), amount: 100 },
      { at: new Date("2026-05-01T18:00:00Z"), amount: 50 },
      { at: new Date("2026-05-03T09:00:00Z"), amount: 25 },
    ];
    const series = accumulatePeriodSeries(
      rows,
      "day",
      (row) => row.at,
      (label) => ({ label, revenue: 0, count: 0 }),
      (acc, row) => {
        acc.revenue += row.amount;
        acc.count += 1;
      },
    );
    expect(series).toEqual([
      { label: "2026-05-01", revenue: 150, count: 2 },
      { label: "2026-05-03", revenue: 25, count: 1 },
    ]);
  });

  it("labels week buckets with the ISO week of the row's date", () => {
    // 2026-05-04 is a Monday → ISO week 19 of 2026.
    const rows = [
      { at: new Date("2026-05-04T08:00:00Z") },
      { at: new Date("2026-05-10T08:00:00Z") }, // Sunday, same ISO week
      { at: new Date("2026-05-11T08:00:00Z") }, // next Monday → W20
    ];
    const series = accumulatePeriodSeries(
      rows,
      "week",
      (row) => row.at,
      (label) => ({ label, count: 0 }),
      (acc) => {
        acc.count += 1;
      },
    );
    expect(series).toEqual([
      { label: "2026-W19", count: 2 },
      { label: "2026-W20", count: 1 },
    ]);
  });

  it("returns an empty series for no rows", () => {
    expect(
      accumulatePeriodSeries(
        [],
        "month",
        (row: { at: Date }) => row.at,
        (label) => ({ label }),
        () => {},
      ),
    ).toEqual([]);
  });
});

describe("accumulateByKey", () => {
  it("groups rows by key in first-seen order, seeding the accumulator from the first row", () => {
    const sessions = [
      { roomId: "room-b", roomName: "Sala B", capacity: 6, booked: 4 },
      { roomId: "room-a", roomName: "Sala A", capacity: 10, booked: 2 },
      { roomId: "room-b", roomName: "Sala B", capacity: 6, booked: 6 },
    ];
    const rows = accumulateByKey(
      sessions,
      (s) => s.roomId,
      (s) => ({ roomId: s.roomId, roomName: s.roomName, capacity: 0, booked: 0 }),
      (acc, s) => {
        acc.capacity += s.capacity;
        acc.booked += s.booked;
      },
    );
    expect(rows).toEqual([
      { roomId: "room-b", roomName: "Sala B", capacity: 12, booked: 10 },
      { roomId: "room-a", roomName: "Sala A", capacity: 10, booked: 2 },
    ]);
  });

  it("drops rows whose key is null", () => {
    const rows = accumulateByKey(
      [{ id: "a" as string | null }, { id: null }, { id: "a" }],
      (r) => r.id,
      (r) => ({ id: r.id, count: 0 }),
      (acc) => {
        acc.count += 1;
      },
    );
    expect(rows).toEqual([{ id: "a", count: 2 }]);
  });
});

describe("accumulateIntoBucketSeries", () => {
  const buckets = [
    { bucketStart: new Date("2026-05-01T00:00:00Z"), bucketEnd: new Date("2026-05-02T00:00:00Z") },
    { bucketStart: new Date("2026-05-02T00:00:00Z"), bucketEnd: new Date("2026-05-03T00:00:00Z") },
    { bucketStart: new Date("2026-05-03T00:00:00Z"), bucketEnd: new Date("2026-05-04T00:00:00Z") },
  ];

  it("emits one slot per bucket — empty buckets stay zero-filled", () => {
    const payments = [
      { at: new Date("2026-05-01T10:00:00Z"), amount: 100 },
      { at: new Date("2026-05-03T09:30:00Z"), amount: 40 },
      { at: new Date("2026-05-03T12:00:00Z"), amount: 5 },
    ];
    const series = accumulateIntoBucketSeries(
      buckets,
      payments,
      (p) => p.at,
      (b) => ({
        bucketStart: b.bucketStart.toISOString(),
        bucketEnd: b.bucketEnd.toISOString(),
        revenue: 0,
        paymentCount: 0,
      }),
      (acc, p) => {
        acc.revenue += p.amount;
        acc.paymentCount += 1;
      },
    );
    expect(series).toEqual([
      {
        bucketStart: "2026-05-01T00:00:00.000Z",
        bucketEnd: "2026-05-02T00:00:00.000Z",
        revenue: 100,
        paymentCount: 1,
      },
      {
        bucketStart: "2026-05-02T00:00:00.000Z",
        bucketEnd: "2026-05-03T00:00:00.000Z",
        revenue: 0,
        paymentCount: 0,
      },
      {
        bucketStart: "2026-05-03T00:00:00.000Z",
        bucketEnd: "2026-05-04T00:00:00.000Z",
        revenue: 45,
        paymentCount: 2,
      },
    ]);
  });

  it("drops rows outside the bucket window (before first start / at-or-after last end)", () => {
    const series = accumulateIntoBucketSeries(
      buckets,
      [
        { at: new Date("2026-04-30T23:59:59Z") },
        { at: new Date("2026-05-04T00:00:00Z") },
      ],
      (r) => r.at,
      () => ({ count: 0 }),
      (acc) => {
        acc.count += 1;
      },
    );
    expect(series).toEqual([{ count: 0 }, { count: 0 }, { count: 0 }]);
  });

  it("returns an empty series when there are no buckets", () => {
    expect(
      accumulateIntoBucketSeries(
        [],
        [{ at: new Date("2026-05-01T10:00:00Z") }],
        (r) => r.at,
        () => ({ count: 0 }),
        (acc: { count: number }) => {
          acc.count += 1;
        },
      ),
    ).toEqual([]);
  });
});

describe("accumulateIntoSlots", () => {
  it("accumulates rows into a fixed slot grid by index, keeping slot order stable", () => {
    const slots = Array.from({ length: 3 }, () => ({ booked: 0 }));
    const result = accumulateIntoSlots(
      slots,
      [{ idx: 2, booked: 4 }, { idx: 0, booked: 1 }, { idx: 2, booked: 2 }],
      (r) => r.idx,
      (acc, r) => {
        acc.booked += r.booked;
      },
    );
    expect(result).toEqual([{ booked: 1 }, { booked: 0 }, { booked: 6 }]);
  });

  it("drops rows whose slot index is null (e.g. out-of-hours sessions)", () => {
    const slots = [{ count: 0 }];
    accumulateIntoSlots(
      slots,
      [{ idx: null as number | null }, { idx: 0 }],
      (r) => r.idx,
      (acc) => {
        acc.count += 1;
      },
    );
    expect(slots).toEqual([{ count: 1 }]);
  });
});

describe("sortedByMetricDesc", () => {
  it("sorts descending by the metric without mutating the input", () => {
    const input = [{ v: 1 }, { v: 3 }, { v: 2 }];
    const sorted = sortedByMetricDesc(input, (r) => r.v);
    expect(sorted).toEqual([{ v: 3 }, { v: 2 }, { v: 1 }]);
    expect(input).toEqual([{ v: 1 }, { v: 3 }, { v: 2 }]);
  });

  it("keeps first-seen order for ties (stable sort)", () => {
    const sorted = sortedByMetricDesc(
      [
        { id: "first", v: 1 },
        { id: "second", v: 1 },
        { id: "third", v: 1 },
      ],
      (r) => r.v,
    );
    expect(sorted.map((r) => r.id)).toEqual(["first", "second", "third"]);
  });

  it("applies the tie-break comparator only when metrics are equal", () => {
    const sorted = sortedByMetricDesc(
      [
        { name: "b", count: 2 },
        { name: "a", count: 2 },
        { name: "c", count: 5 },
      ],
      (r) => r.count,
      (a, b) => a.name.localeCompare(b.name),
    );
    expect(sorted.map((r) => r.name)).toEqual(["c", "a", "b"]);
  });
});

describe("roundedRatio", () => {
  it("returns the ratio rounded to 4 decimals", () => {
    expect(roundedRatio(1, 3)).toBe(0.3333);
    expect(roundedRatio(2, 3)).toBe(0.6667);
  });

  it("returns 0 when the denominator is zero (empty capacity)", () => {
    expect(roundedRatio(5, 0)).toBe(0);
  });
});

describe("parseOptionalWindow", () => {
  const params = (q: string) => new URLSearchParams(q);

  it("returns the window when both bounds are present and ordered", () => {
    const result = parseOptionalWindow(
      params("from=2026-05-01T00:00:00Z&to=2026-06-01T00:00:00Z"),
    );
    expect(result).toEqual({
      kind: "window",
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-06-01T00:00:00Z"),
    });
  });

  it("returns all-time when both bounds are absent (the 'Sve vreme' pill)", () => {
    expect(parseOptionalWindow(params(""))).toEqual({ kind: "all-time" });
  });

  it("rejects a one-sided window", () => {
    expect(parseOptionalWindow(params("from=2026-05-01T00:00:00Z"))).toEqual({
      kind: "invalid",
    });
    expect(parseOptionalWindow(params("to=2026-05-01T00:00:00Z"))).toEqual({
      kind: "invalid",
    });
  });

  it("rejects an inverted or empty window", () => {
    expect(
      parseOptionalWindow(
        params("from=2026-06-01T00:00:00Z&to=2026-05-01T00:00:00Z"),
      ),
    ).toEqual({ kind: "invalid" });
    expect(
      parseOptionalWindow(
        params("from=2026-05-01T00:00:00Z&to=2026-05-01T00:00:00Z"),
      ),
    ).toEqual({ kind: "invalid" });
  });

  it("treats an unparseable date like an absent one (matching parseDateInput)", () => {
    // garbage + valid → one-sided → invalid; garbage + garbage → all-time.
    expect(
      parseOptionalWindow(params("from=garbage&to=2026-05-01T00:00:00Z")),
    ).toEqual({ kind: "invalid" });
    expect(parseOptionalWindow(params("from=garbage&to=garbage"))).toEqual({
      kind: "all-time",
    });
  });
});

describe("resolveBucketedWindow", () => {
  it("builds buckets for an explicit window without fetching the earliest row", async () => {
    let fetched = false;
    const resolved = await resolveBucketedWindow(
      new URLSearchParams(
        "from=2026-05-01T00:00:00Z&to=2026-05-04T00:00:00Z&period=month",
      ),
      async () => {
        fetched = true;
        return null;
      },
    );
    expect(fetched).toBe(false);
    expect(resolved).not.toBeNull();
    // period=month → daily buckets, aligned to UTC midnight.
    expect(resolved!.buckets.map((b) => b.bucketStart.toISOString())).toEqual([
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
      "2026-05-03T00:00:00.000Z",
    ]);
    expect(resolved!.queryRange).toEqual({
      gte: new Date("2026-05-01T00:00:00Z"),
      lt: new Date("2026-05-04T00:00:00Z"),
    });
  });

  it("falls back to yearly buckets from the earliest row for the all-time pill", async () => {
    const resolved = await resolveBucketedWindow(
      new URLSearchParams(""),
      async () => new Date("2024-03-05T12:00:00Z"),
    );
    expect(resolved).not.toBeNull();
    expect(resolved!.buckets[0].bucketStart.toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
    // Yearly buckets: each bucket starts on Jan 1.
    for (const b of resolved!.buckets) {
      expect(b.bucketStart.getUTCMonth()).toBe(0);
      expect(b.bucketStart.getUTCDate()).toBe(1);
    }
    // The window reaches past "now" (to = tomorrow UTC midnight).
    expect(
      resolved!.buckets[resolved!.buckets.length - 1].bucketEnd.getTime(),
    ).toBeGreaterThan(Date.now());
    expect(resolved!.queryRange.gte).toEqual(resolved!.buckets[0].bucketStart);
  });

  it("exposes the resolved window bounds separately from the bucket-aligned queryRange", async () => {
    // from mid-week with weekly buckets: the first bucket floors to Monday,
    // so queryRange.gte < from. Callers that scope their domain query to the
    // window (bookings detail headline) need the unaligned bounds.
    const resolved = await resolveBucketedWindow(
      new URLSearchParams(
        "from=2026-05-06T00:00:00Z&to=2026-05-20T00:00:00Z&period=quarter",
      ),
      async () => null,
    );
    expect(resolved!.from).toEqual(new Date("2026-05-06T00:00:00Z"));
    expect(resolved!.to).toEqual(new Date("2026-05-20T00:00:00Z"));
    // 2026-05-06 is a Wednesday → weekly bucket floors to Monday 2026-05-04.
    expect(resolved!.queryRange.gte).toEqual(new Date("2026-05-04T00:00:00Z"));
  });

  it("returns null for a one-sided window", async () => {
    const resolved = await resolveBucketedWindow(
      new URLSearchParams("from=2026-05-01T00:00:00Z"),
      async () => null,
    );
    expect(resolved).toBeNull();
  });
});
