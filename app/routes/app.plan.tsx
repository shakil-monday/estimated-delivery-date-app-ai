import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { refreshBilling, isTestBilling } from "../services/billing.server";
import { applySubscriptionStatus } from "../services/analytics.server";
import { syncShopConfig } from "../services/sync.server";
import { PRO_FEATURES, PRO_PLAN, PRO_PRICE, PRO_TRIAL_DAYS } from "../lib/plans";
import { Modal } from "../components/fields";
import { useFetcherResult } from "../components/hooks";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The shop's current (not ended) subscription, newest first. */
async function currentSubscription(shop: string) {
  return db.appSubscription.findFirst({
    where: { shop, status: { in: ["ACTIVE", "FROZEN", "PENDING", "ACCEPTED"] } },
    orderBy: { createdAt: "desc" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const returning = new URL(request.url).searchParams.get("charge") === "done";
  // Right after approving a charge, don't wait for the webhook.
  const plan = await refreshBilling(admin, session.shop, { force: returning });
  const sub = await currentSubscription(session.shop);
  const trialEndsAt =
    sub?.status === "ACTIVE" && sub.activatedAt && sub.trialDays > 0
      ? new Date(sub.activatedAt.getTime() + sub.trialDays * DAY_MS)
      : null;
  return {
    plan,
    status: sub?.status ?? null,
    test: sub?.test ?? false,
    trialEndsAt: trialEndsAt && trialEndsAt.getTime() > Date.now() ? trialEndsAt.toISOString() : null,
    justReturned: returning,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const { intent } = await request.json();

  if (intent === "upgrade") {
    let install = await db.shopInstall.findUnique({ where: { shop } });
    if (!install?.appHandle) {
      await refreshBilling(admin, shop, { force: true });
      install = await db.shopInstall.findUnique({ where: { shop } });
    }
    const storeHandle = shop.replace(".myshopify.com", "");
    const returnUrl = install?.appHandle
      ? `https://admin.shopify.com/store/${storeHandle}/apps/${install.appHandle}/app/plan?charge=done`
      : `${process.env.SHOPIFY_APP_URL}/app/plan?charge=done&shop=${shop}`;
    // One free trial per shop: returning subscribers start paying immediately.
    const hadPro = await db.appSubscription.count({ where: { shop, activatedAt: { not: null } } });
    try {
      // Throws a redirect to Shopify's approval page (handled by App Bridge).
      await billing.request({
        plan: PRO_PLAN,
        isTest: isTestBilling(),
        returnUrl,
        ...(hadPro ? { trialDays: 0 } : {}),
      });
    } catch (error) {
      if (error instanceof Response) throw error; // the redirect
      // BillingError: Shopify's reason is in errorData (appSubscriptionCreate userErrors).
      const details = (error as { errorData?: { message?: string }[] }).errorData;
      const reason = details?.map((e) => e.message).filter(Boolean).join("; ");
      console.error(`Billing request failed for ${shop}:`, reason || error);
      return { ok: false as const, error: reason || "Shopify couldn't start the subscription. Try again." };
    }
    return { ok: true as const };
  }

  if (intent === "cancel") {
    const sub = await db.appSubscription.findFirst({
      where: { shop, status: { in: ["ACTIVE", "FROZEN"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!sub) return { ok: false as const, error: "No active subscription to cancel." };
    await billing.cancel({ subscriptionId: sub.subscriptionId, isTest: isTestBilling(), prorate: true });
    await applySubscriptionStatus({ shop, subscriptionId: sub.subscriptionId, name: sub.name, status: "CANCELLED" });
    await syncShopConfig(admin, shop);
    return { ok: true as const };
  }

  return { ok: false as const, error: "Unknown action." };
};

const FREE_FEATURES = [
  "Delivery estimate on any page",
  "Processing & shipping days, weekends",
  "4 widget presets",
  "Live preview & simulator",
];

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

export default function PlanPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const busy = fetcher.state !== "idle";
  const pro = data.plan === "pro";

  useFetcherResult(fetcher, (result) => {
    if (result && !result.ok) shopify.toast.show(result.error, { isError: true });
    else if (result?.ok) {
      setConfirmCancel(false);
      shopify.toast.show("Plan updated");
    }
  });

  const submit = (intent: string) => fetcher.submit({ intent }, { method: "POST", encType: "application/json" });

  return (
    <s-page heading="Plan">
      {data.status === "FROZEN" && (
        <s-banner tone="warning" heading="Your Pro plan is paused">
          <s-paragraph>
            Your Shopify bill is unpaid, so Shopify paused the subscription. Pro features return automatically once
            the bill is paid. Your holidays, regions and custom design are kept.
          </s-paragraph>
        </s-banner>
      )}
      {data.justReturned && !pro && data.status !== "FROZEN" && (
        <s-banner tone="info">
          We haven&apos;t received the approval yet. If you approved the charge, refresh in a moment.
        </s-banner>
      )}
      {data.test && pro && <s-banner tone="info">This is a test subscription (development store). No real charge.</s-banner>}

      <s-section>
        <s-paragraph>
          Current plan: <s-text type="strong">{pro ? "Pro" : "Free"}</s-text>
          {data.trialEndsAt && <> · free trial ends {fmtDate(data.trialEndsAt)}</>}
        </s-paragraph>
      </s-section>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap="base">
        <s-section heading="Free">
          <s-stack direction="block" gap="base">
            <s-heading>$0</s-heading>
            <s-unordered-list>
              {FREE_FEATURES.map((f) => (
                <s-list-item key={f}>{f}</s-list-item>
              ))}
              <s-list-item>Small “Powered by” note under the widget</s-list-item>
            </s-unordered-list>
            {!pro && <s-badge tone="info">Current plan</s-badge>}
          </s-stack>
        </s-section>

        <s-section heading="Pro">
          <s-stack direction="block" gap="base">
            <s-heading>
              ${PRO_PRICE} / month
            </s-heading>
            <s-unordered-list>
              <s-list-item>Everything in Free</s-list-item>
              {PRO_FEATURES.map((f) => (
                <s-list-item key={f}>{f}</s-list-item>
              ))}
            </s-unordered-list>
            {pro ? (
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-badge tone="success">Current plan</s-badge>
                <s-button variant="tertiary" tone="critical" onClick={() => setConfirmCancel(true)}>
                  Cancel plan
                </s-button>
              </s-stack>
            ) : data.status === "FROZEN" ? null : (
              <s-button variant="primary" onClick={() => submit("upgrade")} {...(busy ? { loading: true } : {})}>
                Start {PRO_TRIAL_DAYS}-day free trial
              </s-button>
            )}
            <s-text color="subdued">Billed through Shopify every 30 days. Cancel anytime.</s-text>
          </s-stack>
        </s-section>
      </s-grid>

      <Modal
        id="plan-cancel"
        heading="Cancel Pro?"
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        primary={
          <s-button
            slot="primary-action"
            variant="primary"
            tone="critical"
            onClick={() => submit("cancel")}
            {...(busy ? { loading: true } : {})}
          >
            Cancel plan
          </s-button>
        }
        secondary={
          <s-button slot="secondary-actions" onClick={() => setConfirmCancel(false)}>
            Keep Pro
          </s-button>
        }
      >
        <s-paragraph>
          Your store switches to Free right away: holidays and regions stop applying and the widget uses its preset
          style. Nothing is deleted, so it all comes back if you upgrade again.
        </s-paragraph>
      </Modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
