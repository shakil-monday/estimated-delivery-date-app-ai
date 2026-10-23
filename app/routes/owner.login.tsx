import { useSyncExternalStore } from "react";
import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { isOwner, login, ownerEnabled } from "../services/owner-auth.server";
import ownerCss from "../styles/owner.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: ownerCss }];
export const meta: MetaFunction = () => [{ title: "Owner login" }, { name: "robots", content: "noindex" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!ownerEnabled()) throw new Response("Not found", { status: 404 });
  if (await isOwner(request)) throw redirect("/owner");
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const result = await login(request, String(form.get("password") ?? ""));
  if (typeof result === "string") return { error: result };
  return result; // redirect with session cookie
};

export default function OwnerLogin() {
  const data = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  // Inside the Shopify admin iframe the login cookie is third-party and gets
  // dropped, so the panel must be opened directly.
  const directUrl = useSyncExternalStore(
    () => () => {},
    () => (window.top !== window.self ? new URL("/owner/login", window.location.origin).href : null),
    () => null, // server render: not framed
  );
  if (directUrl) {
    return (
      <div className="owner">
        <div className="owner__login owner__card">
          <h1>Owner panel</h1>
          <p>The owner panel can&apos;t be used inside the Shopify admin. Open it directly in its own tab.</p>
          <a className="owner__button" href={directUrl} target="_blank" rel="noreferrer">
            Open the owner panel in a new tab
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="owner">
      <div className="owner__login owner__card">
        <h1>Owner panel</h1>
        <Form method="post">
          <label>
            <div className="owner__label">Password</div>
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          {data && "error" in data && <div className="owner__error">{data.error}</div>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </Form>
      </div>
    </div>
  );
}
