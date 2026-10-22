import type { Holiday, Region, ShopSettings, WidgetDesign } from "@prisma/client";
import db from "../db.server";
import { DEFAULT_PRESET, PRESETS, type Design, type Preset } from "../lib/presets";
import { parseJSON, type SettingsInput } from "../lib/validation";
import type { RegionValues } from "../lib/config";

export function settingsValues(row: ShopSettings): SettingsInput {
  return {
    processingMin: row.processingMin,
    processingMax: row.processingMax,
    shippingMin: row.shippingMin,
    shippingMax: row.shippingMax,
    weekendDays: parseJSON<number[]>(row.weekendDays, [0, 6]),
    unmatchedCountry: row.unmatchedCountry === "hide" ? "hide" : "useDefault",
    displayMode: row.displayMode === "single" ? "single" : "range",
    messageRange: row.messageRange,
    messageSingle: row.messageSingle,
    dateFormat: row.dateFormat === "long" ? "long" : "short",
  };
}

export function designValues(row: WidgetDesign | null): Design {
  const preset = (row && row.preset in PRESETS ? row.preset : DEFAULT_PRESET) as Preset;
  return { ...PRESETS[preset], ...parseJSON(row?.style, {}), preset };
}

export function regionValues(row: Region): RegionValues & { id: number } {
  return {
    id: row.id,
    name: row.name,
    countries: parseJSON<string[]>(row.countries, []),
    shippingMin: row.shippingMin,
    shippingMax: row.shippingMax,
  };
}

export function holidayValues(row: Holiday) {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    repeatsYearly: row.repeatsYearly,
    active: row.active,
  };
}

/** Loads every row for a shop. Assumes ensureShopSetup has run. */
export async function loadShopData(shop: string) {
  const [settings, design, holidays, regions] = await Promise.all([
    db.shopSettings.findUnique({ where: { shop } }),
    db.widgetDesign.findUnique({ where: { shop } }),
    db.holiday.findMany({ where: { shop }, orderBy: [{ date: "asc" }, { name: "asc" }] }),
    db.region.findMany({ where: { shop }, orderBy: { name: "asc" } }),
  ]);
  if (!settings) throw new Error(`No settings for ${shop}`);
  return {
    settingsRow: settings,
    timezone: settings.timezone,
    settings: settingsValues(settings),
    design: designValues(design),
    holidays: holidays.map(holidayValues),
    regions: regions.map(regionValues),
  };
}

/** Creates the default rows for a newly installed shop. Returns true if it created them. */
export async function createDefaultRows(shop: string) {
  const existing = await db.shopSettings.findUnique({ where: { shop } });
  if (existing) return false;
  const tokens = PRESETS[DEFAULT_PRESET];
  await db.$transaction([
    db.shopSettings.upsert({ where: { shop }, create: { shop }, update: {} }),
    db.widgetDesign.upsert({
      where: { shop },
      create: { shop, preset: DEFAULT_PRESET, style: JSON.stringify(tokens) },
      update: {},
    }),
  ]);
  return true;
}

/** shop/redact: remove every row for the shop. */
export async function deleteShopData(shop: string) {
  await db.$transaction([
    db.shopSettings.deleteMany({ where: { shop } }),
    db.widgetDesign.deleteMany({ where: { shop } }),
    db.holiday.deleteMany({ where: { shop } }),
    db.region.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
}
