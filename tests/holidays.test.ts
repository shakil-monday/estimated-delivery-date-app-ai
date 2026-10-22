import { describe, expect, it } from "vitest";
import { addMonths, expandHolidays, isValidDate, nextOccurrence } from "../app/lib/holidays";

const h = (date: string, repeatsYearly = false, active = true) => ({ date, repeatsYearly, active });

describe("expandHolidays", () => {
  it("expands a yearly holiday into each year of the 18-month window", () => {
    expect(expandHolidays([h("2026-12-25", true)], "2026-10-21")).toEqual(["2026-12-25", "2027-12-25"]);
  });

  it("respects the starting year and never adds earlier years", () => {
    expect(expandHolidays([h("2027-12-25", true)], "2026-10-21")).toEqual(["2027-12-25"]);
  });

  it("includes Feb 29 only in leap years", () => {
    expect(expandHolidays([h("2024-02-29", true)], "2026-10-21")).toEqual(["2028-02-29"]);
    expect(expandHolidays([h("2024-02-29", true)], "2025-01-01")).toEqual([]);
  });

  it("leaves out inactive and past holidays, and dates beyond the window", () => {
    expect(
      expandHolidays([h("2026-11-01", false, false), h("2026-01-01"), h("2028-06-01")], "2026-10-21"),
    ).toEqual([]);
  });

  it("de-duplicates and sorts dates shared by several holidays", () => {
    expect(
      expandHolidays([h("2026-12-31"), h("2026-12-25"), h("2026-12-25"), h("2025-12-25", true)], "2026-10-21"),
    ).toEqual(["2026-12-25", "2026-12-31", "2027-12-25"]);
  });
});

describe("nextOccurrence", () => {
  it("returns the first occurrence on or after today", () => {
    expect(nextOccurrence(h("2020-12-25", true), "2026-10-21")).toBe("2026-12-25");
    expect(nextOccurrence(h("2020-03-01", true), "2026-10-21")).toBe("2027-03-01");
    expect(nextOccurrence(h("2026-10-21", true), "2026-10-21")).toBe("2026-10-21");
  });

  it("never returns a date before the starting year", () => {
    expect(nextOccurrence(h("2028-01-01", true), "2026-10-21")).toBe("2028-01-01");
  });

  it("skips non-leap years for Feb 29", () => {
    expect(nextOccurrence(h("2024-02-29", true), "2026-10-21")).toBe("2028-02-29");
  });

  it("returns null for a past one-time holiday", () => {
    expect(nextOccurrence(h("2026-01-01"), "2026-10-21")).toBeNull();
  });
});

describe("date helpers", () => {
  it("validates calendar dates", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2027-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("26-1-1")).toBe(false);
  });

  it("adds months, clamping to the month's last day", () => {
    expect(addMonths("2026-10-21", 18)).toBe("2028-04-21");
    expect(addMonths("2026-08-31", 18)).toBe("2028-02-29");
  });
});
