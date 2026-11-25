// ---------------------------------------------------------------------------
// THE TESTER TOOLKIT (his rulings 25 Nov 2026: "Everything", "Both", screenshot "Yes, they can untick", "Email + daily
// summary"). The browser half (consent, what is recorded, the sheet) is verify:tester-report on the whole app. This
// gate holds what no screen shows:
//   1. a tester report's email: the words he chose, the picture attached only when sent, what he did before;
//   2. the daily summary: one line per problem however often it repeats, most testers first, quiet with no testers;
//   3. the one door: each kind goes to its own email, a summary with nothing to read sends nothing;
//   4. the database: owner-only on both tables, the email trigger never costs a report, the schedule guarded;
//   5. consent: nothing is recorded without it, every kind recorded is said before the tap, and the account's export
//      and deletion reach both tables.
// One exit at the bottom.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { AREA_WORDS, buildDigestEmail, buildTesterReportEmail, eventLine, handleReportEmail, problemKey, type DigestEvent } from '../supabase/functions/_shared/report-email'
import { REPORT_AREAS } from '../src/components/TesterReport'
import { TESTER_CONSENT_LINES, TESTER_NEVER_LINE } from '../src/components/profile/TesterSection'
import { EXPORTED_TABLES } from '../src/lib/user-data'

const ROOT = join(import.meta.dirname ?? process.cwd(), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/--.*$/gm, '')
let failures = 0, ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const SHOT = 'data:image/jpeg;base64,' + 'A'.repeat(4000)
const report = {
  id: 'r1', profile_id: 'p-1', area: 'meals', item_label: 'Dinner: Chicken stir fry', note: 'The calories look wrong for this',
  screen: 'nutrition › Dinner: Chicken stir fry', screenshot: SHOT, device: 'Mozilla/5.0 · 390x844', app_version: 'index-Abc123',
  created_at: '2026-11-25T18:00:00Z',
  recent_events: [
    { at: '2026-11-25T17:59:50Z', kind: 'tap', screen: 'nutrition', detail: { label: 'Dinner' } },
    { at: '2026-11-25T17:59:55Z', kind: 'typed', screen: 'nutrition', detail: { field: 'Amount', value: '250' } },
  ],
}

const ev = (over: Partial<DigestEvent>): DigestEvent => ({ profile_id: 'p-1', session_id: 's-1', at: '2026-11-25T10:00:00Z', kind: 'tap', screen: 'home', detail: {}, ...over })

