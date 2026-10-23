# Plan: Pro subscription (Shopify Billing API) + owner analytics panel

## Context
The app is free today. You want:
1. **A paid plan:** a Free and a Pro plan, billed through Shopify.
2. **An owner panel:** a private dashboard to track installs, uninstalls and subscription revenue.

The decisions you made:
- **Billing:** the Shopify Billing API from code, using the template's `billing` helper.
- **Plans:** Free, plus **Pro at $4.99 / 30 days with a 7-day trial**.
- **What Pro unlocks:** Holidays, Regions and Custom design.
- **Owner panel:** password-protected, outside Shopify. It shows **current MRR** (monthly recurring revenue), **estimated total billed to date**, and **subscriber counts** (active, trial, cancelled).

**Assumption to confirm when approving:** your answers combined "Pro unlocks all" with the specific features. I've read that as:
- **Free** = settings plus the 4 presets, with no holidays, no regions, no custom styling, and a small "Powered by Estimated Delivery Date" note under the widget.
- **Pro** = everything, with no note.

## 0. Save this plan in the project
Copy this plan to `plans/pro-subscription-and-owner-analytics-panel.md`, creating the `plans/` directory in the repo root. This is the first step, before any code changes.

## 1. Data model (`prisma/schema.prisma`, then `npm run prisma:pg-schema` and both migrations, as in README)
```prisma
model ShopInstall {            // one row per shop, never deleted on uninstall
  id                 Int       @id @default(autoincrement())
  shop               String    @unique
  firstInstalledAt   DateTime  @default(now())
  lastInstalledAt    DateTime  @default(now())
  uninstalledAt      DateTime?            // null = currently installed
  installCount       Int       @default(1)
  plan               String    @default("free")   // "free" | "pro"
}

model AppSubscription {        // one row per Shopify AppSubscription
  id             Int       @id @default(autoincrement())
  shop           String
  subscriptionId String    @unique          // gid://shopify/AppSubscription/…
  name           String                     // "Pro"
  status         String                     // ACTIVE | CANCELLED | DECLINED | EXPIRED | FROZEN | PENDING
  price          Decimal                    // 4.99
  currency       String    @default("USD")
  trialDays      Int       @default(0)
  test           Boolean   @default(false)
  createdAt      DateTime  @default(now())
  activatedAt    DateTime?
  endedAt        DateTime?
  @@index([shop])
}

model AppEvent {               // append-only log for counts and history
  id        Int      @id @default(autoincrement())
  shop      String
  type      String   // install | reinstall | uninstall | subscription_activated | subscription_cancelled | …
  createdAt DateTime @default(now())
  @@index([type, createdAt])
}
```
- **`shop/redact` must keep these rows.** The cleanup in `deleteShopData` (`app/services/shop.server.ts`) stays limited to the settings, holidays, regions and sessions tables. These rows are business records, so the privacy policy must say so.
- **Optional, for privacy:** store a hash of the shop domain once the shop has been redacted.

## 2. Billing config: `app/shopify.server.ts`
- Add `billing: { [PRO_PLAN]: { trialDays: 7, lineItems: [{ amount: 4.99, currencyCode: "USD", interval: BillingInterval.Every30Days }] } }` to `shopifyApp()`.
- Export `PRO_PLAN = "Pro"` and `PRO_PRICE` from a new `app/lib/plans.ts`. The same file holds `isPro(plan)`, the feature flags, and `IS_TEST_BILLING = process.env.NODE_ENV !== "production" || process.env.BILLING_TEST === "true"`. Dev stores need test charges.

## 3. Install / uninstall tracking
- **`app/shopify.server.ts`:** add `hooks.afterAuth: ({ session, admin }) => recordInstall(session.shop)`. The library calls this when a new offline session is created, which covers both first install and reinstall, because uninstall deletes sessions.
  - `recordInstall`: upsert `ShopInstall`. On reinstall, increment `installCount`, set `lastInstalledAt` and clear `uninstalledAt`. Then write an `AppEvent` (`install` or `reinstall`).
  - This lives in a new `app/services/analytics.server.ts`, which also holds `recordUninstall` and `recordSubscription`.
