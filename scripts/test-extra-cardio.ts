// ---------------------------------------------------------------------------
// test:extra-cardio — SAM'S RUN (live test, 20 Oct 2026; docs/plans/extra-cardio-and-distance.md).
//
// "I went for a 40 minute run at lunch, about 6km, pretty hard" on a lifting day was offered as a REPLACEMENT for
// the lift; "No, it's extra, just log the run" got "instead of that one, or on a different day?". The 6 km had
// nowhere to go, and a knee being eased off until 22 Oct drew no word. Holds:
//   §1 her words are the evidence: minutes, distance (km and miles) and effort are read from what she wrote;
//   §2 the coach's tool: logged as extra by default, asks the effort, takes a distance only she gave, and the
//      prompt and the swap tool point a past-tense activity at it;
//   §3 distance: saved, said on every line ("Run · 40 min · Hard · 6 km"), told to the coach, and a database that
//      has not run the migration still saves the session;
//   §4 the coach's write: extra by default, the day swap only on her "count it", Undo takes back only its own;
//   §5 the ease-off question: asked after an impact activity while a knee, ankle or hip ease-off runs, never else.
// ---------------------------------------------------------------------------

const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
;(globalThis as unknown as { window: unknown }).window = globalThis
for (const m of ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[m] !== 'function') (globalThis as Record<string, unknown>)[m] = () => true
}

import { readFileSync } from 'fs'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

