# Estimated Delivery Date (Shopify app)

Shows shoppers when their order will arrive, for example **"Arrives Thu, Oct 30 – Mon, Nov 3"**. The estimate skips weekends and holidays and adjusts to the shopper's country. Merchants configure the app in the Shopify admin and place a theme app block anywhere on their store.

Built from the official Shopify React Router app template (TypeScript), with Polaris web components, Prisma, and a theme app extension.

## Quick start (local)

```bash
npm install
npm run config:link     # link to your app in the Partner Dashboard (fills client_id in shopify.app.toml)
npm run dev             # shopify app dev: tunnels, installs on your dev store, runs migrations (SQLite)
npm test                # Vitest unit tests
```

After installing, open the app, then use **Add to theme** on the Home page to drop the *Delivery estimate* block onto a product page.

## How it works

```
Admin pages ─save─► Prisma DB (source of truth) ─syncShopConfig()─► shop metafield $app:delivery.config (JSON)
Storefront app block (Liquid) reads metafield + shopper country ─► widget.js computes dates in the browser
```

- The storefront never calls the app server. Dates are computed in the shopper's browser, so cached page HTML can't show a stale date.
- One shared module, `extensions/delivery-estimate/assets/estimate.js`, holds the date logic. The storefront uses it, and the admin preview and simulator import it.
- The admin loads these shared files through a small Vite plugin in `vite.config.ts`, which serves them as virtual modules (`/@id/...`). Without it, Vite would serve them at `/extensions/...`. The Shopify CLI dev proxy reserves that path and returns 404, so the admin's JavaScript never loads and nothing on the page responds to clicks. Keep importing them with relative paths, and import the widget CSS as `virtual:ede-widget-css`.

## Project layout

| Path | What |
|---|---|
| `extensions/delivery-estimate/assets/estimate.js` | `calculateEstimate`, `formatEstimate`, `formatEstimateParts`, `todayInTimezone` (pure, no dependencies) |
| `extensions/delivery-estimate/assets/render.js`, `icons.js`, `widget.css` | `renderWidget(design, text)`: design tokens become CSS variables, plus an inline SVG icon |
| `extensions/delivery-estimate/assets/widget.js` | Storefront entry: mounts every `.ede-widget`. Never throws, and collapses the block when it has nothing to show |
| `extensions/delivery-estimate/blocks/delivery-estimate.liquid` | App block (`target: section`, no `enabled_on`), so it works on any page |
| `app/services/sync.server.ts` | `syncShopConfig(admin, shop)` builds the metafield config and writes it with `metafieldsSet`. `ensureShopSetup` creates the default rows and syncs on install |
| `app/services/shop.server.ts` | Loads and parses DB rows, creates default rows, `shop/redact` cleanup |
| `app/lib/config.ts` | `buildConfig()`: the storefront JSON contract (pure, used by sync and preview) |
| `app/lib/holidays.ts` | Yearly-holiday expansion (`expandHolidays`), `nextOccurrence`, date helpers |
| `app/lib/validation.ts` | All server-side validation (also used by the preview to detect invalid input) |
| `app/routes/app.*.tsx` | Home/onboarding, Settings, Design, Holidays, Regions, `sync` (Re-sync) |
| `app/services/store-info.server.ts` | Preview link, theme-editor deep link and block-in-theme check. Loaders return it un-awaited so it streams in |
| `app/components/` | Preview panel, sync error banner, React wrappers for Polaris web components |
| `tests/` | Vitest: estimate rules, holiday expansion, validation, renderer and widget |

## Database: SQLite locally, PostgreSQL in production

Prisma can't switch providers with an environment variable, so there are two schemas:

- `prisma/schema.prisma` (SQLite). **This is the one you edit.** Its migrations are in `prisma/migrations`.
- `prisma/postgres/schema.prisma` is generated from it by `npm run prisma:pg-schema`. Its migrations are in `prisma/postgres/migrations`.

`scripts/prisma.mjs` runs Prisma against the Postgres schema when `DATABASE_URL` starts with `postgres://` or `postgresql://`, and against SQLite otherwise. The `build`, `setup` and `shopify app dev` commands all go through it.

To change the schema:

```bash
# 1. edit prisma/schema.prisma, then
npx prisma migrate dev --name <change>                   # SQLite migration
npm run prisma:pg-schema                                 # regenerate the Postgres schema
mkdir prisma/postgres/migrations/<timestamp>_<change>
npx prisma migrate diff --from-schema-datamodel <previous pg schema> \
  --to-schema-datamodel prisma/postgres/schema.prisma --script \
  > prisma/postgres/migrations/<timestamp>_<change>/migration.sql
```

## Deploy to Railway

1. Create a Railway project with a **Node service** (this repo) and a **PostgreSQL** database.
2. Set these service variables: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` (the Railway URL), `SCOPES=read_products,read_themes`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`, plus `OWNER_PASSWORD` and `OWNER_SESSION_SECRET` for the owner panel. See `.env.example`.
3. `railway.toml` builds with `npm ci && npm run build`, starts with `npm run docker-start` (which generates the Prisma client, runs `migrate deploy` and starts the server), and uses `/health` as its health check.
4. Set `application_url` and the redirect URLs in `shopify.app.toml` to the Railway URL, then run `npm run deploy`. This pushes the app config, the metafield definition, the webhooks and the theme extension.

## Billing (Free / Pro)

Plans are defined in `app/lib/plans.ts` and registered in `app/shopify.server.ts` (Shopify Billing API). See `plans/pro-subscription-and-owner-analytics-panel.md` for the full design.

