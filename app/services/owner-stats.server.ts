import db from "../db.server";
import { subscriptionMetrics, weeklyCounts } from "../lib/owner-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything the owner dashboard shows. `query` filters the shop table. */
export async function loadOwnerDashboard({ includeTest, query }: { includeTest: boolean; query: string }) {
  const now = new Date();
  const since = new Date(now.getTime() - 12 * 7 * DAY_MS);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last30 = new Date(now.getTime() - 30 * DAY_MS);

  const [installs, uninstalls, current, installsMonth, uninstallsMonth, installs30, uninstalls30, events, subs, shops] =
    await Promise.all([
      db.appEvent.count({ where: { type: { in: ["install", "reinstall"] } } }),
      db.appEvent.count({ where: { type: "uninstall" } }),
      db.shopInstall.count({ where: { uninstalledAt: null } }),
      db.appEvent.count({ where: { type: { in: ["install", "reinstall"] }, createdAt: { gte: monthStart } } }),
      db.appEvent.count({ where: { type: "uninstall", createdAt: { gte: monthStart } } }),
      db.appEvent.count({ where: { type: { in: ["install", "reinstall"] }, createdAt: { gte: last30 } } }),
      db.appEvent.count({ where: { type: "uninstall", createdAt: { gte: last30 } } }),
      db.appEvent.findMany({
        where: { type: { in: ["install", "reinstall", "uninstall"] }, createdAt: { gte: since } },
        select: { type: true, createdAt: true },
      }),
      db.appSubscription.findMany(),
      db.shopInstall.findMany({
        where: query ? { shop: { contains: query } } : undefined,
        orderBy: { lastInstalledAt: "desc" },
        take: 200,
      }),
    ]);

  const metrics = subscriptionMetrics(
    subs.map((s) => ({ ...s, price: Number(s.price) })),
    now,
    { includeTest },
  );
  const latestStatus = new Map<string, string>();
  for (const s of [...subs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (includeTest || !s.test) latestStatus.set(s.shop, s.status);
  }

  return {
    installs: { total: installs, uninstalls, current, installsMonth, uninstallsMonth, installs30, uninstalls30 },
    subscriptions: {
      ...metrics,
      conversion: current > 0 ? Math.round(((metrics.paying + metrics.inTrial) / current) * 1000) / 10 : 0,
    },
    weekly: weeklyCounts(events, now).map((w) => ({ ...w, start: w.start.toISOString() })),
    shops: shops.map((s) => ({
      shop: s.shop,
      plan: s.plan,
      status: latestStatus.get(s.shop) ?? null,
      firstInstalledAt: s.firstInstalledAt.toISOString(),
      uninstalledAt: s.uninstalledAt?.toISOString() ?? null,
      installCount: s.installCount,
    })),
  };
}
