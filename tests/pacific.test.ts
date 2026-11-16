import { describe, expect, it } from "vitest";
import { nextPacificMonth, pacificDay, pacificDayAgo, pacificMonthStart, pacificStartOf } from "@/lib/pacific";

describe("Pacific days", () => {
  it("a day starts at midnight Pacific, 8 hours after UTC midnight in winter and 7 in summer", () => {
    expect(new Date(pacificStartOf("2026-11-12")).toISOString()).toBe("2026-11-12T08:00:00.000Z");
    expect(new Date(pacificStartOf("2026-07-04")).toISOString()).toBe("2026-07-04T07:00:00.000Z");
    // The days the clocks change are still found correctly.
    expect(new Date(pacificStartOf("2026-11-01")).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(new Date(pacificStartOf("2026-11-02")).toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });
  it("7pm Pacific is still the same day, though it is already tomorrow in UTC", () => {
    expect(pacificDay(Date.parse("2026-11-16T03:30:00Z"))).toBe("2026-11-15");
    expect(pacificDay(Date.parse("2026-11-16T08:00:00Z"))).toBe("2026-11-16");
  });
  it("steps back by calendar days across the clock change", () => {
    const now = Date.parse("2026-11-03T20:00:00Z");
    expect([0, 1, 2, 3].map((i) => pacificDayAgo(now, i))).toEqual(["2026-11-03", "2026-11-02", "2026-11-01", "2026-10-31"]);
  });
  it("finds the start of the month and the next one", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(new Date(pacificMonthStart(now)).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(new Date(pacificMonthStart(now, 1)).toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(new Date(nextPacificMonth(pacificMonthStart(now))).toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
});
