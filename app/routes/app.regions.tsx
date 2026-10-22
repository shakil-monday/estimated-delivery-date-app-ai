import { useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, type SubmitTarget } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { regionValues } from "../services/shop.server";
import { syncShopConfig } from "../services/sync.server";
import { validateRegion, type Errors } from "../lib/validation";
import { COUNTRIES, countryName } from "../lib/countries";
import { Checkbox, Modal, NumberField, SearchField, TextField } from "../components/fields";
import { SyncBanner } from "../components/SyncBanner";
import { useFetcherResult } from "../components/hooks";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [regions, settings] = await Promise.all([
    db.region.findMany({ where: { shop: session.shop }, orderBy: { name: "asc" } }),
    db.shopSettings.findUnique({ where: { shop: session.shop } }),
  ]);
  return {
    regions: regions.map(regionValues),
    defaultShipping: { min: settings?.shippingMin ?? 3, max: settings?.shippingMax ?? 5 },
    unmatchedCountry: settings?.unmatchedCountry ?? "useDefault",
  };
};

type ActionResult = { ok: true; syncError: string | null } | { ok: false; errors: Errors };

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const body = await request.json();
  const id = body.id ? Number(body.id) : undefined;

  if (body.intent === "save") {
    const others = (await db.region.findMany({ where: { shop } })).map(regionValues).filter((r) => r.id !== id);
    const result = validateRegion(body, others);
    if (!result.ok) return { ok: false, errors: result.errors };
    const data = { ...result.data, countries: JSON.stringify(result.data.countries) };
    if (id) await db.region.updateMany({ where: { id, shop }, data });
    else await db.region.create({ data: { ...data, shop } });
  } else if (body.intent === "delete" && id) {
    await db.region.deleteMany({ where: { id, shop } });
  } else {
    return { ok: false, errors: { form: "Unknown action." } };
  }

  const syncError = await syncShopConfig(admin, shop);
  return { ok: true, syncError };
};

type Region = ReturnType<typeof regionValues>;
const emptyForm = { id: 0, name: "", countries: [] as string[], shippingMin: "3" as string | number, shippingMax: "5" as string | number };

