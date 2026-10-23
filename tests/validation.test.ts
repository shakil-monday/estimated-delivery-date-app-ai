import { describe, expect, it } from "vitest";
import {
  isDuplicateHoliday,
  validateDesign,
  validateHoliday,
  validateRegion,
  validateSettings,
} from "../app/lib/validation";
import { PRESETS } from "../app/lib/presets";
import { buildConfig, MAX_CONFIG_BYTES } from "../app/lib/config";

const settings = {
  processingMin: 1,
  processingMax: 2,
  shippingMin: 3,
  shippingMax: 5,
  weekendDays: [0, 6],
  unmatchedCountry: "useDefault",
  displayMode: "range",
  messageRange: "Arrives {start} – {end}",
  messageSingle: "Arrives by {end}",
  dateFormat: "short",
};

describe("validateSettings", () => {
  it("accepts valid settings", () => {
    expect(validateSettings(settings).ok).toBe(true);
  });

  it("rejects min > max and out-of-range numbers", () => {
    const r = validateSettings({ ...settings, processingMin: 3, processingMax: 2, shippingMax: 91 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["processingMax", "shippingMax"]);
  });

  it("rejects non-integers", () => {
    expect(validateSettings({ ...settings, shippingMin: 1.5 }).ok).toBe(false);
  });

  it("rejects a weekend covering all seven days", () => {
    const r = validateSettings({ ...settings, weekendDays: [0, 1, 2, 3, 4, 5, 6] });
    expect(r.ok).toBe(false);
  });

  it("requires placeholders in message templates", () => {
    const r = validateSettings({ ...settings, messageRange: "Arrives {end}", messageSingle: "Soon" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["messageRange", "messageSingle"]);
  });
});

describe("validateDesign", () => {
  it("accepts every preset", () => {
    for (const [preset, tokens] of Object.entries(PRESETS)) {
      expect(validateDesign({ preset, ...tokens }).ok).toBe(true);
    }
  });

  it("rejects bad tokens", () => {
    const r = validateDesign({ preset: "boxed", ...PRESETS.boxed, iconSize: 40, textColor: "red" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["iconSize", "textColor"]);
  });
});

describe("holidays", () => {
  it("validates date and name, active by default", () => {
    expect(validateHoliday({ date: "2026-02-30", name: "" }).ok).toBe(false);
    const r = validateHoliday({ date: "2026-12-25", name: "  Christmas " });
    expect(r).toEqual({
      ok: true,
      data: { date: "2026-12-25", name: "Christmas", repeatsYearly: false, active: true },
    });
  });

  it("detects duplicates case-insensitively but allows shared dates", () => {
    const existing = [{ id: 1, date: "2026-12-25", name: "Christmas" }];
    expect(isDuplicateHoliday({ date: "2026-12-25", name: "christmas " }, existing)).toBe(true);
    expect(isDuplicateHoliday({ date: "2026-12-25", name: "Boxing" }, existing)).toBe(false);
    expect(isDuplicateHoliday({ id: 1, date: "2026-12-25", name: "Christmas" }, existing)).toBe(false);
  });
});

describe("validateRegion", () => {
  const others = [{ name: "Europe", countries: ["DE", "FR"] }];

  it("rejects countries used by another region and duplicate names", () => {
    const r = validateRegion({ name: "europe", countries: ["DE"], shippingMin: 1, shippingMax: 2 }, others);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["countries", "name"]);
  });

  it("accepts a valid region", () => {
    const r = validateRegion({ name: "Nordics", countries: ["se", "NO"], shippingMin: 2, shippingMax: 4 }, others);
    expect(r).toEqual({ ok: true, data: { name: "Nordics", countries: ["NO", "SE"], shippingMin: 2, shippingMax: 4 } });
  });
});

describe("buildConfig", () => {
  it("stays under 64 KB with the maximum number of holidays", () => {
    const parsed = validateSettings(settings);
    if (!parsed.ok) throw new Error("invalid");
    const holidays = Array.from({ length: 200 }, (_, i) => ({
      date: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      repeatsYearly: true,
      active: true,
    }));
    const config = buildConfig({
      isPro: true,
      timezone: "America/New_York",
      settings: parsed.data,
      design: { preset: "boxed", ...PRESETS.boxed },
      holidays,
      regions: [{ name: "World", countries: ["US", "CA"], shippingMin: 1, shippingMax: 2 }],
      today: "2026-10-21",
    });
    expect(config.holidays.length).toBeGreaterThan(0);
    expect(new TextEncoder().encode(JSON.stringify(config)).length).toBeLessThan(MAX_CONFIG_BYTES);
  });
});
