// test:heart-trends — WHAT THE HEART RATE SAYS ABOUT HIS TRAINING (his "Build 1, 2 and 3 now", 25 Nov 2026).
// 1. fitness: the same steady session at a lower heart rate, like for like only, a fall only;
// 2. recovery: a raised resting heart rate on three mornings against his usual, never on two, never on thin data;
// 3. the coach's opener offers a lighter day, only before a training day's session, once per run, naming no cause;
// 4. the coach is told, through one picture read with this person's name on every read, and its prompt holds the
//    lines (never a target, never a cause, offer never change);
// 5. Home and the corner of every screen draw them.
import { readFileSync } from 'fs'

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
}

import { fitnessTrends, recoveryFlag, type CardioHeartRow } from '../src/lib/heart-trends'
import { pickOpener, type OpenerInput } from '../src/lib/coach-opener'
import { pickNudge, nudgeKeys, openerSkips, keysCoveredByOpener, type NudgeInput } from '../src/lib/coach-nudge'
import { readHeartPicture, heartContextForCoach } from '../src/lib/health-heart'
import { setSupabaseClient } from '../src/lib/supabase'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const day = (base: string, n: number) => new Date(Date.parse(`${base}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const T = '2026-11-25'

async function main() {
  console.log('\n1. Fitness: the same steady session at a lower heart rate')
  const jog = (ago: number, hr: number, extra: Partial<CardioHeartRow> = {}): CardioHeartRow =>
    ({ date: day(T, -ago), activity_name: 'Easy jog', duration_minutes: 30, intensity_rpe: 4, avg_heart_rate: hr, ...extra })
  const falling = [jog(42, 153), jog(35, 151), jog(21, 147), jog(14, 144), jog(7, 142), jog(0, 140)]
  const f = fitnessTrends(falling)
  check('six easy jogs over six weeks, 152 down to 141: one line, first two against last two', f.length === 1 && f[0].from === 152 && f[0].to === 141 && f[0].weeks === 6, f)
  check('...said as "Easy jog: average heart rate 152 → 141 over 6 weeks"', f[0]?.line === 'Easy jog: average heart rate 152 → 141 over 6 weeks', f[0]?.line)
  check('a RISE is never shown (heat, sleep or a cold could be the cause)', fitnessTrends([jog(42, 140), jog(35, 141), jog(14, 148), jog(0, 150)]).length === 0)
  check('a fall under 3 beats is not shown', fitnessTrends([jog(42, 150), jog(35, 150), jog(14, 148), jog(0, 148)]).length === 0)
  check('...and a fall of exactly 3 is', fitnessTrends([jog(42, 150), jog(35, 150), jog(14, 147), jog(0, 147)]).length === 1)
  check('three sessions are too few', fitnessTrends(falling.slice(-3)).length === 0)
  check('four sessions inside three weeks are too close together', fitnessTrends([jog(18, 153), jog(12, 151), jog(6, 142), jog(0, 140)]).length === 0)
  check('...and four over exactly three weeks count', fitnessTrends([jog(21, 153), jog(14, 151), jog(7, 142), jog(0, 140)]).length === 1)
  check('hard efforts are left out (an interval session\'s average says nothing about fitness)', fitnessTrends(falling.map(r => ({ ...r, intensity_rpe: 8 }))).length === 0)
  check('...Steady (RPE 6) still counts', fitnessTrends(falling.map(r => ({ ...r, intensity_rpe: 6 }))).length === 1)
  const mixedLength = [jog(42, 153, { duration_minutes: 60 }), jog(35, 151, { duration_minutes: 60 }), jog(21, 147), jog(14, 144), jog(7, 142), jog(0, 140)]
  check('sessions of a different length are left out: the two 60-minute runs are not the start, the first 30-minute ones are (147 and 144 -> 146)', fitnessTrends(mixedLength)[0]?.from === 146 && fitnessTrends(mixedLength)[0]?.sessions === 4, fitnessTrends(mixedLength))
  check('different activities are never compared with each other', fitnessTrends([jog(42, 153), jog(35, 151), { ...jog(7, 140), activity_name: 'Bike' }, { ...jog(0, 139), activity_name: 'Bike' }]).length === 0)
  check('...while the same name in other case or spacing is the same activity', fitnessTrends([jog(42, 153), jog(35, 151), { ...jog(7, 142), activity_name: ' easy  JOG' }, jog(0, 140)]).length === 1)
  check('a session with no heart rate is skipped, not counted as zero', fitnessTrends([...falling, jog(3, 0), { ...jog(1, 0), avg_heart_rate: null }])[0]?.to === 141)

  console.log('\n2. Recovery: a raised resting heart rate, three mornings running')
  const rest = (ago: number, bpm: number) => ({ date: day(T, -ago), bpm })
  const usualWeeks = Array.from({ length: 14 }, (_, i) => rest(i + 4, 58))
  const raised = [...usualWeeks, rest(2, 64), rest(1, 65), rest(0, 63)]
  const flag = recoveryFlag(raised, T)
  check('58 usual, then 64, 65, 63: raised, about 6 above', flag?.usual === 58 && flag?.above === 6 && flag?.since === day(T, -2), flag)
  check('...said with the number and his usual, and no cause', flag?.line === 'Your resting heart rate has been about 6 above your usual (58) for 3 mornings.', flag?.line)
  check('two raised mornings are not enough', recoveryFlag([...usualWeeks, rest(2, 58), rest(1, 65), rest(0, 64)], T) === null)
  check('a morning with no reading breaks the run', recoveryFlag([...usualWeeks, rest(2, 64), rest(0, 64)], T) === null)
  check('4 above is not raised; 5 above is', recoveryFlag([...usualWeeks, rest(2, 62), rest(1, 62), rest(0, 62)], T) === null && recoveryFlag([...usualWeeks, rest(2, 63), rest(1, 63), rest(0, 63)], T) !== null)
  check('under five usual mornings: nothing said (no baseline to stand on)', recoveryFlag([rest(4, 58), rest(5, 58), rest(6, 58), rest(7, 58), rest(2, 70), rest(1, 70), rest(0, 70)], T) === null)
  check('the raised mornings are not part of their own usual (days 1-3 high, a baseline from 4 on)', recoveryFlag([...usualWeeks, rest(3, 70), rest(2, 64), rest(1, 65), rest(0, 63)], T)?.usual === 58)
  check('his usual is the middle reading, so one odd morning does not move it', recoveryFlag([...usualWeeks.slice(1), rest(4, 90), rest(2, 64), rest(1, 65), rest(0, 63)], T)?.usual === 58)

  console.log('\n3. The coach\'s opener offers a lighter day')
  const base: OpenerInput = {
    hour: 8, cutoffHour: 18, awaitingFeel: null, missedYesterday: null, planKnown: true,
    todaySession: { focus: 'Legs', movements: 'squat, RDL' }, todayLogged: false, tomorrowSession: null,
    recovery: { line: flag!.line },
  }
  const o = pickOpener(base)
  check('a training day, nothing logged, before his usual hour: the recovery opener', o.kind === 'recovery_flag' && o.attention === true, o)
  check('...says the reading, that it can mean fatigue, and offers today lighter', /^your resting heart rate has been about 6 above your usual \(58\) for 3 mornings\. That can mean you're still carrying some fatigue\. Want today's Legs lighter\?$/.test(o.text), o.text)
  check('...with the shortest version and a "keep it" beside it, both sent as his words', JSON.stringify(o.chips) === JSON.stringify(['Give me the shortest version today', "I feel fine, keep it as it is"]), o.chips)
  check('it names no cause and no target', !/\b(ill|sick|infection|virus|overtrain|zone|bpm target|train at)\b/i.test(o.text + flag!.line))
  check('not on a rest day (nothing to lighten)', pickOpener({ ...base, todaySession: null }).kind !== 'recovery_flag')
  check('not once he has logged a set', pickOpener({ ...base, todayLogged: true }).kind !== 'recovery_flag')
  check('not after his usual hour (the session is behind him)', pickOpener({ ...base, hour: 19 }).kind !== 'recovery_flag')
  check('not without a flag', pickOpener({ ...base, recovery: null }).kind !== 'recovery_flag')
  check('an unreviewed session and a missed day still come first', pickOpener({ ...base, awaitingFeel: { date: T, isToday: false } }).kind === 'session_feel' && pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Push' } }).kind === 'missed_yesterday')

  console.log('\n3b. ...and as the day\'s first unprompted message (the coach\'s events)')
  const nin: NudgeInput = {
    today: T, hour: 8, cutoffHour: 18, planKnown: true, awaitingFeel: null, missedYesterday: null,
    recentPR: { exerciseName: 'Squat', metric: 'weight', value: 100, date: day(T, -1) } as NudgeInput['recentPR'],
    weeksOnPlan: 4, todaySession: { focus: 'Legs', movements: 'squat, RDL' }, todayLogged: false,
    recovery: { line: flag!.line, since: flag!.since },
  }
  const ev = pickNudge(nin, [])
  check('above a personal best and weeks on plan: the recovery offer, the same words and replies as the opener', ev?.kind === 'recovery_flag' && ev.text === `${flag!.line} That can mean you're still carrying some fatigue. Want today's Legs lighter?` && JSON.stringify(ev.chips) === JSON.stringify(o.chips), ev)
  check('...speaking for the run and today\'s session, so "feeling good for it?" does not follow it', JSON.stringify(ev?.keys) === JSON.stringify([`recovery:${flag!.since}`, `due:${T}`]), ev?.keys)
  check('raised ONCE per run: with the run\'s key said, the next day of the same run is not raised again', pickNudge({ ...nin, today: day(T, 1), recentPR: null, weeksOnPlan: 0 }, [`recovery:${flag!.since}`])?.kind === 'session_due')
  check('...a new run (a later first morning) is raised afresh', pickNudge({ ...nin, recovery: { line: flag!.line, since: day(T, 5) }, today: day(T, 7) }, [`recovery:${flag!.since}`])?.kind === 'recovery_flag')
  check('an unreviewed session and a missed day still come first here too', pickNudge({ ...nin, awaitingFeel: { date: T, isToday: false } }, [])?.kind === 'session_feel' && pickNudge({ ...nin, missedYesterday: { date: day(T, -1), dayName: 'Monday', focus: 'Push' } }, [])?.kind === 'missed_yesterday')
  check('not on a rest day, not once a set is logged, not after his usual hour', [{ todaySession: null }, { todayLogged: true }, { hour: 19 }].every(x => pickNudge({ ...nin, ...x }, [])?.kind !== 'recovery_flag'))
  const k = nudgeKeys(nin)
  check('the opener skips the offer once it has been said, and an opener that said it burns its key and the session\'s', openerSkips(k, [`recovery:${flag!.since}`]).recovery === true && openerSkips(k, []).recovery === false && JSON.stringify(keysCoveredByOpener('recovery_flag', k, false)) === JSON.stringify([`recovery:${flag!.since}`, `due:${T}`]))

  console.log('\n4. The coach is told, from one picture')
  const asked: string[] = []
  const tables: Record<string, unknown[]> = {
    daily_resting_heart_rate: raised.map(r => ({ ...r, profile_id: 'p1' })),
    cardio_logs: falling.map(r => ({ ...r, user_id: 'p1', max_heart_rate: r.avg_heart_rate! + 20 })),
    workout_sessions: [{ profile_id: 'p1', date: day(T, -1), split_type: 'Legs', avg_heart_rate: 118, max_heart_rate: 161 }],
  }
  const query = (table: string) => {
    const filters: string[] = []
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push(`${c}=${v}`); return q },
      gte: (c: string, v: unknown) => { filters.push(`${c}>=${v}`); return q },
      lte: (c: string, v: unknown) => { filters.push(`${c}<=${v}`); return q },
      then: (res: (x: unknown) => void) => { asked.push(`${table}: ${filters.join(' & ')}`); res({ data: tables[table] ?? [], error: null }) },
    }
    return q
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: query } as any)
  const pic = await readHeartPicture('p1', T)
  check('the picture holds the resting trend, the flag, the fitness line and the week\'s sessions', !!pic.resting && pic.recovery?.above === 6 && pic.fitness.length === 1 && pic.sessions.length === 3, { ...pic, fitness: pic.fitness.length })
  check('every read names this person, and resting reads far enough back for his usual (20 days)', asked.length === 3 && asked.every(a => /(user_id|profile_id)=p1/.test(a)) && asked.some(a => a.startsWith('daily_resting_heart_rate') && a.includes(`date>=${day(T, -20)}`)), asked)
  const ctx = heartContextForCoach(pic)
  check('the coach is told the flag, the fitness line and each session\'s average and highest', ctx.includes(flag!.line) && ctx.includes('Easy jog: average heart rate 152 → 141 over 6 weeks') && ctx.includes(`${day(T, -1)}: Legs session, average 118, highest 161.`), ctx)
  check('nothing to tell: nothing said (a person with no watch costs the coach no words)', heartContextForCoach({ resting: null, recovery: null, fitness: [], sessions: [] }) === '')
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  check('the chat sends the picture as heart_rate_context, hands the flag to the events and the opener, and waits for it before speaking', /heart_rate_context:\s*heartContext/.test(chat) && /recovery:\s*heartRecovery,/.test(chat) && /recovery:\s*heartRecovery && !skip\.recovery/.test(chat) && /setHeartContext\(m\.heartContextForCoach\(picture\)\)/.test(chat) && /!planKnown \|\| !heartLoaded\) return/.test(chat))
  const fn = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  const sec = fn.slice(fn.indexOf('HEART RATE (from their watch'), fn.indexOf('HEART RATE (from their watch') + 1400)
  check('the coach\'s instructions show the facts and say: never a target or zone, never a cause, GP if worried, offer never change',
    /context\.heart_rate_context/.test(sec) && /NEVER give a heart rate target, zone/.test(sec) && /never name a cause/.test(sec) && /GP/.test(sec) && /OFFER a lighter day/.test(sec), sec.slice(0, 200))

  console.log('\n5. Home and the corner draw them')
  const dash = strip(readFileSync('src/components/Dashboard.tsx', 'utf8'))
  check('Home shows the fitness line from the picture, a strap alone being enough', /setFitnessLine\(picture\.fitness\[0\]\?\.line \?\? null\)/.test(dash) && /data-home-fitness-hr/.test(dash) && /pairedStrap\(\)/.test(dash))
  const app = strip(readFileSync('src/App.tsx', 'utf8'))
  check('the corner heart sits beside the gear and opens the strap\'s row on Profile', /<LiveHeart[\s\S]{0,200}onOpen=\{\(\) => \{ setProfileInfoSection\('health'\); setProfileInfoOpen\(true\) \}\}/.test(app))

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('test:heart-trends passed: fitness shown like for like, recovery offered once and never imposed, the coach told the facts.')
}

main().catch(e => { console.error(e); process.exit(1) })
