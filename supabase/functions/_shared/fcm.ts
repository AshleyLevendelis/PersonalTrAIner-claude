// ---------------------------------------------------------------------------
// SENDING TO THE PHONE APP (23 Nov 2026, his "yes build it for Android").
//
// A phone-app device is a push_subscriptions row whose endpoint is `fcm:<token>` (src/lib/native-push.ts). It is
// sent through Firebase Cloud Messaging's HTTP v1 API, signed with a Google service account.
//
// Secret (set per project, docs/handover/android-notifications.md): FCM_SERVICE_ACCOUNT, the service account's JSON
// key file as one string. Until it is set an `fcm:` row is "failed" (logged, kept, tried again next time), never
// "gone": a missing secret is ours to fix, not a sign the phone said no.
//
// No Deno or jsr import here, so the Node checks (scripts/test-native-push.ts) run this very file.
// ---------------------------------------------------------------------------

export const FCM_PREFIX = "fcm:";
/** The Android channel the app creates (src/lib/native-push.ts COACH_CHANNEL_ID). */
export const COACH_CHANNEL_ID = "coach";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface FcmDeps {
  fetch: typeof fetch;
  now: () => number;
}

export type FcmOutcome = "ok" | "gone" | "failed";

export function parseServiceAccount(raw: string | undefined | null): ServiceAccount | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof j.client_email === "string" && typeof j.private_key === "string" && typeof j.project_id === "string") {
      return { client_email: j.client_email, private_key: j.private_key, project_id: j.project_id };
    }
  } catch { /* fall through */ }
  return null;
}

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let s = "";
  for (const b of raw) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The signed request for an access token (RFC 7523), valid for an hour. */
export async function signedAssertion(sa: ServiceAccount, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

/** What a coach message becomes on Android. Every data value is a string (FCM's rule). */
export function fcmMessage(token: string, payload: Record<string, unknown>, opts: { topic?: string } = {}) {
  const reply = payload.moment === "coach_reply";
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  return {
    message: {
      token,
      notification: { title: str(payload.title) || "Trainer", body: str(payload.body) },
      data: { url: str(payload.url), moment: str(payload.moment), messageId: str(payload.messageId) },
      android: {
        // HIGH, as for the browser (push.ts): at normal priority Android may hold a message while the phone sleeps.
        priority: "HIGH",
        ttl: "21600s",
        ...(opts.topic ? { collapse_key: opts.topic } : {}),
        // The same tags as the service worker: a reply replaces an unread reply, a reminder replaces a reminder.
        notification: { channel_id: COACH_CHANNEL_ID, tag: reply ? "coach-chat" : "coach" },
      },
    },
  };
}

export function makeFcmSender(sa: ServiceAccount, deps: FcmDeps) {
  let cached: { token: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && deps.now() < cached.until) return cached.token;
    const assertion = await signedAssertion(sa, deps.now());
    const res = await deps.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
    });
    if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
    const j = await res.json() as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error("token reply had no access_token");
    cached = { token: j.access_token, until: deps.now() + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000 };
    return j.access_token;
  }

  return async function send(endpoint: string, payload: Record<string, unknown>, opts: { topic?: string } = {}): Promise<FcmOutcome> {
    if (!endpoint.startsWith(FCM_PREFIX)) return "failed";
    const token = endpoint.slice(FCM_PREFIX.length);
    if (!token) return "gone";
    try {
      const bearer = await accessToken();
      const res = await deps.fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify(fcmMessage(token, payload, opts)),
      });
      if (res.ok) return "ok";
      const text = await res.text();
      // GONE only when Firebase says this token is no longer a phone: uninstalled, or the app unregistered.
      if (res.status === 404 || /UNREGISTERED/.test(text)) return "gone";
      if (res.status === 401) cached = null;
      console.error("[fcm] send failed:", res.status, text.slice(0, 300));
      return "failed";
    } catch (err) {
      console.error("[fcm] send failed:", String(err));
      return "failed";
    }
  };
}
