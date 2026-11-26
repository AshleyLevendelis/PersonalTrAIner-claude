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

// ---------------------------------------------------------------------------
// THE TESTER TOOLKIT (his rulings 25 Nov 2026: "Everything", "Both", screenshot "Yes, they can untick", "Email + daily
// summary"; migration 20261125150000). Two more things come through the same door, told apart by `kind`:
//   - kind "tester_report": one report a tester sent from the app, emailed as it arrives, its screenshot attached;
//   - kind "digest": once a day, the last 24 hours of tester errors, GROUPED, so one crash that repeats is one line
//     with a count, never fifty emails. No problems and no testers active: no email at all.
// A body with no kind is a coach-reply report, as before.
// ---------------------------------------------------------------------------

export interface TesterReportRow {
  id?: string
  profile_id?: string
  area?: string
  item_label?: string | null
  note?: string
  screen?: string | null
  screenshot?: string | null
  recent_events?: { at?: string; kind?: string; screen?: string | null; detail?: Record<string, unknown> }[] | null
  device?: string | null
  app_version?: string | null
  created_at?: string
}

/** The area in the words the tester tapped (TesterReport.tsx's REPORT_AREAS). */
export const AREA_WORDS: Record<string, string> = {
  chat: 'Coach chat',
  meals: 'Meals',
  exercise: 'Exercise',
  tools: 'Timers & tools',
  home: 'Home & progress',
  setup: 'Setup & profile',
  other: 'Something else',
}

/** One recorded event as one short line, for a report's "what they did just before" and the summary. */
export function eventLine(e: { at?: string; kind?: string; screen?: string | null; detail?: Record<string, unknown> }): string {
  const d = e.detail ?? {}
  const t = e.at ? e.at.slice(11, 19) : '--:--:--'
  const where = e.screen ? ` [${e.screen}]` : ''
  const what = (() => {
    switch (e.kind) {
      case 'tap': return `tapped "${String(d.label ?? d.testid ?? '?')}"`
      case 'typed': return `typed "${String(d.value ?? '')}" into ${String(d.field ?? 'a box')}`
      case 'screen': return 'opened the screen'
      case 'failed_save': return `saw "${String(d.message ?? '')}"`
      case 'network_error': return `request failed: ${String(d.path ?? '')} (${String(d.status ?? 'no answer')})`
      case 'error': case 'console_error': return `error: ${String(d.message ?? '')}`
      case 'report': return 'sent a report'
      case 'start': return 'opened the app'
      default: return String(e.kind ?? 'something')
    }
  })()
  return `${t}${where} ${what}`.slice(0, 300)
}

const SCREENSHOT_PREFIX = /^data:image\/(jpeg|png);base64,/

export function buildTesterReportEmail(r: TesterReportRow): { subject: string; text: string; attachments?: { filename: string; content: string }[] } | null {
  const area = r.area && AREA_WORDS[r.area]
  const note = (r.note ?? '').trim()
  if (!area || !note) return null
  const when = r.created_at ? new Date(r.created_at).toUTCString() : 'just now'
  const events = (r.recent_events ?? []).slice(-20)
  const shot = (r.screenshot ?? '').match(SCREENSHOT_PREFIX)
  const subject = `Tester report: ${area}${r.item_label ? ` (${r.item_label.slice(0, 40)})` : ''}: ${note.replace(/\s+/g, ' ').slice(0, 60)}`
  const text = [
    `A tester sent a report from Personal TrAIner.`,
    ``,
    `About: ${area}${r.item_label ? `, ${r.item_label}` : ''}`,
    `What they said:`,
    note,
    ``,
    `Screen: ${r.screen || 'unknown'}`,
    `When: ${when}`,
    `Account: ${r.profile_id ?? 'unknown'}`,
    `Device: ${r.device || 'unknown'}`,
    `App version: ${r.app_version || 'unknown'}`,
    `Picture of the screen: ${shot ? 'attached' : 'not included'}`,
    ``,
    `What they did just before (oldest first):`,
    ...(events.length ? events.map(eventLine) : ['(nothing recorded)']),
    ``,
    `All reports: Supabase, Table Editor, tester_reports. Everything they did: tester_events, by account.`,
  ].join('\n')
  const attachments = shot ? [{ filename: `screen.${shot[1] === 'png' ? 'png' : 'jpg'}`, content: (r.screenshot ?? '').replace(SCREENSHOT_PREFIX, '') }] : undefined
  return { subject, text, attachments }
}