- **`app/routes/webhooks.app.uninstalled.tsx`:** after the existing session delete, call `recordUninstall(shop)`. It sets `uninstalledAt` and logs an `uninstall` event. Shopify cancels the app's subscriptions on uninstall, so it also marks any open `AppSubscription` as `CANCELLED` with `endedAt = now`.
- **Backfill for existing installs:** `ensureShopSetup` (`app/services/sync.server.ts`) creates a `ShopInstall` row if one is missing. This covers your dev store, which was installed before this change.

## 4. Subscription flow (merchant side)
- **New page `app/routes/app.plan.tsx`** ("Plan" in `s-app-nav` in `app/routes/app.tsx`):
  - **Loader:** `billing.check({ plans: [PRO_PLAN], isTest })` returns the current plan, status and trial end.
  - **UI:** two plan cards (Free and Pro) with a feature comparison.
  - **"Start 7-day free trial":** an action calling `billing.request({ plan: PRO_PLAN, isTest, returnUrl })`. Shopify shows its own approval page.
  - **"Cancel plan":** a confirmation modal, then `billing.cancel({ subscriptionId, prorate: true, isTest })`.
  - **returnUrl:** `https://admin.shopify.com/store/{handle}/apps/{appHandle}/app/plan?charge=done`. `appHandle` comes from a one-time `currentAppInstallation { app { handle } }` query, cached on `ShopSettings`.
- **New webhook `app_subscriptions/update`** (`shopify.app.toml` and `app/routes/webhooks.app_subscriptions.update.tsx`). Shopify sends it on activate, cancel, decline, expire and freeze. It's the source of truth:
  - upsert `AppSubscription` from the payload (`admin_graphql_api_id`, `name`, `status`, timestamps),
  - set `ShopInstall.plan` to `"pro"` only while the status is `ACTIVE`,
  - log an event,
  - re-sync the storefront config with `unauthenticated.admin(shop)` plus `syncShopConfig`, so gating takes effect immediately.
- **Return page safety net:** when the merchant lands on `/app/plan?charge=done`, the loader runs `billing.check` and applies the same upsert. This covers a slow webhook.
- **New scope:** none needed. Billing works with the app's existing permissions.

## 4b. Non-payment and other subscription states
Merchants don't pay the app directly. Shopify puts the charge on the merchant's Shopify invoice and pays the app developer. Missed payments therefore show up as status changes on the subscription, which arrive through the `app_subscriptions/update` webhook (§4):

| Status | When it happens | What the app does |
|---|---|---|
| `PENDING` | Charge created, merchant hasn't approved yet | Stay Free |
| `EXPIRED` | Merchant didn't approve within 2 days | Stay Free. The Plan page offers the trial again |
| `DECLINED` | Merchant clicked "Decline" | Stay Free |
| `ACTIVE` | Approved and paid up (the trial counts too) | **Pro** |
| `FROZEN` | Merchant **didn't pay their Shopify bill**, so Shopify froze the store and the subscription | **Drop to Free gating** (storefront config re-synced). Data is kept |
| `ACTIVE` again | Merchant pays, and Shopify unfreezes the store | **Pro restored automatically** on the next webhook. Nothing to do |
| `CANCELLED` | Merchant cancelled, uninstalled, or the store closed | Free. The Plan page offers Pro again (no second trial; Shopify only grants unused trial days) |

- **What a merchant on Free (or no longer on Pro) gets.** This applies to every non-`ACTIVE` status, including `EXPIRED`, `FROZEN` and `CANCELLED`:
  - **The widget never disappears.** It keeps showing estimates from processing days, the default shipping range and weekends.
  - **Style:** their chosen preset's tokens, without their custom colors or sizes, plus the "Powered by" note.
  - **Holidays and regions:** not applied on the storefront.
  - **Nothing is deleted.** Custom design, holidays and regions stay in the database. The admin pages show them read-only under an "Upgrade to restore" banner, and they apply again on the first sync after the subscription becomes `ACTIVE`.
  - **`EXPIRED`** only means a newly requested charge was never approved within 2 days. A Free shop that lets a trial request expire sees no change at all.
