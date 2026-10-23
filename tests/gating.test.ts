import { describe, expect, it } from "vitest";
import { buildConfig } from "../app/lib/config";
import { PRESETS, type Design } from "../app/lib/presets";
import { planFromStatus } from "../app/lib/plans";
import type { SettingsInput } from "../app/lib/validation";

const settings: SettingsInput = {
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
const customDesign: Design = { ...PRESETS.pill, preset: "pill", background: "#ff0000", fontSize: 20 };
const input = (isPro: boolean) => ({
  isPro,
  timezone: "UTC",
  settings,
  design: customDesign,
  holidays: [{ date: "2026-12-25", repeatsYearly: false, active: true }],
  regions: [{ name: "Europe", countries: ["DE"], shippingMin: 5, shippingMax: 8 }],
  today: "2026-10-22",
});

describe("plan gating in buildConfig", () => {
  it("Pro passes holidays, regions and the custom design through, without branding", () => {
    const config = buildConfig(input(true));
    expect(config.holidays).toEqual(["2026-12-25"]);
    expect(config.regions).toHaveLength(1);
    expect(config.design).toEqual(customDesign);
    expect(config.branding).toBe(false);
  });

  it("Free drops holidays and regions, uses the preset's tokens and adds branding", () => {
    const config = buildConfig(input(false));
    expect(config.holidays).toEqual([]);
    expect(config.regions).toEqual([]);
    expect(config.design).toEqual({ ...PRESETS.pill, preset: "pill" });
    expect(config.branding).toBe(true);
    // Settings and weekends still apply.
    expect(config.processing).toEqual({ min: 1, max: 2 });
    expect(config.weekendDays).toEqual([0, 6]);
  });
});

describe("planFromStatus", () => {
  it.each([
    ["ACTIVE", "pro"],
    ["PENDING", "free"],
    ["ACCEPTED", "free"],
    ["DECLINED", "free"],
    ["EXPIRED", "free"],
    ["FROZEN", "free"],
    ["CANCELLED", "free"],
    [null, "free"],
  ])("%s → %s", (status, plan) => {
    expect(planFromStatus(status)).toBe(plan);
  });
});
