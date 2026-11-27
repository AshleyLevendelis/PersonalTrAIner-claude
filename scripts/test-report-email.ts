// ---------------------------------------------------------------------------
// A REPORTED COACH REPLY, EMAILED TO ASHLEY (his request 22 Nov 2026). Drives _shared/report-email.ts end to end with
// a fake mail service, and reads the trigger's migration and the deploy for the two things only they decide.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { handleReportEmail, buildReportEmail, buildInactiveWarningEmail, REASON_WORDS } from '../supabase/functions/_shared/report-email'
import { REPORT_REASONS } from '../src/lib/reply-reports'

const ROOT = join(import.meta.dirname ?? process.cwd(), '..')
let failures = 0, ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const row = { id: 'r1', user_id: 'u-123', reply_text: 'Go to failure on every deadlift set.', reason: 'unsafe', note: 'my back hurts', created_at: '2026-11-22T10:00:00Z' }
const sent: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = []
const deps = (over: Partial<Parameters<typeof handleReportEmail>[2]> = {}) => ({
  secret: 's3cret', apiKey: 'key', to: 'owner@example.com', from: 'Personal TrAIner <onboarding@resend.dev>',
  send: async (r: typeof sent[number]) => { sent.push(r); return { ok: true, status: 200 } },
  ...over,
})

async function main() {
  console.log('\n1. The email says what was reported, in words')
  {
    const m = buildReportEmail(row)!
    check('the subject names the reason, unsafe flagged first', m.subject === '⚠️ Coach reply reported: Unsafe advice', m.subject)
    check('...and a non-urgent one carries no warning sign', buildReportEmail({ ...row, reason: 'other' })!.subject === 'Coach reply reported: Something else')
    check('the body has the reply word for word, the note and the account', m.text.includes(row.reply_text) && m.text.includes('Their note: my back hurts') && m.text.includes('Account: u-123'), m.text)
    check('no note reads "(none)", never blank', buildReportEmail({ ...row, note: null })!.text.includes('Their note: (none)'))
    check('every reason the app offers has its words here', REPORT_REASONS.every(r => REASON_WORDS[r.key] === r.label), REPORT_REASONS)
    check('a row with no reply, or an unknown reason, makes no email', buildReportEmail({ ...row, reply_text: ' ' }) === null && buildReportEmail({ ...row, reason: 'nope' }) === null)
  }

  console.log('\n2. Only the database may send, and a send is one well-formed call')
  {
    sent.length = 0
    const ok = await handleReportEmail('s3cret', { record: row }, deps())
    check('with the secret, it sends: 200', ok.status === 200 && ok.result === 'sent', ok)
    check('...one call, to the mail service, to the owner, with the subject and the text', sent.length === 1 && sent[0].url === 'https://api.resend.com/emails'
      && JSON.parse(sent[0].init.body).to[0] === 'owner@example.com' && /Unsafe advice/.test(JSON.parse(sent[0].init.body).subject)
      && JSON.parse(sent[0].init.body).text.includes(row.reply_text), sent[0]?.init.body)
    check('...signed with the key', sent[0]?.init.headers.Authorization === 'Bearer key')
    sent.length = 0
    const bad = await handleReportEmail('wrong', { record: row }, deps())
    const none = await handleReportEmail(null, { record: row }, deps())
    check('without the secret: refused, nothing sent', bad.status === 401 && none.status === 401 && sent.length === 0, { bad, none, sent: sent.length })
    const unset = await handleReportEmail('', { record: row }, deps({ secret: '' }))
    check('...and an empty secret on the server refuses everyone, even an empty header', unset.status === 401 && sent.length === 0, unset)
    const nokey = await handleReportEmail('s3cret', { record: row }, deps({ apiKey: '' }))
    check('not set up yet (no mail key): says so, sends nothing', nokey.status === 503 && sent.length === 0, nokey)
    const junk = await handleReportEmail('s3cret', { nope: 1 }, deps())
    check('a body that is not a report: refused, nothing sent', junk.status === 400 && sent.length === 0, junk)
    const down = await handleReportEmail('s3cret', { record: row }, deps({ send: async () => ({ ok: false, status: 422 }) }))
    check('a mail service that refuses is reported as such, not as sent', down.status === 502 && /422/.test(down.result), down)
  }

  console.log('\n3. The wiring: the database calls it after a save, and the deploy lets it')
  {
    const sql = readFileSync(join(ROOT, 'supabase/migrations/20261122120000_report_email_trigger.sql'), 'utf8').replace(/--.*$/gm, '')
    check('an AFTER INSERT trigger on the reports table (the report saves first)', /AFTER INSERT ON coach_reply_reports/i.test(sql))
    check('...every error inside it is swallowed, so an email can never cost a report', /EXCEPTION WHEN others THEN\s+RAISE WARNING/i.test(sql))
    check('...it posts to report-email with the secret header the function reads', /\/functions\/v1\/report-email/.test(sql) && /'x-report-email-secret'/.test(sql)
      && /x-report-email-secret/.test(readFileSync(join(ROOT, 'supabase/functions/report-email/index.ts'), 'utf8')))
    const deploy = readFileSync(join(ROOT, 'scripts/deploy-functions.mjs'), 'utf8')
    check('the deploy turns off the sign-in check for it (the database has no sign-in)', /NO_JWT = new Set\([^)]*'report-email'/.test(deploy))
  }

  // THE WARNING BEFORE AN UNUSED ACCOUNT IS DELETED (his ruling 26 Nov 2026). It goes to the PERSON, never to Ashley,
  // names the day in words, and says the one thing that stops it.
  console.log('\n9. The inactive-account warning goes to the person, with the day and how to keep the account')
  {
    const w = { kind: 'inactive_warning', email: 'sam@example.test', name: 'Sam', delete_on: '2027-01-15' }
    const m = buildInactiveWarningEmail(w)!
    check('the subject names the day in words', m?.subject === 'Your Personal TrAIner account will be deleted on 15 January 2027', m?.subject)
    check('...the body greets them by name, says what goes, and how to keep it (open the app, with its address)',
      /^Hi Sam,/.test(m?.text ?? '') && /plan, logs, meals and chat/.test(m?.text ?? '') && /open the app before then: https:\/\/personal-tr-a-iner-claude-yco8\.vercel\.app/.test(m?.text ?? ''), m?.text)
    check('...with no name, a plain "Hi,"', /^Hi,\n/.test(buildInactiveWarningEmail({ ...w, name: null })?.text ?? ''))
    check('no address, a malformed one, or no day: no email', buildInactiveWarningEmail({ ...w, email: '' }) === null
      && buildInactiveWarningEmail({ ...w, email: 'not-an-address' }) === null && buildInactiveWarningEmail({ ...w, delete_on: 'soon' }) === null)
    sent.length = 0
    const ok = await handleReportEmail('s3cret', w, deps())
    const body = sent[0] ? JSON.parse(sent[0].init.body) : null
    check('sent once, to THEM and not to the owner', ok.status === 200 && sent.length === 1 && body?.to?.length === 1 && body.to[0] === 'sam@example.test', body)
    check('...a malformed warning sends nothing', (await handleReportEmail('s3cret', { ...w, email: 'x' }, deps())).status === 400 && sent.length === 1)
    check('...and without the secret, nothing', (await handleReportEmail('wrong', w, deps())).status === 401 && sent.length === 1)
  }

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} FAILED`); process.exit(1) }
  console.log('A reported reply is emailed to Ashley, by the database only, and never at the cost of the report.')
}
main()
