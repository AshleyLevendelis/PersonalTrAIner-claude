import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleReportEmail } from "../_shared/report-email.ts";

// ---------------------------------------------------------------------------
// report-email — a reported coach reply, emailed to Ashley (his request 22 Nov 2026).
//
// Called by the database (the coach_reply_reports insert trigger, through pg_net), never by the app, so it carries
// no user's sign-in: the deploy turns the gateway's sign-in check off (scripts/deploy-functions.mjs NO_JWT) and this
// door checks its own shared secret instead. All the rules are in _shared/report-email.ts, held by test:report-email.
//
// Secrets it needs, set per project (the handover prompt):
//   REPORT_EMAIL_SECRET  — the same value stored in Vault as report_email_secret
//   RESEND_API_KEY       — from resend.com (the free plan sends to the account's own address)
//   REPORT_EMAIL_TO      — where the reports go
//   REPORT_EMAIL_FROM    — optional; defaults to Resend's own test sender
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const { status, result } = await handleReportEmail(req.headers.get("x-report-email-secret"), body, {
    secret: Deno.env.get("REPORT_EMAIL_SECRET") ?? "",
    apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
    to: Deno.env.get("REPORT_EMAIL_TO") ?? "",
    from: Deno.env.get("REPORT_EMAIL_FROM") ?? "Personal TrAIner <onboarding@resend.dev>",
    send: async ({ url, init }) => {
      const r = await fetch(url, init);
      return { ok: r.ok, status: r.status };
    },
  });
  console.log(`report-email: ${result}`);
  return new Response(JSON.stringify({ result }), { status, headers: { "Content-Type": "application/json" } });
});