export default function RegionsPage() {
  const { regions, defaultShipping, unmatchedCountry } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const shopify = useAppBridge();
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<Region | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const submit = (payload: Record<string, unknown>) => {
    setPending(String(payload.intent));
    fetcher.submit(payload as SubmitTarget, { method: "POST", encType: "application/json" });
  };

  useFetcherResult(fetcher, (data) => {
    if (data.ok) {
      shopify.toast.show(data.syncError ? "Saved, but the store couldn't be updated" : pending === "delete" ? "Region deleted" : "Region saved", {
        isError: Boolean(data.syncError),
      });
      setFormOpen(false);
      setToDelete(null);
    } else {
      setErrors(data.errors);
    }
    setPending(null);
  });

  // Country → name of the region that already uses it (excluding the one being edited).
  const usedBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of regions) if (r.id !== form.id) for (const c of r.countries) map.set(c, r.name);
    return map;
  }, [regions, form.id]);

  const visibleCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [search]);

  const openForm = (r?: Region) => {
    setForm(r ? { ...r } : { ...emptyForm, shippingMin: defaultShipping.min, shippingMax: defaultShipping.max });
    setErrors({});
    setSearch("");
    setFormOpen(true);
  };

  const toggleCountry = (code: string, on: boolean) =>
    setForm((f) => ({ ...f, countries: on ? [...new Set([...f.countries, code])] : f.countries.filter((c) => c !== code) }));

  return (
    <s-page heading="Regions">
      <s-button slot="primary-action" variant="primary" onClick={() => openForm()}>
        Add region
      </s-button>

      <SyncBanner />

      <s-banner tone="info">
        Shoppers from countries that aren&apos;t in any region{" "}
        {unmatchedCountry === "hide"
          ? "don't see a delivery estimate"
          : `get the default shipping range (${defaultShipping.min}–${defaultShipping.max} days)`}
        . You can change this in <s-link href="/app/settings">Settings</s-link>.
      </s-banner>

      {regions.length === 0 ? (
        <s-section>
          <s-stack direction="block" gap="base" alignItems="center" padding="large">
            <s-heading>Set shipping times by country</s-heading>
            <s-paragraph>Group countries into regions with their own shipping days, e.g. “Europe: 5–8 days”.</s-paragraph>
            <s-button variant="primary" onClick={() => openForm()}>
              Add region
            </s-button>
          </s-stack>
        </s-section>
      ) : (
        regions.map((r) => (
          <s-section key={r.id} heading={r.name}>
            <s-stack direction="block" gap="base">
              <s-text>
                Shipping: {r.shippingMin}–{r.shippingMax} business days
              </s-text>
              <s-stack direction="inline" gap="small-200">
                {r.countries.map((c) => (
                  <s-chip key={c}>{countryName(c)}</s-chip>
                ))}
              </s-stack>
              <s-stack direction="inline" gap="small-200">
                <s-button onClick={() => openForm(r)}>Edit</s-button>
                <s-button tone="critical" variant="tertiary" onClick={() => setToDelete(r)}>
                  Delete
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        ))
      )}

      <Modal
        id="region-form"
        heading={form.id ? "Edit region" : "Add region"}
        size="large"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        primary={
          <s-button
            slot="primary-action"
            variant="primary"
            onClick={() => submit({ intent: "save", ...form })}
            {...(fetcher.state !== "idle" ? { loading: true } : {})}
          >
            Save
          </s-button>
        }
        secondary={
          <s-button slot="secondary-actions" onClick={() => setFormOpen(false)}>
            Cancel
          </s-button>
        }
      >
        <s-stack direction="block" gap="base">
          <TextField label="Name" value={form.name} maxLength={100} onChange={(name) => setForm((f) => ({ ...f, name }))} error={errors.name} />
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <NumberField label="Shipping days (min)" value={form.shippingMin} min={0} max={90} onChange={(v) => setForm((f) => ({ ...f, shippingMin: v }))} error={errors.shippingMin} />
            <NumberField label="Shipping days (max)" value={form.shippingMax} min={0} max={90} onChange={(v) => setForm((f) => ({ ...f, shippingMax: v }))} error={errors.shippingMax} />
          </s-grid>
          <s-heading>Countries ({form.countries.length} selected)</s-heading>
          {errors.countries && <s-text tone="critical">{errors.countries}</s-text>}
          {form.countries.length > 0 && (
            <s-stack direction="inline" gap="small-200">
              {form.countries.map((c) => (
                <s-clickable-chip
                  key={c}
                  accessibilityLabel={`Remove ${countryName(c)}`}
                  onClick={() => toggleCountry(c, false)}
                >
                  {countryName(c)} ✕
                </s-clickable-chip>
              ))}
            </s-stack>
          )}
          <SearchField label="Search countries" placeholder="Search countries" value={search} onChange={setSearch} />
          <s-box maxBlockSize="320px" overflow="hidden" border="base" borderRadius="base" padding="small">
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <s-stack direction="block" gap="small-100">
                {visibleCountries.map((c) => {
                  const owner = usedBy.get(c.code);
                  return (
                    <Checkbox
                      key={c.code}
                      label={owner ? `${c.name} (in ${owner})` : c.name}
                      checked={form.countries.includes(c.code)}
                      disabled={Boolean(owner)}
                      onChange={(on) => toggleCountry(c.code, on)}
                    />
                  );
                })}
              </s-stack>
            </div>
          </s-box>
        </s-stack>
      </Modal>

      <Modal
        id="region-delete"
        heading={`Delete ${toDelete?.name ?? "region"}?`}
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        primary={
          <s-button
            slot="primary-action"
            variant="primary"
            tone="critical"
            onClick={() => toDelete && submit({ intent: "delete", id: toDelete.id })}
            {...(fetcher.state !== "idle" ? { loading: true } : {})}
          >
            Delete
          </s-button>
        }
        secondary={
          <s-button slot="secondary-actions" onClick={() => setToDelete(null)}>
            Cancel
          </s-button>
        }
      >
        <s-paragraph>Shoppers in these countries will follow the unmatched-country setting. This can&apos;t be undone.</s-paragraph>
      </Modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