async function main() {
  const { statedDistancesKm, statedMinutes, statedEffort } = await import('../supabase/functions/_shared/message-evidence')

  console.log('\n§1 Her words are the evidence')
  const sam = 'I went for a 40 minute run at lunch, about 6km, pretty hard'
  check('her sentence: 40 minutes, 6 km, hard', JSON.stringify(statedMinutes(sam)) === '[40]' && JSON.stringify(statedDistancesKm(sam)) === '[6]' && statedEffort(sam) === 'hard',
    { minutes: statedMinutes(sam), km: statedDistancesKm(sam), effort: statedEffort(sam) })
  check('kilometres in other spellings', JSON.stringify(statedDistancesKm('5.5 kilometres, then 10k, then 3 km')) === '[5.5,10,3]', statedDistancesKm('5.5 kilometres, then 10k, then 3 km'))
  check('miles converted, the one conversion with one answer: 3 miles is 4.83 km', JSON.stringify(statedDistancesKm('ran 3 miles')) === '[4.83]', statedDistancesKm('ran 3 miles'))
  check('no distance is read from words that are not one ("a parkrun", "40 minute")', statedDistancesKm('did a parkrun, 40 minute').length === 0, statedDistancesKm('did a parkrun, 40 minute'))
  check('an hour, half an hour and 1.5 hours are minutes', JSON.stringify(statedMinutes('an hour')) === '[60]' && JSON.stringify(statedMinutes('half an hour')) === '[30]' && JSON.stringify(statedMinutes('1.5 hours')) === '[90]',
    [statedMinutes('an hour'), statedMinutes('half an hour'), statedMinutes('1.5 hours')])

  console.log('\n§2 The coach\'s tool')
  const fn = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
  const handler = fn.slice(fn.indexOf('if (name === "propose_cardio_log")'), fn.indexOf('if (name === "log_meal")'))
  check('the handler exists (sanity check on these checks)', handler.length > 600, handler.length)
  check('the minutes are hers: the model\'s figure only when she said it, else her one figure, else it asks how long',
    /minutesSaid\.includes\(asked\) \? asked : minutesSaid\.length === 1 \? minutesSaid\[0\] : null/.test(handler) && /How long was the/.test(handler))
  check('no effort in her words: it asks, and sends no card', /const effort = statedEffort\(/.test(handler) && /if \(!effort\) \{[\s\S]{0,200}How hard did that feel — easy, steady or hard\?/.test(handler))
  check('a distance only she gave', /kmSaid\.some\(\(k\) => Math\.abs\(k - kmAsked\) <= 0\.05\) \? kmAsked : kmSaid\.length === 1 \? kmSaid\[0\] : null/.test(handler))
  check('it proposes, never writes', /kind: "propose_cardio_log"/.test(handler) && !/method: "POST"/.test(handler))
  const decl = /name: "propose_cardio_log",[\s\S]{0,2200}?required:/.exec(fn)?.[0] ?? ''
  check('the tool says it is the default for something done in the past tense, lift or no lift', /THIS IS THE DEFAULT for something done, told in the past tense/.test(decl) && /INCLUDING on a day with a lift planned/.test(decl))
  const swapDecl = /name: "propose_session_activity_swap",[\s\S]{0,2400}?parameters:/.exec(fn)?.[0] ?? ''
  check('the swap tool now sends a past-tense activity to it, and swaps only on "instead"', /NOT propose_cardio_log \(an activity they ALREADY DID/.test(swapDecl) && /only when they say it was INSTEAD of the session/.test(swapDecl))
  const planDecl = /name: "propose_cardio_session",[\s\S]{0,2000}?parameters:/.exec(fn)?.[0] ?? ''
  check('...and the plan-a-session tool says the same', /NOT for something they ALREADY DID: that is propose_cardio_log/.test(planDecl))
  check('the prompt rule: logged as extra, never swapped in; "it\'s extra, just log it" is this tool', /2a\. SOMETHING ALREADY DONE IS LOGGED AS EXTRA, NEVER SWAPPED IN/.test(fn) && /"No, it's extra, just log it" means propose_cardio_log/.test(fn))

  console.log('\n§3 Distance: saved, said, and safe before the migration')
  const { cardioReadback } = await import('../src/lib/cardio-effort')
  const { cardioLine } = await import('../src/lib/cardio-lines')
  const { formatCardioLogsForAI } = await import('../src/lib/daily-tracking')
  check('the line every screen shows says the distance', cardioReadback({ activity: 'Run', minutes: 40, rpe: 7, distanceKm: 6 }) === 'Run · 40 min · Hard · 6 km', cardioReadback({ activity: 'Run', minutes: 40, rpe: 7, distanceKm: 6 }))
  check('...and nothing when there is none', cardioReadback({ activity: 'Walk', minutes: 30, rpe: 3 }) === 'Walk · 30 min · Easy')
  check('a stored row\'s line reads its distance', cardioLine({ activity_name: 'Run', duration_minutes: 40, intensity_rpe: 7, distance_km: 5.25 }) === 'Run · 40 min · Hard · 5.25 km')
  const ai = formatCardioLogsForAI([{ user_id: 'u', date: '2026-10-20', activity_name: 'Run', duration_minutes: 40, intensity_rpe: 7, distance_km: 6 }])
  check('the coach\'s history line carries it', /Run for 40min at RPE 7, 6 km/.test(ai), ai)

  const { makeFakeSupabase } = await import('../.tour-harness/fake-supabase')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const db: Record<string, Record<string, unknown>[]> = { cardio_logs: [], workout_sessions: [] }
  const fake = makeFakeSupabase(db)
  // A DATABASE WITHOUT THE COLUMN: the fake refuses any cardio insert naming distance_km, as PostgREST does.
  let columnMissing = false
  const client = {
    ...fake,
    from: (name: string) => {
      const api = fake.from(name) as Record<string, unknown>
      const insert = api.insert as (rows: unknown) => unknown
      api.insert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        const list = Array.isArray(rows) ? rows : [rows]
        if (columnMissing && name === 'cardio_logs' && list.some(r => 'distance_km' in r)) {
          const refused = { data: null, error: { code: 'PGRST204', message: "Could not find the 'distance_km' column of 'cardio_logs' in the schema cache" } }
          const chain: Record<string, unknown> = { select: () => chain, single: () => chain, maybeSingle: () => chain, then: (res: (v: unknown) => unknown) => Promise.resolve(refused).then(res) }
          return chain
        }
        return insert(rows)
      }
      return api
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(client as any)
  const store = await import('../src/lib/cardio-log-store')
  store.saveCardioLog({ userId: 'u1', date: '2026-10-20', activityName: 'Run', durationMinutes: 40, intensityRpe: 7, distanceKm: 6 })
  await store.flushPending()
  check('a distance is saved on the row', db.cardio_logs.some(r => r.activity_name === 'Run' && r.distance_km === 6), db.cardio_logs)
  store.saveCardioLog({ userId: 'u1', date: '2026-10-20', activityName: 'Walk', durationMinutes: 30, intensityRpe: 3 })
  await store.flushPending()
  check('...and a session without one names no distance at all', db.cardio_logs.some(r => r.activity_name === 'Walk' && !('distance_km' in r)), db.cardio_logs)
  columnMissing = true
  store.saveCardioLog({ userId: 'u1', date: '2026-10-21', activityName: 'Ride', durationMinutes: 50, intensityRpe: 5, distanceKm: 20 })
  await store.flushPending()
  check('BEFORE THE MIGRATION: the session still saves, without the distance', db.cardio_logs.some(r => r.activity_name === 'Ride' && r.duration_minutes === 50 && !('distance_km' in r)), db.cardio_logs.filter(r => r.activity_name === 'Ride'))
  columnMissing = false
  store.saveCardioLog({ userId: 'u1', date: '2026-10-21', activityName: 'Swim', durationMinutes: 30, intensityRpe: 5, distanceKm: 900 })
  await store.flushPending()
  check('a distance that could not be true is dropped, the session kept', db.cardio_logs.some(r => r.activity_name === 'Swim' && !('distance_km' in r)), db.cardio_logs.filter(r => r.activity_name === 'Swim'))
  check('the database\'s own bound matches the app\'s', /distance_km > 0 AND distance_km <= 500/.test(readFileSync('supabase/migrations/20261022120000_add_distance_to_cardio_logs.sql', 'utf8')) && store.MAX_PLAUSIBLE_DISTANCE_KM === 500)

  console.log('\n§4 The coach\'s write')
  const ex = await import('../src/lib/pending-action-executor')
  const profile = { id: 'u2' } as never
  const payload = { date: '2026-10-20', dayName: 'Tuesday', activityName: 'Run', durationMinutes: 40, intensityRpe: 7, distanceKm: 6, countableFocus: 'Upper Body' }
  const extra = await ex.executeCardioLog(profile, payload, false)
  await store.flushPending()
  check('the default logs the run as extra: one row, and the day is not swapped', extra.counted === false && db.cardio_logs.filter(r => r.user_id === 'u2').length === 1 && !db.workout_sessions.some(r => r.profile_id === 'u2' && r.swapped_for_activity), { receipt: extra.receipt, sessions: db.workout_sessions })
  check('...its receipt line is the read-back, distance included', extra.receipt.landed[0] === 'Run: 40 min · Hard · 6 km', extra.receipt.landed)
  await ex.undoCardioLog('u2', payload)
  check('Undo takes the row back', db.cardio_logs.filter(r => r.user_id === 'u2').length === 0)
  const counted = await ex.executeCardioLog(profile, payload, true)
  await store.flushPending()
  check('her "count it as today\'s workout": the row AND the day swap, named for the run', counted.counted === true && db.workout_sessions.some(r => r.profile_id === 'u2' && r.swapped_for_activity === 'Run') && /counted as your workout instead of Upper Body/.test(counted.receipt.landed.join('|')), { sessions: db.workout_sessions, receipt: counted.receipt })
  await ex.undoCardioLog('u2', payload)
  check('...and Undo takes both back', db.cardio_logs.filter(r => r.user_id === 'u2').length === 0 && !db.workout_sessions.some(r => r.profile_id === 'u2' && r.swapped_for_activity), db.workout_sessions)
  await ex.executeCardioLog(profile, payload, false)
  await store.flushPending()
  // The day's ONE session row now says Football (a swap made some other way): this Undo must leave it.
  const dayRow = db.workout_sessions.find(r => r.profile_id === 'u2' && r.date === '2026-10-20')
  if (dayRow) dayRow.swapped_for_activity = 'Football'
  await ex.undoCardioLog('u2', payload)
  check('a swap some other card made is not this Undo\'s to clear', !!dayRow && db.workout_sessions.filter(r => r.profile_id === 'u2' && r.date === '2026-10-20').length === 1 && dayRow.swapped_for_activity === 'Football', db.workout_sessions)
  const noFocus = await ex.executeCardioLog(profile, { ...payload, date: '2026-10-19', countableFocus: null }, true)
  check('"count it" never swaps a day whose session was not due', noFocus.counted === false && !db.workout_sessions.some(r => r.profile_id === 'u2' && r.date === '2026-10-19'), noFocus)
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const builder = chat.slice(chat.indexOf('const buildCardioLogProposal'), chat.indexOf('const buildCircuitLogProposal'))
  check('the offer counts it only while the day\'s session is still due', /const countableFocus = session && session\.exercises\.length > 0 && dayState === 'due' \? session\.focus : null/.test(builder))
  check('...and the second button exists only then; "Log it" leads', /\.\.\.\(countableFocus\s*\?\s*\{ editable: \[\{ field: 'scope', options: \['extra', 'instead'\], labels: \{ extra: 'Log it'/.test(builder))
  const confirm = chat.slice(chat.indexOf("row.kind === 'propose_cardio_log'"), chat.indexOf("row.kind === 'propose_circuit_log'", chat.indexOf("row.kind === 'propose_cardio_log'")))
  check('Apply runs the one write with her choice', /executeCardioLog\(profile, payload, editedScope === 'instead'\)/.test(confirm))

  console.log('\n§5 The ease-off question')
  const { easeOffQuestion } = await import('../src/lib/cardio-ease-off')
  const now = new Date('2026-10-20T19:00:00')
  const knee = { kind: 'injury' as const, status: 'active', injury_code: 'knees', equipment_override: null, starts_at: '2026-10-08T00:00:00', expires_at: '2026-10-22T12:00:00' }
  const q = easeOffQuestion('Run', [knee], now)
  check('a hard run while the knees are eased off: one question, in her terms', q?.text === "How did your knees feel on the run? They're being eased off until 22 Oct.", q)
  check('...two answers, and "It hurt" hands the coach a message in her voice', q?.fine === 'Felt fine' && q.hurt === 'It hurt' && q.hurtMessage === 'My knees hurt on the run', q)
  check('a walk asks nothing (no impact)', easeOffQuestion('Walk', [knee], now) === null)
  check('a run with no ease-off asks nothing', easeOffQuestion('Run', [], now) === null)
  check('an ease-off that has ended asks nothing', easeOffQuestion('Run', [{ ...knee, expires_at: '2026-10-19T12:00:00' }], now) === null)
  check('a shoulder ease-off is not asked about after a run', easeOffQuestion('Run', [{ ...knee, injury_code: 'shoulders' }], now) === null)
  check('ankles and hips are, and a hike or skipping is', easeOffQuestion('Hike', [{ ...knee, injury_code: 'ankles' }], now)?.text === "How did your ankles feel on the hike? They're being eased off until 22 Oct."
    && /hips feel on the skipping/.test(easeOffQuestion('Skipping rope', [{ ...knee, injury_code: 'hips' }], now)?.text ?? ''))
  const both = easeOffQuestion('Football', [{ ...knee, injury_code: 'ankles', expires_at: '2026-10-30T12:00:00' }, knee], now)
  check('two running: ONE question, about the one ending soonest', /knees feel on that session/.test(both?.text ?? ''), both)
  check('the chat asks it after the log, saved before it is shown, never blocking the write', /if \(receipt\.landed\.length > 0\) \{\s*const q = easeOffQuestion\(payload\.activityName, activeAdaptations, getAppNow\(profile\.id\)\)\s*if \(q\) followUp = \{ text: q\.text, chips: \[q\.fine, q\.hurtMessage\] \}/.test(confirm)
    && /if \(followUp\) \{[\s\S]{0,400}from\('chat_messages'\)[\s\S]{0,200}\.insert\(/.test(chat))
  const row = strip(readFileSync('src/components/exercise/CardioSetRow.tsx', 'utf8'))
  check('the screen asks it after its save from the ease-offs running now', /getActiveAdaptations\(profileId\)[\s\S]{0,120}easeOffQuestion\(loggedName, rows, getAppNow\(profileId\)\)/.test(row))
  check('...and "It hurt" opens the chat with her message ready, never sent for her', /setChatPrefill\(question\.hurtMessage\)[\s\S]{0,80}tabHash\('chat'\)/.test(row))
  const auw = strip(readFileSync('src/components/exercise/AddUnplannedWork.tsx', 'utf8'))
  check('Add unplanned work keeps the question on screen after its panel closes', /onEaseOffQuestion=\{setEaseOff\}/.test(auw) && /if \(hideTrigger\) return easeOffAsk/.test(auw) && /\{easeOffAsk\}\s*<Button/.test(auw))

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('extra cardio: all checks passed')
}

main().catch(e => { console.error(e); process.exit(1) })
