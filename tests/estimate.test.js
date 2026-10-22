import { describe, expect, it } from "vitest";
import {
  calculateEstimate,
  formatEstimate,
  formatEstimateParts,
  todayInTimezone,
} from "../extensions/delivery-estimate/assets/estimate.js";
import { expandHolidays } from "../app/lib/holidays";

// 2026-10-21 is a Wednesday.
const base = {
  version: 1,
  timezone: "UTC",
  processing: { min: 1, max: 2 },
  shipping: { min: 3, max: 5 },
  weekendDays: [0, 6],
  holidays: [],
  regions: [],
  unmatchedCountry: "useDefault",
  displayMode: "range",
  messageRange: "Arrives {start} – {end}",
  messageSingle: "Arrives by {end}",
  dateFormat: "short",
};
const config = (overrides = {}) => ({ ...base, ...overrides });
const at = (today, overrides, countryCode = null) =>
  calculateEstimate(config(overrides), { today, countryCode });

describe("calculateEstimate", () => {
  it("skips the weekend when ordering on a Friday", () => {
    const r = at("2026-10-23");
    expect([r.start, r.end]).toEqual(["2026-10-29", "2026-11-03"]);
    expect(r.explain.skippedWeekendDays).toBe(4);
  });

  it.each(["2026-10-24", "2026-10-25"])("ordering on a weekend day (%s) starts counting Monday", (today) => {
    const r = at(today);
    expect([r.start, r.end]).toEqual(["2026-10-29", "2026-11-03"]);
  });

  it("supports a custom Fri+Sat weekend", () => {
    const r = at("2026-10-21", { weekendDays: [5, 6] });
    expect([r.start, r.end]).toEqual(["2026-10-27", "2026-11-01"]);
  });

  it("skips a holiday inside the window", () => {
    expect([at("2026-10-21").start, at("2026-10-21").end]).toEqual(["2026-10-27", "2026-10-30"]);
    const r = at("2026-10-21", { holidays: ["2026-10-27"] });
    expect([r.start, r.end]).toEqual(["2026-10-28", "2026-11-02"]);
    expect(r.explain.skippedHolidays).toEqual(["2026-10-27"]);
  });

  it("skips holidays next to a weekend", () => {
    const r = at("2026-10-21", { holidays: ["2026-10-30", "2026-11-02"] });
    expect([r.start, r.end]).toEqual(["2026-10-27", "2026-11-03"]);
    expect(r.explain).toEqual({
      regionName: null,
      skippedWeekendDays: 4,
      skippedHolidays: ["2026-10-30", "2026-11-02"],
    });
  });

  it("does not skip an inactive holiday (it is absent from the config)", () => {
    const holidays = expandHolidays(
      [{ date: "2026-10-27", repeatsYearly: false, active: false }],
      "2026-10-21",
    );
    expect(holidays).toEqual([]);
    expect(at("2026-10-21", { holidays }).start).toBe("2026-10-27");
  });

  it("skips a yearly holiday expanded by the sync helper", () => {
    const holidays = expandHolidays(
      [{ date: "2025-12-25", repeatsYearly: true, active: true }],
      "2026-12-21",
    );
    expect(holidays).toContain("2026-12-25");
    // Mon 21 Dec 2026: 22, 23, 24, (25 holiday), 28 → 4th business day.
    expect(at("2026-12-21", { holidays }).start).toBe("2026-12-28");
  });

  it("uses the shop's date when UTC is already tomorrow", () => {
    const now = new Date("2026-10-22T02:00:00Z"); // 22:00 on Oct 21 in New York
    expect(todayInTimezone(now, "America/New_York")).toBe("2026-10-21");
    expect(todayInTimezone(now, "UTC")).toBe("2026-10-22");
    const zero = { processing: { min: 0, max: 0 }, shipping: { min: 0, max: 0 } };
    const ny = calculateEstimate(config({ ...zero, timezone: "America/New_York" }), { now });
    expect(ny.start).toBe("2026-10-21");
    const utc = calculateEstimate(config(zero), { now });
    expect(utc.start).toBe("2026-10-22");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(todayInTimezone(new Date("2026-10-22T02:00:00Z"), "Not/AZone")).toBe("2026-10-22");
  });

  const regions = [{ name: "Europe", countries: ["DE", "FR"], shipping: { min: 5, max: 8 } }];

  it("uses the matching region's shipping range", () => {
    const r = at("2026-10-21", { regions }, "de");
    expect([r.start, r.end]).toEqual(["2026-10-29", "2026-11-04"]);
    expect(r.explain.regionName).toBe("Europe");
  });

  it("uses the default range for an unmatched country", () => {
    const r = at("2026-10-21", { regions }, "US");
    expect([r.start, r.end]).toEqual(["2026-10-27", "2026-10-30"]);
    expect(r.explain.regionName).toBeNull();
  });

  it("hides the estimate for an unmatched country when set to hide", () => {
    expect(at("2026-10-21", { regions, unmatchedCountry: "hide" }, "US")).toBeNull();
  });

  it("uses the default range for an unknown country even when set to hide", () => {
    const r = at("2026-10-21", { regions, unmatchedCountry: "hide" }, null);
    expect(r.start).toBe("2026-10-27");
  });

  it("handles n = 0", () => {
    const zero = { processing: { min: 0, max: 0 }, shipping: { min: 0, max: 0 } };
    expect(at("2026-10-21", zero).start).toBe("2026-10-21");
    const sat = at("2026-10-24", zero);
    expect([sat.start, sat.end]).toEqual(["2026-10-26", "2026-10-26"]);
    expect(sat.explain.skippedWeekendDays).toBe(2);
  });

  it("returns null when the 400-day safety limit is hit", () => {
    expect(at("2026-10-21", { shipping: { min: 300, max: 400 } })).toBeNull();
  });

  it("returns null for a missing config", () => {
    expect(calculateEstimate(null, { now: new Date() })).toBeNull();
  });
});

describe("formatEstimate", () => {
  it("formats a range", () => {
    const r = at("2026-10-23");
    expect(formatEstimate(r, config(), "en-US")).toBe("Arrives Thu, Oct 29 – Tue, Nov 3");
  });

  it("uses the single message when start equals end", () => {
    const c = config({ processing: { min: 1, max: 1 }, shipping: { min: 2, max: 2 } });
    const r = calculateEstimate(c, { today: "2026-10-21" });
    expect(r.start).toBe(r.end);
    expect(formatEstimate(r, c, "en-US")).toBe("Arrives by Mon, Oct 26");
  });

  it("uses the single message in single display mode", () => {
    const c = config({ displayMode: "single", dateFormat: "long" });
    const r = calculateEstimate(c, { today: "2026-10-23" });
    expect(formatEstimate(r, c, "en-US")).toBe("Arrives by Tuesday, November 3");
  });

  it("marks date segments so they can be accented", () => {
    const parts = formatEstimateParts(at("2026-10-23"), config(), "en-US");
    expect(parts).toEqual([
      { text: "Arrives ", isDate: false },
      { text: "Thu, Oct 29", isDate: true },
      { text: " – ", isDate: false },
      { text: "Tue, Nov 3", isDate: true },
    ]);
  });
});
