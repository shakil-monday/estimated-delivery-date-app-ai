import { Suspense } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Await, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { SyncBanner } from "../components/SyncBanner";
import { getStoreInfo, type StoreInfo } from "../services/store-info.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });
  return {
    settingsSaved: Boolean(settings?.settingsSavedAt),
    designSaved: Boolean(settings?.designSavedAt),
    lastSyncedAt: settings?.lastSyncedAt?.toISOString() ?? null,
    syncError: settings?.syncError ?? null,
    storeInfo: getStoreInfo(admin, session.shop), // not awaited: streams in
  };
};

function Step(props: { done: boolean | null; title: string; children: React.ReactNode }) {
  return (
    <s-stack direction="inline" gap="base" alignItems="start">
      <s-badge tone={props.done ? "success" : props.done === null ? "neutral" : "warning"}>
        {props.done ? "Done" : props.done === null ? "Check" : "To do"}
      </s-badge>
      <s-stack direction="block" gap="small-100">
        <s-text type="strong">{props.title}</s-text>
        {props.children}
      </s-stack>
    </s-stack>
  );
}

function ThemeStep({ info }: { info: StoreInfo | null }) {
  return (
    <Step done={info ? info.blockInstalled : false} title="3. Add the block to your theme">
      <s-paragraph>
        {!info
          ? "Checking your theme…"
          : info.blockInstalled
            ? "The Delivery estimate block is in your live theme."
            : info.blockInstalled === null
              ? "We couldn't check your theme. Make sure the Delivery estimate block is added."
              : "Add the Delivery estimate block to your product page (or any page) in the theme editor."}
      </s-paragraph>
      {info && (
        <s-stack direction="inline" gap="small-200">
          <s-button variant={info.blockInstalled ? "secondary" : "primary"} href={info.addBlockUrl} target="_blank">
            Add to theme
          </s-button>
          {info.previewUrl && (
            <s-button variant="secondary" href={info.previewUrl} target="_blank">
              Preview on your store
            </s-button>
          )}
        </s-stack>
      )}
    </Step>
  );
}

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const lastSync = data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString() : null;

  console.log("data useLoaderData: ", data);

  return (
    <s-page heading="Estimated Delivery Date">
      <SyncBanner />

      <s-section heading="Get set up">
        <s-stack direction="block" gap="large">
          <Step done={data.settingsSaved} title="1. Review your settings">
            <s-paragraph>Set processing and shipping days, weekend days and the message shoppers see.</s-paragraph>
            <s-link href="/app/settings">Open Settings</s-link>
          </Step>
          <Step done={data.designSaved} title="2. Design the widget">
            <s-paragraph>Pick a style and colors that match your store.</s-paragraph>
            <s-link href="/app/design">Open Design</s-link>
          </Step>
          <Suspense fallback={<ThemeStep info={null} />}>
            <Await resolve={data.storeInfo} errorElement={<ThemeStep info={null} />}>
              {(info) => <ThemeStep info={info} />}
            </Await>
          </Suspense>
          <Step done={Boolean(lastSync) && !data.syncError} title="4. Storefront in sync">
            <s-paragraph>
              {data.syncError
                ? `Last sync failed: ${data.syncError}`
                : lastSync
                  ? `Last synced ${lastSync}.`
                  : "Not synced yet."}
            </s-paragraph>
          </Step>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Shoppers see a message like <s-text type="strong">“Arrives Thu, Oct 30 – Mon, Nov 3”</s-text>.
          </s-paragraph>
          <s-paragraph>
            We count your processing days plus shipping days from today, skipping weekends and active{" "}
            <s-link href="/app/holidays">holidays</s-link>. Shoppers in a <s-link href="/app/regions">region</s-link>{" "}
            get that region&apos;s shipping days.
          </s-paragraph>
          <s-paragraph>
            Dates are calculated in the shopper&apos;s browser using your shop&apos;s timezone, so they&apos;re always
            current. Try different countries and dates in the <s-link href="/app/settings">preview</s-link>.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
