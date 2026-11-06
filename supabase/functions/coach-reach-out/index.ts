import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type * as webpush from "jsr:@negrel/webpush@0.5.0";
import {
  runReachOut, addDays, COACH_SENDER,
  type ReachOutDeps, type PushSubscriptionRow, type MomentFactsRow, type LiveFacts, type SentRecord, type DayMarks,
} from "../_shared/reach-out.ts";
import type { NotificationSettings } from "../_shared/coach-moments.ts";
import { pushServer, publicKey, sendPush } from "../_shared/push.ts";

// ---------------------------------------------------------------------------
// coach-reach-out — the coach, when the app is shut.
//
// Slice 3 of docs/plans/the-coach-can-reach-you.md. Ashley, 17 Sep 2026: all
// seven proactive moments, each switchable, all on to begin with. Built
// 24 Sep 2026 on her "implement all the chat fixes".
//
// Two doors, nothing else:
//   GET  ?vapid  — the public half of the push key, which a phone needs to
//                  subscribe. Public by design; the private half never leaves.
//   POST         — one run of the loop, called hourly by pg_cron through
//                  pg_net. Refused without the shared secret, because anyone
//                  could otherwise make the app notify everybody on demand.
//                  With {"test": "<profile id>"} it sends that person's
//                  phones one test push instead, and records nothing.
//
// ALL THE DECIDING IS IN _shared/reach-out.ts, which test:reach-out drives end
// to end with a fake clock, database and push service. This file only wires
// the real ones, so it holds no rule a gate cannot see.
//
// Secrets it needs, set per project (the handover prompt):
//   VAPID_KEYS         — the JSON scripts/generate-vapid-keys.mjs prints
//   REACH_OUT_SECRET   — the same value stored in Vault as reach_out_secret
//   VAPID_CONTACT      — a mailto: the push services can reach if it misbehaves
// ---------------------------------------------------------------------------

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** One PostgREST read with the service key. Throws on a non-2xx, so the loop's per-person catch sees it. */
async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}: ${await res.text()}`);
  return await res.json() as T;
}

async function restWrite(method: "POST" | "DELETE", path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} ${res.status}: ${await res.text()}`);
}

/**
 * TODAY'S FOOD, from the fortnight's log: meals accounted for (eaten, or said
 * skipped), protein logged as eaten, and whether anything was logged before
 * today. Eaten is the app's own three types (meal-store.ts): confirmed,
 * swapped_in and extra.
 */
function foodFacts(rows: { date: string; event_type: string; macros: { protein?: number } | null }[], today: string) {
  const EATEN = new Set(["confirmed", "swapped_in", "extra"]);
  let mealsAccountedToday = 0;
  let proteinEatenToday = 0;
  let mealLoggedRecently = false;
  for (const r of rows) {
    if (r.date === today) {
      if (EATEN.has(r.event_type) || r.event_type === "skipped") mealsAccountedToday++;
      if (EATEN.has(r.event_type)) proteinEatenToday += Number(r.macros?.protein ?? 0) || 0;
    } else if (r.date < today) {
      mealLoggedRecently = true;
    }
  }
  return { mealsAccountedToday, proteinEatenToday, mealLoggedRecently };
}

