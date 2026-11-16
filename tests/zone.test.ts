import { describe, expect, it } from "vitest";
import { nextZoneMonth, validTz, zoneDay, zoneDayAgo, zoneMonthStart, zoneStartOf } from "@/lib/zone";

const LA = "America/Los_Angeles";
describe("days in a viewer's time zone", () => {
  it("a day starts at that zone's midnight, whichever zone it is", () => {
    expect(new Date(zoneStartOf("2026-11-12", LA)).toISOString()).toBe("2026-11-12T08:00:00.000Z");
    expect(new Date(zoneStartOf("2026-07-04", LA)).toISOString()).toBe("2026-07-04T07:00:00.000Z");
    expect(new Date(zoneStartOf("2026-11-01", LA)).toISOString()).toBe("2026-11-01T07:00:00.000Z"); // clocks change that night
    expect(new Date(zoneStartOf("2026-11-02", LA)).toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(new Date(zoneStartOf("2026-11-12", "America/New_York")).toISOString()).toBe("2026-11-12T05:00:00.000Z");
    expect(new Date(zoneStartOf("2026-11-12", "Europe/London")).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(new Date(zoneStartOf("2026-11-12", "Australia/Sydney")).toISOString()).toBe("2026-11-11T13:00:00.000Z");
  });
  it("the same moment is a different day in different zones", () => {
    const t = Date.parse("2026-11-16T03:30:00Z");
    expect(zoneDay(t, LA)).toBe("2026-11-15");
    expect(zoneDay(t, "Europe/London")).toBe("2026-11-16");
    expect(zoneDay(t, "Asia/Tokyo")).toBe("2026-11-16");
  });
  it("steps back by calendar days across a clock change", () => {
    const now = Date.parse("2026-11-03T20:00:00Z");
    expect([0, 1, 2, 3].map((i) => zoneDayAgo(now, i, LA))).toEqual(["2026-11-03", "2026-11-02", "2026-11-01", "2026-10-31"]);
  });
  it("finds the start of the month and the next one", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(new Date(zoneMonthStart(now, 0, LA)).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(new Date(zoneMonthStart(now, 1, LA)).toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(new Date(nextZoneMonth(zoneMonthStart(now, 0, LA), LA)).toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
  it("only accepts real zone names", () => {
    expect(validTz("America/Chicago")).toBe("America/Chicago");
    expect(validTz("Not/AZone")).toBeNull();
    expect(validTz("'; drop table x;--")).toBeNull();
    expect(validTz(undefined)).toBeNull();
  });
});
