import { createHash, timingSafeEqual } from "node:crypto";
import { createCookieSessionStorage, redirect } from "react-router";

// Private owner panel (/owner), outside Shopify. Enabled only when both
// OWNER_PASSWORD and OWNER_SESSION_SECRET are set; otherwise it 404s.

export function ownerEnabled() {
  return Boolean(process.env.OWNER_PASSWORD && process.env.OWNER_SESSION_SECRET);
}

type OwnerSession = { owner: boolean };
let storage: ReturnType<typeof createCookieSessionStorage<OwnerSession>> | null = null;
function sessionStorage() {
  storage ??= createCookieSessionStorage<OwnerSession>({
    cookie: {
      name: "__ede_owner",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // "/" not "/owner": client navigations load data from /owner.data, which a
      // Path=/owner cookie wouldn't be sent to.
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      secrets: [process.env.OWNER_SESSION_SECRET as string],
    },
  });
  return storage;
}

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function isOwner(request: Request) {
  if (!ownerEnabled()) return false;
  const session = await sessionStorage().getSession(request.headers.get("Cookie"));
  return session.get("owner") === true;
}

/** Call at the top of every owner loader/action. */
export async function requireOwner(request: Request) {
  if (!ownerEnabled()) throw notFound();
  if (!(await isOwner(request))) throw redirect("/owner/login");
}

// Simple in-memory rate limit: 5 failed attempts per IP per 15 minutes.
const FAIL_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

function passwordMatches(input: string) {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(input), digest(process.env.OWNER_PASSWORD as string));
}

/** Returns a redirect with the session cookie, or an error message. */
export async function login(request: Request, password: string): Promise<Response | string> {
  if (!ownerEnabled()) throw notFound();
  const ip = clientIp(request);
  const entry = failures.get(ip);
  if (entry && entry.resetAt > Date.now() && entry.count >= FAIL_LIMIT) {
    return "Too many attempts. Try again in 15 minutes.";
  }
  if (!passwordMatches(password)) {
    const fresh = !entry || entry.resetAt <= Date.now();
    failures.set(ip, { count: fresh ? 1 : entry.count + 1, resetAt: fresh ? Date.now() + WINDOW_MS : entry.resetAt });
    return "Wrong password.";
  }
  failures.delete(ip);
  const session = await sessionStorage().getSession();
  session.set("owner", true);
  return redirect("/owner", { headers: { "Set-Cookie": await sessionStorage().commitSession(session) } });
}

export async function logout(request: Request) {
  const session = await sessionStorage().getSession(request.headers.get("Cookie"));
  return redirect("/owner/login", { headers: { "Set-Cookie": await sessionStorage().destroySession(session) } });
}
