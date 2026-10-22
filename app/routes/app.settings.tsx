import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, type SubmitTarget } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { loadShopData } from "../services/shop.server";
import { syncShopConfig } from "../services/sync.server";
import { getStoreInfo } from "../services/store-info.server";
import { validateSettings, type Errors } from "../lib/validation";
import { todayInTimezone } from "../../extensions/delivery-estimate/assets/estimate.js";
import { Checkbox, ChoiceList, NumberField, TextField } from "../components/fields";
import { PreviewPanel } from "../components/PreviewPanel";
import { SyncBanner } from "../components/SyncBanner";
import { useFetcherResult } from "../components/hooks";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await loadShopData(session.shop);
  return {
    settings: data.settings,
    design: data.design,
    holidays: data.holidays,
    regions: data.regions,
    timezone: data.timezone,
    today: todayInTimezone(new Date(), data.timezone),
    storeInfo: getStoreInfo(admin, session.shop), // not awaited: streams in
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const result = validateSettings(await request.json());
  if (!result.ok) return { ok: false as const, errors: result.errors };

  const { weekendDays, ...rest } = result.data;
  await db.shopSettings.update({
    where: { shop: session.shop },
    data: { ...rest, weekendDays: JSON.stringify(weekendDays), settingsSavedAt: new Date() },
  });
  const syncError = await syncShopConfig(admin, session.shop);
  return { ok: true as const, syncError };
};

type FormValues = {
  processingMin: string | number;
  processingMax: string | number;
  shippingMin: string | number;
  shippingMax: string | number;
  weekendDays: number[];
  unmatchedCountry: string;
  displayMode: string;
  messageRange: string;
  messageSingle: string;
  dateFormat: string;
};

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [values, setValues] = useState<FormValues>(data.settings);
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: keyof FormValues) => (value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  useFetcherResult(fetcher, (data) => {
    if (data.ok) {
      setErrors({});
      if (data.syncError) shopify.toast.show("Saved, but the store couldn't be updated", { isError: true });
      else shopify.toast.show("Saved");
    } else {
      setErrors(data.errors);
      shopify.toast.show("Fix the highlighted fields", { isError: true });
    }
  });

  const save = () => fetcher.submit(values as SubmitTarget, { method: "POST", encType: "application/json" });
  const toggleWeekend = (day: number, on: boolean) =>
    setValues((v) => ({
      ...v,
      weekendDays: on ? [...new Set([...v.weekendDays, day])].sort() : v.weekendDays.filter((d) => d !== day),
    }));

  return (
    <s-page heading="Settings">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={save}
        {...(fetcher.state !== "idle" ? { loading: true } : {})}
      >
        Save
      </s-button>

      <SyncBanner />

      <s-section heading="Processing and shipping">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Business days needed to prepare an order, and to deliver it. Shoppers in a{" "}
            <s-link href="/app/regions">region</s-link> get that region&apos;s shipping days instead.
          </s-paragraph>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <NumberField label="Processing days (min)" value={values.processingMin} onChange={set("processingMin")} min={0} max={60} error={errors.processingMin} />
            <NumberField label="Processing days (max)" value={values.processingMax} onChange={set("processingMax")} min={0} max={60} error={errors.processingMax} />
            <NumberField label="Shipping days (min)" value={values.shippingMin} onChange={set("shippingMin")} min={0} max={90} error={errors.shippingMin} />
            <NumberField label="Shipping days (max)" value={values.shippingMax} onChange={set("shippingMax")} min={0} max={90} error={errors.shippingMax} />
          </s-grid>
        </s-stack>
      </s-section>

      <s-section heading="Weekend days">
        <s-stack direction="block" gap="small-200">
          <s-paragraph>Days you don&apos;t process or ship orders. They are skipped when counting.</s-paragraph>
          {WEEKDAYS.map((name, day) => (
            <Checkbox key={day} label={name} checked={values.weekendDays.includes(day)} onChange={(on) => toggleWeekend(day, on)} />
          ))}
          {errors.weekendDays && <s-text tone="critical">{errors.weekendDays}</s-text>}
        </s-stack>
      </s-section>

      <s-section heading="Shoppers outside your regions">
        <ChoiceList
          label="When a shopper's country isn't in any region"
          value={values.unmatchedCountry}
          onChange={set("unmatchedCountry")}
          options={[
            { value: "useDefault", label: "Show the default shipping estimate" },
            { value: "hide", label: "Don't show an estimate" },
          ]}
          details="Shoppers whose country is unknown always see the default estimate."
        />
      </s-section>

      <s-section heading="Message">
        <s-stack direction="block" gap="base">
          <ChoiceList
            label="Display format"
            value={values.displayMode}
            onChange={set("displayMode")}
            options={[
              { value: "range", label: "Date range", details: "e.g. Arrives Thu, Oct 30 – Mon, Nov 3" },
              { value: "single", label: "Single “arrives by” date", details: "e.g. Arrives by Mon, Nov 3" },
            ]}
          />
          {values.displayMode === "range" ? (
            <TextField
              label="Range message"
              value={values.messageRange}
              onChange={set("messageRange")}
              maxLength={120}
              error={errors.messageRange}
              details="Use {start} and {end} where the dates go. Used when the two dates differ."
            />
          ) : null}
          <TextField
            label={values.displayMode === "range" ? "Single-date message" : "Message"}
            value={values.messageSingle}
            onChange={set("messageSingle")}
            maxLength={120}
            error={errors.messageSingle}
            details={
              values.displayMode === "range"
                ? "Use {end} where the date goes. Shown when the earliest and latest dates are the same."
                : "Use {end} where the date goes."
            }
          />
          <ChoiceList
            label="Date format"
            value={values.dateFormat}
            onChange={set("dateFormat")}
            options={[
              { value: "short", label: "Short (Thu, Oct 30)" },
              { value: "long", label: "Long (Thursday, October 30)" },
            ]}
          />
        </s-stack>
      </s-section>

      <div slot="aside">
        <PreviewPanel
          settings={values}
          design={data.design}
          holidays={data.holidays}
          regions={data.regions}
          timezone={data.timezone}
          today={data.today}
          storeInfo={data.storeInfo}
        />
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
