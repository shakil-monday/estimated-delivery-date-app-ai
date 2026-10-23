import db from "../db.server";
import {
  PRO_CURRENCY,
  PRO_PLAN,
  PRO_PRICE,
  PRO_TRIAL_DAYS,
  type Plan,
} from "../lib/plans";

const DAY_MS = 24 * 60 * 60 * 1000;

async function logEvent(shop: string, type: string) {
  await db.appEvent.create({ data: { shop, type } });
}

/** afterAuth hook: a new offline session means a first install or a reinstall. */
export async function recordInstall(shop: string) {
  const existing = await db.shopInstall.findUnique({ where: { shop } });
  if (!existing) {
    await db.shopInstall.create({ data: { shop } });
    await logEvent(shop, "install");
    return;
  }
  // afterAuth also runs when an expired offline token is refreshed; only count
  // it as a reinstall if the shop had uninstalled.
  if (existing.uninstalledAt) {
    await db.shopInstall.update({
      where: { shop },
      data: { uninstalledAt: null, lastInstalledAt: new Date(), installCount: { increment: 1 }, plan: "free" },
    });
    await logEvent(shop, "reinstall");
  }
}

/** Creates the install row for shops installed before tracking existed. */
export async function ensureInstallRow(shop: string) {
  const existing = await db.shopInstall.findUnique({ where: { shop }, select: { id: true } });
  if (!existing) {
    await db.shopInstall.create({ data: { shop } });
    await logEvent(shop, "install");
  }
}

/** app/uninstalled webhook. Shopify cancels the app's subscriptions on uninstall. */
export async function recordUninstall(shop: string) {
  const existing = await db.shopInstall.findUnique({ where: { shop } });
  if (existing?.uninstalledAt) return; // webhook retried
  const now = new Date();
  await db.shopInstall.upsert({
    where: { shop },
    create: { shop, uninstalledAt: now, plan: "free" },
    update: { uninstalledAt: now, plan: "free" },
  });
  const open = await db.appSubscription.findMany({ where: { shop, endedAt: null } });
  for (const sub of open) {
    await applySubscriptionStatus({ shop, subscriptionId: sub.subscriptionId, name: sub.name, status: "CANCELLED" });
  }
  await logEvent(shop, "uninstall");
}

export interface SubscriptionUpdate {
  shop: string;
  subscriptionId: string;
  name: string;
  status: string;
  test?: boolean;
  trialDays?: number;
  price?: number;
  currency?: string;
}

/**
 * Applies a subscription status change (from the app_subscriptions/update
 * webhook or a billing.check). Tracks activation, freeze time and end date,
 * logs an event when the status changes, and updates the shop's plan.
 * Returns the shop's plan before and after.
 */
export async function applySubscriptionStatus(update: SubscriptionUpdate): Promise<{ before: Plan; after: Plan }> {
  const now = new Date();
  const status = update.status.toUpperCase();
  const install = await db.shopInstall.findUnique({ where: { shop: update.shop } });
  const before = (install?.plan === "pro" ? "pro" : "free") as Plan;

  const existing = await db.appSubscription.findUnique({ where: { subscriptionId: update.subscriptionId } });
  const data: Record<string, unknown> = { status };
  const unfreeze = () => {
    if (existing?.frozenAt) {
      data.frozenDays = existing.frozenDays + Math.round((now.getTime() - existing.frozenAt.getTime()) / DAY_MS);
      data.frozenAt = null;
    }
  };
  if (status === "ACTIVE") {
    if (!existing?.activatedAt) data.activatedAt = now;
    unfreeze();
  } else if (status === "FROZEN") {
    if (!existing?.frozenAt) data.frozenAt = now;
  } else if (["CANCELLED", "EXPIRED", "DECLINED"].includes(status)) {
    if (!existing?.endedAt) data.endedAt = now;
    unfreeze();
  }
  if (update.test !== undefined) data.test = update.test;

  if (existing) {
    await db.appSubscription.update({ where: { id: existing.id }, data });
  } else {
    await db.appSubscription.create({
      data: {
        shop: update.shop,
        subscriptionId: update.subscriptionId,
        name: update.name,
        price: update.price ?? PRO_PRICE,
        currency: update.currency ?? PRO_CURRENCY,
        trialDays: update.trialDays ?? (update.name === PRO_PLAN ? PRO_TRIAL_DAYS : 0),
        test: update.test ?? false,
        ...data,
      } as Parameters<typeof db.appSubscription.create>[0]["data"],
    });
  }

  if (existing?.status !== status) {
    const type =
      existing?.status === "FROZEN" && status === "ACTIVE" ? "subscription_unfrozen" : `subscription_${status.toLowerCase()}`;
    await logEvent(update.shop, type);
  }

  // The shop is Pro while any of its subscriptions is ACTIVE.
  const active = await db.appSubscription.count({ where: { shop: update.shop, status: "ACTIVE" } });
  const after: Plan = active > 0 ? "pro" : "free";
  await db.shopInstall.upsert({
    where: { shop: update.shop },
    create: { shop: update.shop, plan: after },
    update: { plan: after },
  });
  return { before, after };
}

export async function getPlan(shop: string): Promise<Plan> {
  const install = await db.shopInstall.findUnique({ where: { shop }, select: { plan: true } });
  return install?.plan === "pro" ? "pro" : "free";
}
