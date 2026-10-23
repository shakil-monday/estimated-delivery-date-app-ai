import db from "../db.server";
import { buildConfig, MAX_CONFIG_BYTES } from "../lib/config";
import { todayInTimezone } from "../../extensions/delivery-estimate/assets/estimate.js";
import { createDefaultRows, loadShopData } from "./shop.server";
import { ensureInstallRow } from "./analytics.server";

// Minimal shape of the authenticated Admin API client.
export interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const SHOP_QUERY = `#graphql
  query DeliveryShop { shop { id ianaTimezone } }`;

const METAFIELDS_SET = `#graphql
  mutation DeliveryConfigSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }`;

/**
 * Builds the storefront config from the database (the source of truth) and
 * writes it to the shop metafield `$app:delivery.config`. Records the outcome in
 * ShopSettings.lastSyncedAt / syncError. Returns the error message or null.
 */
export async function syncShopConfig(admin: AdminClient, shop: string): Promise<string | null> {
  try {
    const shopResponse = await admin.graphql(SHOP_QUERY);
    const shopJson = await shopResponse.json();
    const { id: shopId, ianaTimezone } = shopJson.data.shop as { id: string; ianaTimezone: string };

    // Keep the stored timezone current; merchants can change it in Shopify settings.
    const settingsRow = await db.shopSettings.findUnique({ where: { shop } });
    if (settingsRow && ianaTimezone && settingsRow.timezone !== ianaTimezone) {
      await db.shopSettings.update({ where: { shop }, data: { timezone: ianaTimezone } });
    }

    const data = await loadShopData(shop);
    const config = buildConfig({
      isPro: data.isPro,
      timezone: data.timezone,
      settings: data.settings,
      design: data.design,
      holidays: data.holidays,
      regions: data.regions,
      today: todayInTimezone(new Date(), data.timezone),
    });
    const value = JSON.stringify(config);
    if (new TextEncoder().encode(value).length > MAX_CONFIG_BYTES) {
      throw new Error("The delivery config is larger than 64 KB. Remove some holidays or regions.");
    }

    const response = await admin.graphql(METAFIELDS_SET, {
      variables: {
        metafields: [{ ownerId: shopId, namespace: "$app:delivery", key: "config", type: "json", value }],
      },
    });
    const json = await response.json();
    const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
    if (json.errors?.length) throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
    if (userErrors.length) throw new Error(userErrors.map((e: { message: string }) => e.message).join("; "));

    await db.shopSettings.update({ where: { shop }, data: { lastSyncedAt: new Date(), syncError: null } });
    return null;
  } catch (error) {
    const message = await errorMessage(error);
    await db.shopSettings
      .update({ where: { shop }, data: { syncError: message } })
      .catch(() => undefined);
    // Thrown Responses (e.g. 401 → re-authenticate) must still reach the framework.
    if (error instanceof Response) throw error;
    return message;
  }
}

async function errorMessage(error: unknown) {
  if (error instanceof Response) return `Shopify API request failed (HTTP ${error.status}).`;
  if (error && typeof error === "object" && "body" in error) {
    // GraphqlQueryError from @shopify/shopify-api
    const body = (error as { body?: { errors?: { message?: string } } }).body;
    if (body?.errors?.message) return String(body.errors.message);
  }
  return error instanceof Error ? error.message : String(error);
}

const RESYNC_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Runs on every app load: creates default rows and syncs once for a newly
 * installed shop. Also re-syncs a config older than 30 days so the 18-month
 * holiday window keeps moving forward.
 */
export async function ensureShopSetup(admin: AdminClient, shop: string) {
  await ensureInstallRow(shop);
  const created = await createDefaultRows(shop);
  if (created) {
    await syncShopConfig(admin, shop);
    return;
  }
  const settings = await db.shopSettings.findUnique({ where: { shop }, select: { lastSyncedAt: true } });
  const last = settings?.lastSyncedAt?.getTime() ?? 0;
  if (Date.now() - last > RESYNC_AFTER_MS) await syncShopConfig(admin, shop);
}