/** The local YYYY-MM-DD of an instant, in a timezone. */
function localDateOf(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function realDeps(now: Date, appServer: webpush.ApplicationServer): ReachOutDeps {
  return {
    now,
    listSubscriptions: () => rest<PushSubscriptionRow[]>("push_subscriptions?select=id,user_id,endpoint,p256dh,auth,timezone"),

    loadFactsRow: async (userId) => {
      const rows = await rest<MomentFactsRow[]>(`coach_moment_facts?user_id=eq.${userId}&select=*`);
      return rows[0] ?? null;
    },

    loadSettings: async (userId) => {
      // select=* rather than the column by name: a pending migration must cost
      // the switches (absent means on), never the whole run. See CLAUDE.md on
      // column lists as migration dependencies.
      const rows = await rest<Record<string, unknown>[]>(`fitness_profiles?id=eq.${userId}&select=*`);
      const sw = rows[0]?.notification_switches;
      const name = rows[0]?.display_name;
      return {
        settings: (sw && typeof sw === "object" ? sw : {}) as NotificationSettings,
        name: typeof name === "string" && name.trim() ? name.trim() : null,
      };
    },

    loadLive: async (userId, today, timezone): Promise<LiveFacts> => {
      const since = addDays(today, -35);
      const recentSince = new Date(now.getTime() - 36 * 3_600_000).toISOString();
      const [sets, cardio, sessions, offers, meals] = await Promise.all([
        rest<{ completed_at: string | null }[]>(`exercise_set_logs?user_id=eq.${userId}&completed_at=gte.${since}T00:00:00Z&select=completed_at&order=completed_at.desc&limit=500`),
        rest<{ date: string }[]>(`cardio_logs?user_id=eq.${userId}&date=gte.${since}&select=date&order=date.desc&limit=200`),
        rest<Record<string, unknown>[]>(`workout_sessions?profile_id=eq.${userId}&date=gte.${addDays(today, -3)}&select=*`),
        rest<{ id: string }[]>(`pending_actions?profile_id=eq.${userId}&kind=eq.propose_load_catchup&status=eq.pending&expires_at=gt.${now.toISOString()}&select=id&limit=1`),
        // THE FORTNIGHT'S MEAL LOG, voided rows excluded the way the app's own
        // ledger excludes them. Her own calendar dates: meal_events.date is the
        // day she logged it FOR, already local.
        rest<{ date: string; event_type: string; macros: { protein?: number } | null }[]>(`meal_events?profile_id=eq.${userId}&date=gte.${addDays(today, -14)}&voided_at=is.null&select=date,event_type,macros&limit=500`),
      ]);
      const food = foodFacts(meals, today);
      const dates = new Set<string>();
      for (const s of sets) if (s.completed_at) dates.add(localDateOf(s.completed_at, timezone));
      for (const c of cardio) dates.add(c.date);
      const marks: Record<string, DayMarks> = {};
      const movedInto: string[] = [];
      let unrated = false;
      let lastFinishedAt: string | null = null;
      for (const row of sessions) {
        const date = String(row.date);
        marks[date] = {
          rest: row.deliberate_rest === true,
          movedAway: !!row.moved_to_date,
          swapped: !!row.swapped_for_activity,
          missed: row.marked_missed === true,
        };
        if (typeof row.moved_to_date === "string") movedInto.push(row.moved_to_date);
        if (typeof row.finished_at === "string" && row.finished_at >= recentSince && (row.felt === null || row.felt === undefined)) {
          unrated = true;
          if (!lastFinishedAt || row.finished_at > lastFinishedAt) lastFinishedAt = row.finished_at;
        }
      }
      return {
        activityDates: [...dates].sort().reverse(),
        marks,
        movedInto,
        unratedRecentSession: unrated,
        beatTargetOffered: offers.length > 0,
        lastFinishedAt,
        ...food,
      };
    },

    loadRecentSends: (userId) =>
      rest<SentRecord[]>(`coach_notifications_sent?user_id=eq.${userId}&select=moment,sent_on,sent_at&order=sent_at.desc&limit=30`),

    // The service worker reads title/body/moment/url/messageId and opens the chat on tap.
    send: (sub, payload) => sendPush(appServer, sub, payload, { topic: "coach" }),

    // THE SAME WORDS IN THE CHAT. Written with the service key, so the
    // person's own id is named on the row itself; the shortcut rides in
    // action_data, which the chat reads for its small button.
    insertChatMessage: async (userId, message) => {
      const res = await fetch(`${supabaseUrl}/rest/v1/chat_messages`, {
        method: "POST",
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json", Prefer: "return=representation",
        },
        body: JSON.stringify({
          profile_id: userId, role: "assistant", content: message.content, status: "complete",
          action_data: { source: "reminder", moment: message.moment, shortcut: message.shortcut },
        }),
      });
      if (!res.ok) throw new Error(`POST chat_messages ${res.status}: ${await res.text()}`);
      const rows = await res.json() as { id?: string }[];
      if (!rows[0]?.id) throw new Error("chat_messages insert returned no id");
      return rows[0].id;
    },
    deleteChatMessage: (userId, id) => restWrite("DELETE", `chat_messages?id=eq.${id}&profile_id=eq.${userId}`),

    // A 409 is the database refusing the reservation (a unique rule): not an
    // error, an answer — the caller sends nothing. Anything else throws, and the
    // loop skips this person for the hour.
    recordSent: async (userId, date, moment) => {
      const res = await fetch(`${supabaseUrl}/rest/v1/coach_notifications_sent`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, sent_on: date, moment }),
      });
      if (res.status === 409) return false;
      if (!res.ok) throw new Error(`POST coach_notifications_sent ${res.status}: ${await res.text()}`);
      return true;
    },
    unrecordSent: (userId, date, moment) =>
      restWrite("DELETE", `coach_notifications_sent?user_id=eq.${userId}&sent_on=eq.${date}&moment=eq.${moment}`),
    dropSubscription: (id) => restWrite("DELETE", `push_subscriptions?id=eq.${id}`),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.has("vapid")) {
    try {
      const key = await publicKey();
      return new Response(JSON.stringify({ publicKey: key }), { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }

  if (req.method !== "POST") return new Response("Not found", { status: 404, headers: cors });
  const secret = Deno.env.get("REACH_OUT_SECRET");
  if (!secret || req.headers.get("x-reach-out-secret") !== secret) {
    return new Response("Forbidden", { status: 403, headers: cors });
  }

  try {
    const appServer = await pushServer();

    // A TEST PUSH, for proving a real phone buzzes without waiting for a
    // moment to come due. Behind the same secret as the hourly run, so only
    // whoever holds it (the handover session on Ashley's machine) can send
    // one. Not recorded as said: it is not a coaching moment, and it must not
    // use up the day's one notification.
    const body = await req.json().catch(() => ({})) as { test?: unknown };
    if (typeof body.test === "string") {
      if (!/^[0-9a-f-]{36}$/i.test(body.test)) {
        return new Response(JSON.stringify({ error: "test must be a profile id" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const deps = realDeps(new Date(), appServer);
      const devices = await rest<PushSubscriptionRow[]>(`push_subscriptions?user_id=eq.${body.test}&select=id,user_id,endpoint,p256dh,auth,timezone`);
      const outcomes: string[] = [];
      for (const device of devices) {
        outcomes.push(await deps.send(device, { title: COACH_SENDER, body: "Reminders are working on this phone.", moment: "test", url: "/#/tab/chat" }));
      }
      return new Response(JSON.stringify({ test: true, devices: devices.length, outcomes }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const report = await runReachOut(realDeps(new Date(), appServer));
    console.log("[coach-reach-out]", JSON.stringify(report));
    return new Response(JSON.stringify(report), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[coach-reach-out] run failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