- **The rule in code:** `plan = "pro"` only while the latest subscription is `ACTIVE`. Every other status means Free. One function, `planFromStatus(status)` in `app/lib/plans.ts`, has a unit test covering every row above.
- **Plan page (`app.plan.tsx`) for a `FROZEN` subscription:** a warning banner reading "Your Pro plan is paused because your Shopify bill is unpaid. Pro features return automatically once it's paid." The page doesn't offer a new trial, because a new subscription can't be created while frozen.
- **Owner panel:**
  - frozen subscriptions get their own count, "Frozen (unpaid)",
  - they're left out of MRR,
  - billed-to-date stops counting at the moment of freezing and resumes when the subscription is `ACTIVE` again. `AppEvent` records `subscription_frozen` and `subscription_unfrozen` with timestamps to support this.
- **Safety net if a webhook is missed:** the `/app` layout loader re-checks with `billing.check` at most once every 24 hours per shop (timestamp on `ShopInstall`), and fixes the plan if it drifted.

## 5. Feature gating (server-enforced, data kept)
- **Load the plan:** `loadShopData` (`app/services/shop.server.ts`) also returns the plan from `ShopInstall`.
- **`buildConfig` (`app/lib/config.ts`)** gains an `isPro` input. When Free:
  - `holidays: []`, `regions: []`,
  - `design` = the chosen preset's tokens from `PRESETS` (`app/lib/presets.ts`), ignoring custom tokens,
  - `branding: true`.
- The merchant's holidays, regions and custom design **stay in the database**, so upgrading restores them instantly on the next sync. Unit tests are added in `tests/validation.test.ts`.
- **Storefront:**
  - `renderWidget` (`extensions/delivery-estimate/assets/render.js`) appends a small `<span class="ede__branding">` when `config.branding` is set.
  - `widget.css` styles it at 11 px and subdued.
  - `estimateHeight` and the Liquid min-height add the note's line, so the page still doesn't jump.
- **Admin pages:**
  - **Holidays and Regions** (`app.holidays.tsx`, `app.regions.tsx`): Free shops see a Pro banner with "Upgrade". Actions reject creates and edits with "Upgrade to Pro". Deleting existing rows is still allowed.
  - **Design** (`app.design.tsx`): Free shops can pick a preset, but the token controls are disabled with an upgrade banner. The action ignores custom tokens and saves the preset only.
  - **Preview panel:** shows exactly what the storefront will show, because it uses `buildConfig` with the same `isPro`.
- **Home checklist** (`app._index.tsx`): adds a "Plan: Free / Pro (trial ends …)" line linking to `/app/plan`.

## 6. Owner panel (outside Shopify)
- **Routes** (not under `/app`, so no Shopify auth):
  - `app/routes/owner.login.tsx`: a password form.
  - `app/routes/owner._index.tsx`: the dashboard.
  - `app/routes/owner.logout.tsx`.
- **Auth** (`app/services/owner-auth.server.ts`):
  - React Router's `createCookieSessionStorage` (httpOnly, secure, sameSite=lax, 7-day expiry) signed with `OWNER_SESSION_SECRET`.
  - The password is compared to `OWNER_PASSWORD` with `crypto.timingSafeEqual`.
  - A simple in-memory rate limit: 5 failed attempts per IP per 15 minutes.
  - Every owner loader calls `requireOwner(request)`.
  - If the environment variables are missing, the panel is disabled and returns 404.