async function main() {
  console.log('\n1. A tester report, emailed')
  {
    const m = buildTesterReportEmail(report)!
    check('the subject names the area, the item and the start of what he said', m.subject.startsWith('Tester report: Meals (Dinner: Chicken stir fry): The calories look wrong'), m.subject)
    check('the body has his words, the screen, the account, the device and the version', m.text.includes(report.note) && m.text.includes(`Screen: ${report.screen}`) && m.text.includes('Account: p-1') && m.text.includes('390x844') && m.text.includes('index-Abc123'), m.text)
    check('...and what he did just before, in order, in words', m.text.indexOf('tapped "Dinner"') > 0 && m.text.indexOf('typed "250" into Amount') > m.text.indexOf('tapped "Dinner"'), m.text)
    check('the picture is attached, as the JPEG he sent', m.attachments?.length === 1 && m.attachments[0].filename === 'screen.jpg' && m.attachments[0].content === 'A'.repeat(4000), m.attachments?.map(a => a.filename))
    check('...and the body says so', /Picture of the screen: attached/.test(m.text))
    const noShot = buildTesterReportEmail({ ...report, screenshot: null })!
    check('an unticked picture: nothing attached, and the body says not included', noShot.attachments === undefined && /Picture of the screen: not included/.test(noShot.text))
    check('something that is not a picture is never attached', buildTesterReportEmail({ ...report, screenshot: 'javascript:alert(1)' })!.attachments === undefined)
    check('every area the sheet offers has its words in the email', REPORT_AREAS.every(a => AREA_WORDS[a.key] === a.label), REPORT_AREAS)
    check('no words, or an unknown area, makes no email', buildTesterReportEmail({ ...report, note: '  ' }) === null && buildTesterReportEmail({ ...report, area: 'nope' }) === null)
    check('nothing recorded before reads "(nothing recorded)"', buildTesterReportEmail({ ...report, recent_events: [] })!.text.includes('(nothing recorded)'))
    check('a failed request reads as one, with its status', eventLine({ at: '2026-11-25T10:00:00Z', kind: 'network_error', screen: 'chat', detail: { path: '/functions/v1/chat-gemini', status: 500 } }) === '10:00:00 [chat] request failed: /functions/v1/chat-gemini (500)')
  }

  console.log('\n2. The daily summary')
  {
    const now = new Date('2026-11-26T07:17:00Z')
    const events: DigestEvent[] = [
      ev({ kind: 'start' }), ev({ kind: 'tap' }),
      ev({ profile_id: 'p-2', session_id: 's-2', kind: 'start' }),
      // The same crash, three times, two testers, with a different number in it each time.
      ev({ kind: 'error', screen: 'exercise', detail: { message: "TypeError: Cannot read properties of undefined (reading 'kg') at row 12" } }),
      ev({ kind: 'error', screen: 'exercise', detail: { message: "TypeError: Cannot read properties of undefined (reading 'kg') at row 31" } }),
      ev({ profile_id: 'p-2', session_id: 's-2', kind: 'error', screen: 'home', detail: { message: "TypeError: Cannot read properties of undefined (reading 'kg') at row 7" } }),
      // A different problem, five times, one tester.
      ...Array.from({ length: 5 }, () => ev({ kind: 'failed_save', screen: 'nutrition', detail: { message: "Couldn't save your meal. Try again." } })),
      ev({ kind: 'report' }),
    ]
    const m = buildDigestEmail(events, now)!
    check('one line per problem however often it repeats: 2 problems, 8 times', /2 problems \(8 times\)/.test(m.subject), m.subject)
    check('the crash is one line with its count, its testers and its screens', /3× Crash or error, 2 testers, on exercise, home/.test(m.text), m.text)
    check('...and the most testers affected come first, ahead of a bigger count from one tester', m.text.indexOf('3× Crash') > 0 && m.text.indexOf('3× Crash') < m.text.indexOf('5× Told the tester'), m.text)
    check('it says how many testers used the app, how often, and the reports', /2 testers used the app, 2 times\. 1 report sent/.test(m.text), m.text)
    check('a number or an id inside a message does not split a problem', problemKey(events[3]) === problemKey(events[4]) && problemKey(ev({ kind: 'error', detail: { message: 'row 1 of 00000000-0000-4000-8000-00000000b007' } })) === problemKey(ev({ kind: 'error', detail: { message: 'row 9 of 11111111-0000-4000-8000-00000000b007' } })))
    check('...but different words, or a different kind, do', problemKey(events[3]) !== problemKey(events[6]) && problemKey(ev({ kind: 'error', detail: { message: 'x' } })) !== problemKey(ev({ kind: 'console_error', detail: { message: 'x' } })))
    check('taps and screens are activity, never problems', !/Crash or error.*\n.*tap/.test(m.text) && !/× (tap|screen|start)/.test(m.text))
    const quiet = buildDigestEmail([ev({ kind: 'start' }), ev({ kind: 'tap' })], now)!
    check('testers and no problems: it says so in the subject and the body', /no problems recorded/.test(quiet.subject) && /No errors, failed saves or failed requests/.test(quiet.text), quiet)
    check('no testers at all: no email', buildDigestEmail([], now) === null)
  }

  console.log('\n3. The one door')
  {
    const sent: { body: string }[] = []
    const deps = (over: Record<string, unknown> = {}) => ({
      secret: 's3cret', apiKey: 'key', to: 'owner@example.com', from: 'PT <a@b.c>',
      send: async (r: { init: { body: string } }) => { sent.push({ body: r.init.body }); return { ok: true, status: 200 } },
      ...over,
    })
    const r1 = await handleReportEmail('s3cret', { kind: 'tester_report', record: report }, deps())
    const b1 = JSON.parse(sent[0]?.body ?? '{}')
    check('a tester report is sent once, its picture attached', r1.status === 200 && sent.length === 1 && b1.attachments?.[0]?.filename === 'screen.jpg' && /^Tester report: Meals/.test(b1.subject), { r1, subject: b1.subject })
    const r2 = await handleReportEmail('wrong', { kind: 'tester_report', record: report }, deps())
    check('...and refused without the shared secret, nothing sent', r2.status === 401 && sent.length === 1, r2)
    const r3 = await handleReportEmail('s3cret', { kind: 'tester_report', record: { ...report, note: '' } }, deps())
    check('a report with no words is refused, never half-sent', r3.status === 400 && sent.length === 1, r3)
    let asked = ''
    const r4 = await handleReportEmail('s3cret', { kind: 'digest' }, deps({ now: () => new Date('2026-11-26T07:17:00Z'), readEvents: async (since: string) => { asked = since; return [ev({ kind: 'error', detail: { message: 'boom' } })] } }))
    const b4 = JSON.parse(sent[1]?.body ?? '{}')
    check('the summary reads the last 24 hours', asked === '2026-11-25T07:17:00.000Z', asked)
    check('...and sends one summary', r4.status === 200 && sent.length === 2 && /^Testers, last 24 hours: 1 problem/.test(b4.subject ?? ''), { r4, subject: b4.subject })
    const r5 = await handleReportEmail('s3cret', { kind: 'digest' }, deps({ readEvents: async () => [] }))
    check('a summary with no testers sends nothing and says so', r5.status === 200 && r5.result === 'nothing to send' && sent.length === 2, r5)
    const r6 = await handleReportEmail('s3cret', { kind: 'digest' }, deps({ readEvents: async () => null }))
    check('a summary that could not read says so, never "nothing to send"', r6.status === 502 && sent.length === 2, r6)
    const r7 = await handleReportEmail('s3cret', { kind: 'digest' }, deps())
    check('a summary with no way to read is not set up', r7.status === 503, r7)
    const r8 = await handleReportEmail('s3cret', { record: { user_id: 'u', reply_text: 'x', reason: 'wrong' } }, deps())
    check('a body with no kind is still a coach-reply report', r8.status === 200 && /^Coach reply reported/.test(JSON.parse(sent[2]?.body ?? '{}').subject ?? ''), r8)
    const fn = strip(read('supabase/functions/report-email/index.ts'))
    check('the function reads the summary with its own service key, from tester_events, by time', /SUPABASE_SERVICE_ROLE_KEY/.test(fn) && /\/rest\/v1\/tester_events\?/.test(fn) && /created_at=gte\./.test(fn), null)
  }

  console.log('\n4. The database')
  {
    const sql = strip(read('supabase/migrations/20261125120000_tester_toolkit.sql'))
    for (const t of ['tester_events', 'tester_reports']) {
      check(`${t}: row-level security is on`, new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).test(sql))
      check(`${t}: read, write and delete only by the owner, and no update`, ['SELECT', 'INSERT', 'DELETE'].every(op => new RegExp(`CREATE POLICY "owner_${op.toLowerCase()}_${t}" ON ${t} FOR ${op}[\\s\\S]{0,80}owns_profile\\(profile_id\\)`).test(sql)) && !new RegExp(`ON ${t} FOR UPDATE`).test(sql))
      check(`${t}: deleted with the account`, new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([\\s\\S]*?profile_id\\s+uuid NOT NULL REFERENCES fitness_profiles\\(id\\) ON DELETE CASCADE`).test(sql))
    }
    check('the profile gains the date they agreed, nullable', /ADD COLUMN IF NOT EXISTS tester_since timestamptz;/.test(sql))
    const trig = sql.slice(sql.indexOf('FUNCTION public.email_tester_report'), sql.indexOf('CREATE TRIGGER tester_reports_email'))
    check('the email trigger swallows any error, so a report always saves', /EXCEPTION WHEN others THEN\s+RAISE WARNING/.test(trig) && !/RAISE EXCEPTION/.test(trig))
    check('...sends nothing until both secrets exist', /IF base IS NULL OR secret IS NULL THEN\s+RETURN NEW;/.test(trig))
    check('...and tells the function it is a tester report', /'kind', 'tester_report'/.test(trig))
    check('the trigger fires after each insert', /AFTER INSERT ON tester_reports\s+FOR EACH ROW EXECUTE FUNCTION public\.email_tester_report\(\)/.test(sql))
    check('the daily summary is scheduled only where the scheduler exists, once', /IF EXISTS \(SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'\)/.test(sql) && /cron\.unschedule\(jobid\) FROM cron\.job WHERE jobname = 'tester-digest-daily'/.test(sql) && /"kind":"digest"/.test(sql))
    check('no one but the database may call the trigger function', /REVOKE ALL ON FUNCTION public\.email_tester_report\(\) FROM PUBLIC, anon, authenticated/.test(sql))
  }

  console.log('\n5. Consent')
  {
    const log = strip(read('src/lib/tester-log.ts'))
    const rec = log.slice(log.indexOf('export function recordTesterEvent'), log.indexOf('function saveQueue'))
    check('nothing is recorded without a tester', /^\s*if \(!profileId\) return/m.test(rec.split('\n').slice(1, 3).join('\n')), rec.slice(0, 200))
    const priv = log.slice(log.indexOf('function isPrivateField'), log.indexOf('function fieldName'))
    check('a password, an email address and a marked box are never recorded', /type === 'password'/.test(priv) && /type === 'email'/.test(priv) && /password\|email/.test(priv) && /data-no-log/.test(priv))
    check('...and that rule is asked before what was typed is kept', /isPrivateField\(el\)\) return[\s\S]{0,200}typedPending\.set/.test(log))
    check('turning it off drops what was waiting', /if \(!id\) \{ queue = \[\]; ring\.length = 0 \}/.test(log) && /localStorage\.removeItem\(QUEUE_KEY\)/.test(log))
    check('a failed send of the log is never itself recorded', read('src/lib/tester-log.ts').includes('!/\\/tester_events/.test(url)'))
    const app = strip(read('src/App.tsx'))
    check('App follows the profile, and a read that did not say changes nothing', /testerSince === undefined\) return/.test(app) && /setTester\(testerSince \? testerProfileId : null\)/.test(app))
    check('New Plan turns it off for the person being left', /const handleReset[\s\S]*?setTester\(null\)[\s\S]*?const handleMacroModeChange/.test(app))
    const words = TESTER_CONSENT_LINES.join(' ')
    check('every kind recorded is said before the tap: crashes, failed saves, screens, taps, typing, the coach', /Crashes/.test(words) && /fails to save/.test(words) && /screen you open/.test(words) && /button you tap/.test(words) && /What you type/.test(words) && /coach/.test(words), words)
    check('...and the never line names both', /password/.test(TESTER_NEVER_LINE) && /email address/.test(TESTER_NEVER_LINE))
    const names = EXPORTED_TABLES.map(t => t.table)
    check("the account's download reaches both tables (deletion is the cascade, section 4)", names.includes('tester_events') && names.includes('tester_reports'), names.filter(n => /tester/.test(n)))
  }
}

main().catch(e => { failures++; console.error('  FAIL: the gate threw —', e) }).finally(() => {
  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) FAILED.`); process.exit(1) }
  console.log('test:tester-toolkit passed: reports and the daily summary are emailed in words, the tables are the owner\'s alone, and nothing is recorded without consent.')
})
