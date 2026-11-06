// ---------------------------------------------------------------------------
// ONE WAY TO BUZZ A PHONE, for every function that does it.
//
// coach-reach-out sends the coach's reminders; chat-gemini (6 Nov 2026, her
// "like a WhatsApp notification") sends the coach's REPLY when she has left
// the app. Both sign with the same project's VAPID keys and both must treat a
// phone that has gone the same way, so the sending lives here once.
//
// Secrets (set per project, see docs/handover/): VAPID_KEYS, VAPID_CONTACT.
// ---------------------------------------------------------------------------
import * as webpush from "jsr:@negrel/webpush@0.5.0";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome = "ok" | "gone" | "failed";

export async function loadVapid() {
  const raw = Deno.env.get("VAPID_KEYS");
  if (!raw) throw new Error("VAPID_KEYS is not set");
  return await webpush.importVapidKeys(JSON.parse(raw), { extractable: false });
}

export async function pushServer(): Promise<webpush.ApplicationServer> {
  return await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get("VAPID_CONTACT") ?? "mailto:admin@example.com",
    vapidKeys: await loadVapid(),
  });
}

export async function publicKey(): Promise<string> {
  return await webpush.exportApplicationServerKey(await loadVapid());
}

/**
 * SEND ONE MESSAGE TO ONE PHONE. "gone" means the phone unsubscribed and its
 * row should be dropped; anything else that fails is "failed" and tried again
 * by whoever called.
 *
 * HIGH URGENCY, because a message from the coach is a text, not a newsletter:
 * at normal urgency Android may hold it while the phone sleeps (found on her
 * phone, 5 Nov 2026). No `topic` on a reply, so two replies queued while the
 * phone was off both arrive rather than the second replacing the first.
 */
export async function sendPush(
  server: webpush.ApplicationServer,
  target: PushTarget,
  payload: unknown,
  opts: { topic?: string } = {},
): Promise<PushOutcome> {
  try {
    const subscriber = server.subscribe({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } });
    await subscriber.pushTextMessage(JSON.stringify(payload), { ttl: 6 * 3600, urgency: webpush.Urgency.High, ...(opts.topic ? { topic: opts.topic } : {}) });
    return "ok";
  } catch (err) {
    if (err instanceof webpush.PushMessageError && (err.isGone() || err.response.status === 404)) return "gone";
    console.error("[push] send failed:", String(err));
    return "failed";
  }
}