- **Dashboard (`app/services/owner-stats.server.ts`, pure functions plus a few Prisma queries)**:
  - **Installs:** total installs (install + reinstall events), uninstalls, currently installed (`uninstalledAt = null`), and installs/uninstalls this month and in the last 30 days.
  - **Subscriptions:** active Pro count, in-trial count (ACTIVE with `activatedAt + trialDays > now`), cancelled count, and conversion (Pro ÷ installed).
  - **Current MRR:** Σ price of ACTIVE, past-trial, non-test subscriptions.
  - **Estimated total billed to date:** per subscription, ⌈(min(endedAt, now) − (activatedAt + trial)) ÷ 30 days⌉ × price, floored at 0, test charges excluded.
    - It's labelled "estimate". It ignores refunds, prorations and Shopify's revenue share.
    - Exact payouts would need the Partner API, which is a possible later step.
  - **Table of shops:** shop, plan, status, installed date, uninstalled date and install count, with a search box.
  - **A small chart** of installs and uninstalls per week for 12 weeks, as inline SVG with no library.
  - **A "Show test charges" toggle**, so the numbers look real in dev.
- **UI:** plain HTML and CSS. Polaris web components only load inside the admin, so the panel uses its own small styles in `app/routes/owner.css`.

## 7. Config and docs
- **`shopify.app.toml`:** add the `app_subscriptions/update` webhook subscription.
- **`.env.example` and the README "Deploy to Railway" section:** add `OWNER_PASSWORD`, `OWNER_SESSION_SECRET` and `BILLING_TEST`.
- **README:** a short Billing and Owner panel section, the decisions above, and the note that estimated revenue ≠ payouts.
- **App Store listing:** the pricing must be entered to match ($4.99/month, 7-day trial).

## Files
- **New:**
  - `app/lib/plans.ts`
  - `app/services/analytics.server.ts`, `owner-auth.server.ts`, `owner-stats.server.ts`
  - `app/routes/app.plan.tsx`, `webhooks.app_subscriptions.update.tsx`, `owner.login.tsx`, `owner._index.tsx`, `owner.logout.tsx`, `owner.css`
  - `tests/owner-stats.test.ts`, `tests/gating.test.ts`
- **Modified:**
  - `prisma/schema.prisma`, plus the generated Postgres schema and both migration folders
  - `app/shopify.server.ts`, `app/routes/app.tsx`, `app/routes/webhooks.app.uninstalled.tsx`
  - `app/services/shop.server.ts`, `app/services/sync.server.ts`, `app/lib/config.ts`
  - `app/routes/app.design.tsx`, `app.holidays.tsx`, `app.regions.tsx`, `app._index.tsx`, `app/components/PreviewPanel.tsx`
  - `extensions/delivery-estimate/assets/render.js`, `widget.css`, `blocks/delivery-estimate.liquid`
  - `shopify.app.toml`, `.env.example`, `README.md`

## Verification
1. **Unit tests (`npm test`):**
   - gating: Free config has no holidays or regions, uses preset tokens and sets `branding`; Pro config passes everything through,
   - MRR and billed-to-date maths (trial not billed, partial periods, cancelled, test excluded),
   - `estimateHeight` with branding,
   - all existing tests still pass.
2. **Build checks:** `npm run typecheck`, `npm run lint`, `npm run build`, `shopify theme check --path extensions/delivery-estimate`.
3. **Dev store (test charges):**
   1. Open **Plan**, start the trial and approve on Shopify's page.
   2. You land back on Plan, which shows "Pro, trial ends …".
   3. Holidays and Regions unlock, and the storefront note disappears after the sync.
   4. Cancel: back to Free, and the storefront drops holidays, regions and custom design, but the database rows remain.
   5. Upgrade again: everything is restored.
4. **Webhooks:** `shopify app webhook trigger --topic app_subscriptions/update …` and `--topic app/uninstalled`. Then check the `AppSubscription`, `ShopInstall` and `AppEvent` rows.
5. **Owner panel:**
   - set `OWNER_PASSWORD` and `OWNER_SESSION_SECRET`, then open `<app-url>/owner`,
   - a wrong password is rejected and rate-limited,
   - the right password shows the counts matching the rows,
   - uninstall and reinstall the dev store: uninstalls +1, installs +1, install count 2.