export interface DigestEvent { profile_id?: string; session_id?: string; at?: string; kind?: string; screen?: string | null; detail?: Record<string, unknown> }

const PROBLEM_KINDS = new Set(['error', 'console_error', 'failed_save', 'network_error'])
const KIND_WORDS: Record<string, string> = { error: 'Crash or error', console_error: 'Error logged', failed_save: 'Told the tester something failed', network_error: 'Request failed' }

/** The same problem twice is one line: numbers, ids and times in the message are not what makes it different. */
export function problemKey(e: DigestEvent): string {
  const d = e.detail ?? {}
  const msg = String(d.message ?? d.path ?? '').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>').replace(/\d+/g, 'N').slice(0, 160)
  return `${e.kind}|${msg}`
}

export function buildDigestEmail(events: DigestEvent[], now: Date): { subject: string; text: string } | null {
  const testers = new Set(events.map(e => e.profile_id).filter(Boolean))
  if (testers.size === 0) return null
  const sessions = new Set(events.map(e => e.session_id).filter(Boolean))
  const reports = events.filter(e => e.kind === 'report').length
  const groups = new Map<string, { kind: string; sample: DigestEvent; count: number; who: Set<string>; screens: Set<string> }>()
  for (const e of events) {
    if (!e.kind || !PROBLEM_KINDS.has(e.kind)) continue
    const k = problemKey(e)
    const g = groups.get(k) ?? { kind: e.kind, sample: e, count: 0, who: new Set<string>(), screens: new Set<string>() }
    g.count++
    if (e.profile_id) g.who.add(e.profile_id)
    if (e.screen) g.screens.add(e.screen)
    groups.set(k, g)
  }
  const list = [...groups.values()].sort((a, b) => b.who.size - a.who.size || b.count - a.count)
  const problems = list.reduce((n, g) => n + g.count, 0)
  const day = now.toISOString().slice(0, 10)
  const subject = problems
    ? `Testers, last 24 hours: ${list.length} problem${list.length === 1 ? '' : 's'} (${problems} time${problems === 1 ? '' : 's'})`
    : `Testers, last 24 hours: no problems recorded`
  const text = [
    `Personal TrAIner testers, the 24 hours to ${day} 07:00 UTC.`,
    ``,
    `${testers.size} tester${testers.size === 1 ? '' : 's'} used the app, ${sessions.size} time${sessions.size === 1 ? '' : 's'}. ${reports} report${reports === 1 ? '' : 's'} sent (each was emailed when it came in).`,
    ``,
    problems ? `Problems, most testers affected first:` : `No errors, failed saves or failed requests were recorded.`,
    ...list.slice(0, 40).flatMap(g => [
      ``,
      `${g.count}× ${KIND_WORDS[g.kind] ?? g.kind}, ${g.who.size} tester${g.who.size === 1 ? '' : 's'}${g.screens.size ? `, on ${[...g.screens].slice(0, 4).join(', ')}` : ''}`,
      `   ${String(g.sample.detail?.message ?? g.sample.detail?.path ?? '').slice(0, 240)}${g.sample.detail?.status ? ` (${String(g.sample.detail.status)})` : ''}`,
    ]),
    ...(list.length > 40 ? [``, `…and ${list.length - 40} more. All of them: Supabase, Table Editor, tester_events.`] : []),
    ``,
    `Everything a tester did: Supabase, Table Editor, tester_events, filtered by account.`,
  ].join('\n')
  return { subject, text }
}

