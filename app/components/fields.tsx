// Thin React wrappers around Polaris web components.
// React 18 passes props to custom elements as string attributes and doesn't
// wire their events, so these wrappers set properties and listen to native
// events directly.
import { useEffect, useRef, type ReactNode } from "react";
import { useLatest } from "./hooks";

/* eslint-disable @typescript-eslint/no-explicit-any */
type WC = HTMLElement & Record<string, any>;

function useWebComponent(
  onEvent: (el: WC) => void,
  props: Record<string, unknown>,
  events: string[] = ["input", "change"],
) {
  const ref = useRef<WC>(null);
  const handler = useLatest(onEvent);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listener = () => handler.current(el);
    events.forEach((e) => el.addEventListener(e, listener));
    return () => events.forEach((e) => el.removeEventListener(e, listener));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const [key, value] of Object.entries(props)) {
      if (el[key] !== value) el[key] = value;
    }
  });
  return ref;
}

/** Spread for boolean attributes: React 18 would render `attr="false"`. */
const flag = (name: string, on: boolean | undefined) => (on ? { [name]: true } : {});
const opt = (name: string, value: unknown) =>
  value === undefined || value === null || value === "" ? {} : { [name]: value };

interface Common {
  label: string;
  error?: string;
  details?: string;
}

export function TextField(props: Common & { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  const ref = useWebComponent((el) => props.onChange(String(el.value ?? "")), { value: props.value });
  return (
    <s-text-field
      ref={ref as any}
      label={props.label}
      value={props.value}
      {...opt("error", props.error)}
      {...opt("details", props.details)}
      {...opt("placeholder", props.placeholder)}
      {...opt("maxLength", props.maxLength)}
    />
  );
}

export function NumberField(
  props: Common & { value: string | number; onChange: (v: string) => void; min?: number; max?: number; suffix?: string },
) {
  const value = String(props.value);
  const ref = useWebComponent((el) => props.onChange(String(el.value ?? "")), { value });
  return (
    <s-number-field
      ref={ref as any}
      label={props.label}
      value={value}
      step={1}
      {...opt("min", props.min)}
      {...opt("max", props.max)}
      {...opt("suffix", props.suffix)}
      {...opt("error", props.error)}
      {...opt("details", props.details)}
    />
  );
}

export function Checkbox(props: Common & { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const ref = useWebComponent((el) => props.onChange(Boolean(el.checked)), { checked: props.checked }, ["change"]);
  return (
    <s-checkbox
      ref={ref as any}
      label={props.label}
      {...flag("checked", props.checked)}
      {...flag("disabled", props.disabled)}
      {...opt("error", props.error)}
      {...opt("details", props.details)}
    />
  );
}

export function Switch(props: Common & { checked: boolean; onChange: (v: boolean) => void; hideLabel?: boolean }) {
  const ref = useWebComponent((el) => props.onChange(Boolean(el.checked)), { checked: props.checked }, ["change"]);
  return (
    <s-switch
      ref={ref as any}
      label={props.label}
      {...flag("checked", props.checked)}
      {...(props.hideLabel ? { labelAccessibilityVisibility: "exclusive" } : {})}
      {...opt("details", props.details)}
    />
  );
}

export function Select(
  props: Common & { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] },
) {
  const ref = useWebComponent((el) => props.onChange(String(el.value)), { value: props.value }, ["change"]);
  return (
    <s-select ref={ref as any} label={props.label} value={props.value} {...opt("error", props.error)} {...opt("details", props.details)}>
      {props.options.map((o) => (
        <s-option key={o.value} value={o.value} {...flag("selected", o.value === props.value)}>
          {o.label}
        </s-option>
      ))}
    </s-select>
  );
}

/** Single-choice radio list. */
export function ChoiceList(
  props: Common & { value: string; onChange: (v: string) => void; options: { value: string; label: string; details?: string }[] },
) {
  const ref = useWebComponent(
    (el) => {
      const values: string[] =
        el.values ??
        Array.from(el.querySelectorAll("s-choice"))
          .filter((c: any) => c.selected)
          .map((c: any) => c.value);
      if (values[0] !== undefined) props.onChange(values[0]);
    },
    {},
    ["change"],
  );
  return (
    <s-choice-list ref={ref as any} label={props.label} {...opt("error", props.error)} {...opt("details", props.details)}>
      {props.options.map((o) => (
        <s-choice key={o.value} value={o.value} {...flag("selected", o.value === props.value)} {...opt("details", o.details)}>
          {o.label}
        </s-choice>
      ))}
    </s-choice-list>
  );
}

export function ColorField(props: Common & { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useWebComponent((el) => props.onChange(String(el.value ?? "")), { value: props.value });
  return (
    <s-color-field
      ref={ref as any}
      label={props.label}
      value={props.value}
      {...flag("disabled", props.disabled)}
      {...opt("error", props.error)}
      {...opt("details", props.details)}
    />
  );
}

export function DateField(props: Common & { value: string; onChange: (v: string) => void }) {
  const ref = useWebComponent((el) => props.onChange(String(el.value ?? "")), { value: props.value });
  return (
    <s-date-field
      ref={ref as any}
      label={props.label}
      value={props.value}
      {...opt("error", props.error)}
      {...opt("details", props.details)}
    />
  );
}

export function SearchField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useWebComponent((el) => props.onChange(String(el.value ?? "")), { value: props.value });
  return (
    <s-search-field
      ref={ref as any}
      label={props.label}
      labelAccessibilityVisibility="exclusive"
      value={props.value}
      {...opt("placeholder", props.placeholder)}
    />
  );
}

/** Polaris modal controlled by `open`. Calls onClose when the merchant dismisses it. */
export function Modal(props: {
  id: string;
  heading: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  size?: "small" | "base" | "large";
}) {
  const ref = useRef<WC>(null);
  const onClose = useLatest(props.onClose);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listener = () => onClose.current();
    el.addEventListener("hide", listener);
    return () => el.removeEventListener("hide", listener);
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (props.open) el.showOverlay?.();
    else el.hideOverlay?.();
  }, [props.open]);

  return (
    <s-modal ref={ref as any} id={props.id} heading={props.heading} {...opt("size", props.size)}>
      {props.children}
      {props.primary}
      {props.secondary}
    </s-modal>
  );
}
