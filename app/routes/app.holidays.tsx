import { useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, type SubmitTarget } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { holidayValues } from "../services/shop.server";
import { syncShopConfig } from "../services/sync.server";
import {
  DUPLICATE_HOLIDAY_ERROR,
  isDuplicateHoliday,
  MAX_HOLIDAYS,
  validateHoliday,
  type Errors,
} from "../lib/validation";
import { nextOccurrence } from "../lib/holidays";
import { todayInTimezone } from "../../extensions/delivery-estimate/assets/estimate.js";
import { Checkbox, DateField, Modal, SearchField, Select, Switch, TextField } from "../components/fields";
import { SyncBanner } from "../components/SyncBanner";
import { useFetcherResult } from "../components/hooks";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [settings, holidays] = await Promise.all([
    db.shopSettings.findUnique({ where: { shop: session.shop }, select: { timezone: true } }),
    db.holiday.findMany({ where: { shop: session.shop }, orderBy: [{ date: "asc" }, { name: "asc" }] }),
  ]);
  return {
    holidays: holidays.map(holidayValues),
    today: todayInTimezone(new Date(), settings?.timezone ?? "UTC"),
  };
};

type ActionResult = { ok: true; syncError: string | null } | { ok: false; errors: Errors };

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const body = await request.json();
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];

  switch (body.intent) {
    case "save": {
      const id = body.id ? Number(body.id) : undefined;
      const result = validateHoliday(body);
      if (!result.ok) return { ok: false, errors: result.errors };
      const sameDate = await db.holiday.findMany({ where: { shop, date: result.data.date }, select: { id: true, date: true, name: true } });
      if (isDuplicateHoliday({ ...result.data, id }, sameDate)) {
        return { ok: false, errors: { name: DUPLICATE_HOLIDAY_ERROR } };
      }
      try {
        if (id) {
          await db.holiday.updateMany({ where: { id, shop }, data: result.data });
        } else {
          const count = await db.holiday.count({ where: { shop } });
          if (count >= MAX_HOLIDAYS) {
            return { ok: false, errors: { form: `You can add up to ${MAX_HOLIDAYS} holidays. Delete past holidays to add more.` } };
          }
          await db.holiday.create({ data: { ...result.data, shop } });
        }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return { ok: false, errors: { name: DUPLICATE_HOLIDAY_ERROR } };
        }
        throw error;
      }
      break;
    }
    case "setActive":
      await db.holiday.updateMany({ where: { shop, id: { in: ids } }, data: { active: body.active === true } });
      break;
    case "delete":
      await db.holiday.deleteMany({ where: { shop, id: { in: ids } } });
      break;
    default:
      return { ok: false, errors: { form: "Unknown action." } };
  }

  const syncError = await syncShopConfig(admin, shop);
  return { ok: true, syncError };
};

type Holiday = ReturnType<typeof holidayValues>;
type Tab = "upcoming" | "past" | "all";