// THE WARNING BEFORE AN UNUSED ACCOUNT IS DELETED (his ruling 26 Nov 2026, "Delete after 2 years, email first";
// migration 20261126130000). Sent to the PERSON, not to Ashley. It names the day and the one thing that stops it.
const APP_ADDRESS = 'https://personal-tr-a-iner-claude-yco8.vercel.app'
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

export function buildInactiveWarningEmail(w: { email?: string; name?: string | null; delete_on?: string }): { to: string; subject: string; text: string } | null {
  const to = (w.email ?? '').trim()
  if (!EMAIL_SHAPE.test(to) || !w.delete_on || !DATE_SHAPE.test(w.delete_on)) return null
  const day = new Date(`${w.delete_on}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const name = (w.name ?? '').trim().slice(0, 30)
  return {
    to,
    subject: `Your Personal TrAIner account will be deleted on ${day}`,
    text: [
      `${name ? `Hi ${name},` : 'Hi,'}`,
      ``,
      `You haven't opened Personal TrAIner for nearly two years, so on ${day} your account and everything in it (your plan, logs, meals and chat) will be deleted.`,
      ``,
      `To keep it, just open the app before then: ${APP_ADDRESS}`,
      ``,
      `If you're happy for it to go, you don't need to do anything.`,
    ].join('\n'),
  }
}

export interface ReportEmailDeps {
  secret: string
  apiKey: string
  to: string
  from: string
  send: (req: { url: string; init: { method: string; headers: Record<string, string>; body: string } }) => Promise<{ ok: boolean; status: number }>
  /** The digest's read: every tester event created since this time. Absent: the digest cannot run. */
  readEvents?: (sinceIso: string) => Promise<DigestEvent[] | null>
  now?: () => Date
}

/** One call from the database. Returns the HTTP status and a short word for the log. */
export async function handleReportEmail(
  headerSecret: string | null,
  body: unknown,
  deps: ReportEmailDeps,
): Promise<{ status: number; result: string }> {
  if (!deps.secret || headerSecret !== deps.secret) return { status: 401, result: 'refused' }
  if (!deps.apiKey || !deps.to) return { status: 503, result: 'not set up' }
  const kind = (body as { kind?: string } | null)?.kind
  let mail: { subject: string; text: string; attachments?: { filename: string; content: string }[] } | null
  if (kind === 'digest') {
    if (!deps.readEvents) return { status: 503, result: 'not set up' }
    const now = deps.now?.() ?? new Date()
    const events = await deps.readEvents(new Date(now.getTime() - 24 * 3600 * 1000).toISOString())
    if (events == null) return { status: 502, result: 'could not read events' }
    mail = buildDigestEmail(events, now)
    if (!mail) return { status: 200, result: 'nothing to send' }
  } else if (kind === 'inactive_warning') {
    const warning = buildInactiveWarningEmail(body as { email?: string; name?: string | null; delete_on?: string })
    if (!warning) return { status: 400, result: 'not a warning' }
    const res = await deps.send({
      url: 'https://api.resend.com/emails',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: deps.from, to: [warning.to], subject: warning.subject, text: warning.text }),
      },
    })
    return res.ok ? { status: 200, result: 'sent' } : { status: 502, result: `mail service said ${res.status}` }
  } else if (kind === 'tester_report') {
    const record = (body as { record?: TesterReportRow } | null)?.record
    mail = record ? buildTesterReportEmail(record) : null
    if (!mail) return { status: 400, result: 'not a report' }
  } else {
    const record = (body as { record?: ReportRow } | null)?.record
    mail = record ? buildReportEmail(record) : null
    if (!mail) return { status: 400, result: 'not a report' }
  }
  const res = await deps.send({
    url: 'https://api.resend.com/emails',
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: deps.from, to: [deps.to], subject: mail.subject, text: mail.text, ...(mail.attachments ? { attachments: mail.attachments } : {}) }),
    },
  })
  return res.ok ? { status: 200, result: 'sent' } : { status: 502, result: `mail service said ${res.status}` }
}
