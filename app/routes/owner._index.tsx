import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { requireOwner } from "../services/owner-auth.server";
import { loadOwnerDashboard } from "../services/owner-stats.server";
import ownerCss from "../styles/owner.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: ownerCss }];
export const meta: MetaFunction = () => [{ title: "Owner panel" }, { name: "robots", content: "noindex" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireOwner(request);
  const url = new URL(request.url);
  const includeTest = url.searchParams.get("test") === "1";
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  return { ...(await loadOwnerDashboard({ includeTest, query })), includeTest, query };
};

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const date = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "—";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="owner__card">
      <div className="owner__label">{label}</div>
      <div className="owner__value">{value}</div>
      {hint && <div className="owner__hint">{hint}</div>}
    </div>
  );
}

function WeeklyChart({ weeks }: { weeks: { start: string; installs: number; uninstalls: number }[] }) {
  const W = 720;
  const H = 160;
  const pad = 24;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.installs, w.uninstalls)));
  const slot = (W - pad) / weeks.length;
  const bar = Math.max(4, slot / 2 - 4);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  return (
    <div className="owner__card">
      <svg className="owner__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Installs and uninstalls per week">
        <line x1={pad} x2={W} y1={H - pad} y2={H - pad} stroke="#e1e3e5" />
        <text x={0} y={y(max) + 4} fontSize="10" fill="#6d7175">
          {max}
        </text>
        {weeks.map((w, i) => {
          const x = pad + i * slot + 2;
          return (
            <g key={w.start}>
              <rect x={x} y={y(w.installs)} width={bar} height={H - pad - y(w.installs)} fill="#2c6ecb" rx="2">
                <title>{`Week of ${date(w.start)}: ${w.installs} installs`}</title>
              </rect>
              <rect x={x + bar + 2} y={y(w.uninstalls)} width={bar} height={H - pad - y(w.uninstalls)} fill="#d72c0d" rx="2">
                <title>{`Week of ${date(w.start)}: ${w.uninstalls} uninstalls`}</title>
              </rect>
              {i % 2 === 0 && (
                <text x={x} y={H - 8} fontSize="10" fill="#6d7175">
                  {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(w.start))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="owner__legend">
        <span style={{ color: "#2c6ecb" }}>Installs</span>
        <span style={{ color: "#d72c0d" }}>Uninstalls</span>
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const d = useLoaderData<typeof loader>();
  const s = d.subscriptions;
  return (
    <div className="owner">
      <div className="owner__wrap">
        <div className="owner__header">
          <h1>Estimated Delivery Date · Owner panel</h1>
          <Form method="post" action="/owner/logout">
            <button type="submit">Log out</button>
          </Form>
        </div>

        <h2>Installs</h2>
        <div className="owner__grid">
          <Stat label="Total installs" value={d.installs.total} hint="Including reinstalls" />
          <Stat label="Uninstalls" value={d.installs.uninstalls} />
          <Stat label="Currently installed" value={d.installs.current} />
          <Stat label="This month" value={`+${d.installs.installsMonth} / −${d.installs.uninstallsMonth}`} hint="Installs / uninstalls" />
          <Stat label="Last 30 days" value={`+${d.installs.installs30} / −${d.installs.uninstalls30}`} hint="Installs / uninstalls" />
        </div>

        <h2>Subscriptions {d.includeTest && "(including test charges)"}</h2>
        <div className="owner__grid">
          <Stat label="Current MRR" value={money(s.mrr)} hint="Paying, past trial" />
          <Stat label="Total billed to date" value={money(s.billedToDate)} hint="Estimate" />
          <Stat label="Paying Pro" value={s.paying} />
          <Stat label="In trial" value={s.inTrial} />
          <Stat label="Frozen (unpaid)" value={s.frozen} />
          <Stat label="Cancelled" value={s.cancelled} />
          <Stat label="Conversion" value={`${s.conversion}%`} hint="Pro (incl. trial) ÷ installed" />
        </div>
        <p className="owner__note">
          Billed to date is estimated from subscription periods (trial and frozen time excluded). It ignores refunds,
          prorations and Shopify&apos;s revenue share; see the Partner Dashboard for actual payouts.
        </p>

        <h2>Last 12 weeks</h2>
        <WeeklyChart weeks={d.weekly} />

        <h2>Shops</h2>
        <Form method="get" className="owner__toolbar">
          <input type="search" name="q" placeholder="Search shop domain" defaultValue={d.query} />
          <label>
            <input type="checkbox" name="test" value="1" defaultChecked={d.includeTest} /> Show test charges
          </label>
          <button type="submit">Apply</button>
        </Form>
        <div className="owner__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Plan</th>
                <th>Subscription</th>
                <th>First installed</th>
                <th>Uninstalled</th>
                <th>Installs</th>
              </tr>
            </thead>
            <tbody>
              {d.shops.length === 0 && (
                <tr>
                  <td colSpan={6}>No shops yet.</td>
                </tr>
              )}
              {d.shops.map((shop) => (
                <tr key={shop.shop}>
                  <td>{shop.shop}</td>
                  <td>
                    <span className={`owner__badge ${shop.plan === "pro" ? "owner__badge--pro" : ""}`}>
                      {shop.plan === "pro" ? "Pro" : "Free"}
                    </span>
                  </td>
                  <td>{shop.status ?? "—"}</td>
                  <td>{date(shop.firstInstalledAt)}</td>
                  <td>
                    {shop.uninstalledAt ? (
                      <span className="owner__badge owner__badge--gone">{date(shop.uninstalledAt)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{shop.installCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