| | Free | Pro ($4.99 / 30 days, 7-day trial) |
|---|---|---|
| Processing / shipping days, weekends, presets, preview | ✓ | ✓ |
| Holidays, regions, custom widget design | — | ✓ |
| "Powered by" note under the widget | shown | hidden |

- **Merchant page:** **Plan** (`app/routes/app.plan.tsx`) starts the trial with `billing.request` (Shopify shows its approval page) and cancels with `billing.cancel`. Each shop gets one trial; returning subscribers are charged immediately.
- **Source of truth:** the `app_subscriptions/update` webhook (`app/routes/webhooks.app_subscriptions.update.tsx`) updates `AppSubscription` and `ShopInstall.plan`, then re-syncs the storefront config.
  - `refreshBilling` (`app/services/billing.server.ts`) re-reads every subscription from Shopify once a day, and right after the merchant approves a charge, in case a webhook was missed.
- **The rule:** Pro only while a subscription is `ACTIVE`. `FROZEN` means the merchant's Shopify bill is unpaid; the shop drops to Free until Shopify unfreezes it, then Pro returns automatically.
- **Gating** happens in `buildConfig` (`app/lib/config.ts`).
  - Free shops' holidays, regions and custom design stay in the database and apply again on the next sync after upgrading.
  - The Holidays, Regions and Design actions reject Pro-only changes on Free. Deleting is still allowed.
- **Test charges:** used whenever `NODE_ENV !== "production"` or `BILLING_TEST=true`. Development stores can't be charged for real.
- **App Store listing:** enter the same pricing there.

## Owner panel

`<app-url>/owner` is a private dashboard for you, outside Shopify. It is enabled only when `OWNER_PASSWORD` and `OWNER_SESSION_SECRET` are set, and returns 404 otherwise. Login is password-only, with a signed cookie valid for 7 days and a limit of 5 failed attempts per IP per 15 minutes.

- **Installs:** total (including reinstalls), uninstalls, currently installed, this month, last 30 days, and a 12-week chart.
  - Recorded by the `afterAuth` hook (install or reinstall) and the `app/uninstalled` webhook, in `app/services/analytics.server.ts`.
- **Subscriptions:**
  - current MRR (paying, past trial),
  - **estimated** total billed to date (started 30-day periods after the trial, minus frozen time),
  - counts: paying, in trial, frozen, cancelled, and conversion.
  - Test charges are hidden unless you tick "Show test charges".
  - The estimate ignores refunds, prorations and Shopify's revenue share. Use the Partner Dashboard for actual payouts.
- **Shops table:** searchable by domain.
- **What `shop/redact` keeps:** the `ShopInstall`, `AppSubscription` and `AppEvent` rows. They are business and billing records with no customer data, so mention them in your privacy policy.

## Decisions and deviations from the build plan

Where the plan left a choice open, these are the choices made:

- **TypeScript.** The current template is TypeScript, so app code is `.ts/.tsx`. The sync service is `app/services/sync.server.ts`, not `.js`. The shared storefront modules stay plain JS.
- **Metafield access in Liquid** uses the `$app` prefix: `shop.metafields['$app:delivery'].config.value`, so the app ID is never hard-coded. It is declared in `shopify.app.toml` as `[shop.metafields.delivery.config]` with `access.storefront = "public_read"`.
- **Onboarding tracking.** `ShopSettings` has two extra nullable columns, `settingsSavedAt` and `designSavedAt`, which drive checklist steps 1 and 2.
- **Block-in-theme check.** `read_themes` reads the live theme's `templates/*.json` and `sections/*.json` and looks for `/blocks/delivery-estimate/`. If that query fails, both buttons ("Preview on your store" and "Add to theme") are shown.
- **"Preview on your store"** opens the most recently updated active product, or the home page if there is none.
- **Simulator.** `calculateEstimate(config, { today })` accepts an optional `"YYYY-MM-DD"` override alongside `now`. The preview rebuilds the holiday list from the simulated date, so yearly holidays expand correctly for any pretend date.
- **Timezone.** `shop.ianaTimezone` is fetched on every sync and stored if it changed. The holiday window is today through today + 18 months as of the last sync. Opening the app re-syncs automatically when the last successful sync is older than 30 days, so the window keeps moving.
- **Explanation counts.** A holiday that falls on a weekend day is counted as a skipped weekend day, not as a skipped holiday. Counting covers the days from tomorrow through the end date (from today when the day count is 0).
- **Locale.** Storefront dates use `request.locale.iso_code`. The admin preview uses `en-US`.
- **No layout shift.** The block reserves the widget's height in Liquid, using the same formula as `estimateHeight()` in `render.js`. The block only collapses when there is nothing to show (invalid config, or a hidden country).
- **Dates** in the message are bold and use the accent color.
- **Icon colour** is a separate token (`iconColor`), as the plan lists. The CSS variables include `--ede-icon` and `--ede-icon-size` in addition to the ones in the plan.

## Testing checklist

Automated: `npm test` covers every case in plan §8.1, plus holiday expansion, validation, rendering and the widget.

Manual: follow the end-to-end script in plan §10 on a development store. For webhooks:

```bash
shopify app webhook trigger --topic shop/redact --address <app-url>/webhooks/shop/redact
shopify app webhook trigger --topic customers/data_request --address <app-url>/webhooks/customers/data_request
shopify app webhook trigger --topic customers/redact --address <app-url>/webhooks/customers/redact
```