const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const fullDate = (date: string) => fmt(date, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function dateLabel(h: Holiday, today: string) {
  if (!h.repeatsYearly) return fullDate(h.date);
  const next = nextOccurrence(h, today);
  return `Every ${fmt(h.date, { month: "short", day: "numeric" })} · next: ${next ? fullDate(next) : "—"} (since ${h.date.slice(0, 4)})`;
}

const YEARLY_HELP =
  "Repeats every year on this month and day, starting from this year. Use this only for fixed-date holidays. Holidays that move each year (e.g. Eid, Easter) should be added separately for each year.";

const emptyForm = (today: string) => ({ id: 0, date: today, name: "", repeatsYearly: false, active: true });

export default function HolidaysPage() {
  const { holidays, today } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const shopify = useAppBridge();

  const [tab, setTab] = useState<Tab>("upcoming");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [form, setForm] = useState(emptyForm(today));
  const [formOpen, setFormOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<Errors>({});
  const [toDelete, setToDelete] = useState<number[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const busy = fetcher.state !== "idle";
  const submit = (payload: Record<string, unknown>) => {
    setPending(String(payload.intent));
    fetcher.submit(payload as SubmitTarget, { method: "POST", encType: "application/json" });
  };

  useFetcherResult(fetcher, (data) => {
    if (!pending) return;
    if (data.ok) {
      const messages: Record<string, string> = { save: "Holiday saved", setActive: "Holidays updated", delete: "Deleted" };
      shopify.toast.show(data.syncError ? "Saved, but the store couldn't be updated" : messages[pending] ?? "Saved", {
        isError: Boolean(data.syncError),
      });
      if (pending === "save") setFormOpen(false);
      if (pending === "delete") {
        setToDelete(null);
        setSelected(new Set());
      }
    } else if (pending === "save") {
      setFormErrors(data.errors);
    } else {
      shopify.toast.show(Object.values(data.errors)[0] ?? "Something went wrong", { isError: true });
    }
    setPending(null);
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = holidays.filter((h) => {
      if (status === "active" && !h.active) return false;
      if (status === "inactive" && h.active) return false;
      if (q && !h.name.toLowerCase().includes(q)) return false;
      if (tab === "upcoming") return h.repeatsYearly || h.date >= today;
      if (tab === "past") return !h.repeatsYearly && h.date < today;
      return true;
    });
    const sortKey = (h: Holiday) => (h.repeatsYearly ? nextOccurrence(h, today) ?? h.date : h.date);
    return filtered.sort((a, b) => {
      const cmp = sortKey(a).localeCompare(sortKey(b)) || a.name.localeCompare(b.name);
      return tab === "past" ? -cmp : cmp;
    });
  }, [holidays, status, query, tab, today]);

  const openForm = (h?: Holiday) => {
    setForm(h ? { ...h } : emptyForm(today));
    setFormErrors({});
    setFormOpen(true);
  };

  const toggleSelected = (id: number, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const visibleIds = rows.map((h) => h.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedIds = [...selected].filter((id) => holidays.some((h) => h.id === id));

  return (
    <s-page heading="Holidays">
      <s-button slot="primary-action" variant="primary" onClick={() => openForm()}>
        Add holiday
      </s-button>

      <SyncBanner />

      <s-section padding="none">
        <s-stack direction="block" gap="base" padding="base">
          <s-paragraph>
            Active holidays are skipped when counting business days. Inactive holidays stay in the list but don&apos;t
            affect dates.
          </s-paragraph>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            {(["upcoming", "past", "all"] as Tab[]).map((t) => (
              <s-button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>
                {t === "upcoming" ? "Upcoming" : t === "past" ? "Past" : "All"}
              </s-button>
            ))}
          </s-stack>
          <s-grid gridTemplateColumns="2fr 1fr" gap="base">
            <SearchField label="Search holidays" placeholder="Search by name" value={query} onChange={setQuery} />
            <Select
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </s-grid>
          {selectedIds.length > 0 && (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text>{selectedIds.length} selected</s-text>
              <s-button onClick={() => submit({ intent: "setActive", ids: selectedIds, active: true })} {...(busy ? { disabled: true } : {})}>
                Activate
              </s-button>
              <s-button onClick={() => submit({ intent: "setActive", ids: selectedIds, active: false })} {...(busy ? { disabled: true } : {})}>
                Deactivate
              </s-button>
              <s-button tone="critical" onClick={() => setToDelete(selectedIds)}>
                Delete
              </s-button>
            </s-stack>
          )}
        </s-stack>

        {holidays.length === 0 ? (
          <s-stack direction="block" gap="base" alignItems="center" padding="large">
            <s-heading>Add your first holiday</s-heading>
            <s-paragraph>Days your business is closed are skipped in delivery estimates.</s-paragraph>
            <s-button variant="primary" onClick={() => openForm()}>
              Add holiday
            </s-button>
          </s-stack>
        ) : rows.length === 0 ? (
          <s-stack direction="block" gap="base" alignItems="center" padding="large">
            <s-paragraph>No holidays match these filters.</s-paragraph>
            <s-button onClick={() => openForm()}>Add holiday</s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>
                <Checkbox
                  label="Select all"
                  checked={allSelected}
                  onChange={(on) => setSelected(on ? new Set([...selected, ...visibleIds]) : new Set())}
                />
              </s-table-header>
              <s-table-header listSlot="primary">Name</s-table-header>
              <s-table-header>Date</s-table-header>
              <s-table-header>Repeats yearly</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header>Active</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((h) => (
                <s-table-row key={h.id}>
                  <s-table-cell>
                    <Checkbox label={`Select ${h.name}`} checked={selected.has(h.id)} onChange={(on) => toggleSelected(h.id, on)} />
                  </s-table-cell>
                  <s-table-cell>{h.name}</s-table-cell>
                  <s-table-cell>{dateLabel(h, today)}</s-table-cell>
                  <s-table-cell>{h.repeatsYearly ? "Yes" : "No"}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={h.active ? "success" : "neutral"}>{h.active ? "Active" : "Inactive"}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <Switch
                      label={`${h.name} active`}
                      hideLabel
                      checked={h.active}
                      onChange={(on) => submit({ intent: "setActive", ids: [h.id], active: on })}
                    />
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button variant="tertiary" onClick={() => openForm(h)}>
                        Edit
                      </s-button>
                      <s-button variant="tertiary" tone="critical" onClick={() => setToDelete([h.id])}>
                        Delete
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <Modal
        id="holiday-form"
        heading={form.id ? "Edit holiday" : "Add holiday"}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        primary={
          <s-button
            slot="primary-action"
            variant="primary"
            onClick={() => submit({ intent: "save", ...form })}
            {...(busy && pending === "save" ? { loading: true } : {})}
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
          {formErrors.form && <s-banner tone="critical">{formErrors.form}</s-banner>}
          <DateField label="Date" value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} error={formErrors.date} />
          <TextField
            label="Name"
            value={form.name}
            maxLength={100}
            onChange={(name) => setForm((f) => ({ ...f, name }))}
            error={formErrors.name}
          />
          <Checkbox
            label="Repeats yearly"
            checked={form.repeatsYearly}
            onChange={(repeatsYearly) => setForm((f) => ({ ...f, repeatsYearly }))}
            details={form.repeatsYearly ? YEARLY_HELP : undefined}
          />
          <Switch
            label="Active"
            checked={form.active}
            onChange={(active) => setForm((f) => ({ ...f, active }))}
            details="Only active holidays are skipped."
          />
        </s-stack>
      </Modal>

      <Modal
        id="holiday-delete"
        heading={toDelete && toDelete.length > 1 ? `Delete ${toDelete.length} holidays?` : "Delete holiday?"}
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        primary={
          <s-button
            slot="primary-action"
            variant="primary"
            tone="critical"
            onClick={() => toDelete && submit({ intent: "delete", ids: toDelete })}
            {...(busy && pending === "delete" ? { loading: true } : {})}
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
        <s-paragraph>This can&apos;t be undone.</s-paragraph>
      </Modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
