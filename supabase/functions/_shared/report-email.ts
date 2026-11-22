// ---------------------------------------------------------------------------
// A REPORTED COACH REPLY, EMAILED TO ASHLEY (his request 22 Nov 2026, "email me each new report").
//
// The database calls the report-email function once for each new row in coach_reply_reports (a trigger through
// pg_net, migration 20261122120000). This file holds every rule, with no Deno and no network of its own, so
// test:report-email drives it end to end with a fake mail service:
//   - refused without the shared secret, because anyone could otherwise send mail through it;
//   - a report the database did not describe properly is refused, never half-sent;
//   - the email is plain text: the reason in words, the note, the reply word for word, when, and whose account.
// The report is saved whether or not the email goes: the trigger never blocks the insert.
// ---------------------------------------------------------------------------

export interface ReportRow {
  id?: string
  user_id?: string
  reply_text?: string
  reason?: string
  note?: string | null
  created_at?: string
}

/** The reason in the words the person tapped (ReportReplyButton's REPORT_REASONS). */
export const REASON_WORDS: Record<string, string> = {
  wrong: 'Wrong or misleading',
  unsafe: 'Unsafe advice',
  offensive: 'Offensive or inappropriate',
  other: 'Something else',
}

export function buildReportEmail(r: ReportRow): { subject: string; text: string } | null {
  const reason = r.reason && REASON_WORDS[r.reason]
  const reply = (r.reply_text ?? '').trim()
  if (!reason || !reply) return null
  const note = (r.note ?? '').trim()
  const when = r.created_at ? new Date(r.created_at).toUTCString() : 'just now'
  // UNSAFE FIRST IN THE SUBJECT: it is the one to read before the others.
  const subject = `${r.reason === 'unsafe' ? '⚠️ ' : ''}Coach reply reported: ${reason}`
  const text = [
    `A coach reply was reported in Personal TrAIner.`,
    ``,
    `Reason: ${reason}`,
    `Their note: ${note || '(none)'}`,
    `When: ${when}`,
    `Account: ${r.user_id ?? 'unknown'}`,
    ``,
    `The reply, word for word:`,
    `----------`,
    reply,
    `----------`,
    ``,
    `All reports: Supabase, Table Editor, coach_reply_reports.`,
  ].join('\n')
  return { subject, text }
}

export interface ReportEmailDeps {
  secret: string
  apiKey: string
  to: string
  from: string
  send: (req: { url: string; init: { method: string; headers: Record<string, string>; body: string } }) => Promise<{ ok: boolean; status: number }>
}

/** One call from the database. Returns the HTTP status and a short word for the log. */
export async function handleReportEmail(
  headerSecret: string | null,
  body: unknown,
  deps: ReportEmailDeps,
): Promise<{ status: number; result: string }> {
  if (!deps.secret || headerSecret !== deps.secret) return { status: 401, result: 'refused' }
  if (!deps.apiKey || !deps.to) return { status: 503, result: 'not set up' }
  const record = (body as { record?: ReportRow } | null)?.record
  const mail = record ? buildReportEmail(record) : null
  if (!mail) return { status: 400, result: 'not a report' }
  const res = await deps.send({
    url: 'https://api.resend.com/emails',
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: deps.from, to: [deps.to], subject: mail.subject, text: mail.text }),
    },
  })
  return res.ok ? { status: 200, result: 'sent' } : { status: 502, result: `mail service said ${res.status}` }
}
