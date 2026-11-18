// ---------------------------------------------------------------------------
// HOW THE SESSION FELT — capture, and what it is allowed to trigger.
//
// From Ashley's research document ("The Coach's Decision Stack"), assessed
// 2 Sep 2026. Its strongest adherence finding: affect DURING exercise
// predicts whether someone returns, more reliably than any programming
// variable. The app had no way to capture it. Attendance and load, the two
// signals it does read, both move only after a person has already started
// leaving — by the time block-consistency.ts sees a missed session, the thing
// worth catching has happened.
//
// ASHLEY'S RULING ON THE SHAPE, 2 Sep 2026. Asked whether this should be a
// one-tap control on the session summary dialog, she chose the coach asking
// in CHAT instead: "the app is centered around the chat." So this module has
// no UI. It answers two questions for the coach's brief — is there a session
// worth asking about, and do the recent answers warrant offering to back off
// — and it owns the write.
//
// WHAT IT IS NOT ALLOWED TO DO. Nothing here changes a plan. A run of rough
// sessions makes the coach OFFER, through the propose_volume_change tool that
// already exists and already routes through an explicit confirm. That is the
// same posture as beat-target-offer.ts (detect across recent sessions, offer,
// never act alone) and it is deliberate: a plan that quietly shrinks because
// of one tap given in a bad mood is worse than one that asks.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'
import { getLocalDateString } from './dev-clock'
import { FEEL_SCALE, type SessionFeel } from './types'
import { isMissingColumnError } from './missing-column'

export interface AnsweredSession {
  date: string
  felt: SessionFeel
  note?: string | null
  /** The 1-10 effort he tapped on the summary, when he did. */
  effort?: number | null
}

// ---------------------------------------------------------------------------
// HOW HARD THE SESSION WAS, 1 TO 10 (his ruling 18 Nov 2026, "Build the 1–10", over the three words and over a dial):
// one tap on the session summary. It is the coaching standard "session effort" score, which times the minutes is the
// session's training load.
// MINE (CSCS), how it feeds the chat's back-off rule, which reads the four feel words: 1-3 'easy', 4-8 'good', 9-10
// 'hard'. 7-8 is what a well-built loading session SHOULD feel like (Foster's scale: "very hard"), so it is not a
// warning; only 9-10, maximal, counts towards "three hard sessions running, offer to ease off". It is never 'rough':
// that word is how a session felt in himself, which an effort number cannot say.
// ---------------------------------------------------------------------------
export const EFFORT_MIN = 1
export const EFFORT_MAX = 10

/** The words under a score: 1-3 Easy, 4-6 Moderate, 7-8 Hard, 9-10 All-out. */
export function effortWord(n: number): string {
  return n <= 3 ? 'Easy' : n <= 6 ? 'Moderate' : n <= 8 ? 'Hard' : 'All-out'
}

/** The feel word the chat's back-off rule reads, from a 1-10 score. */
export function effortToFelt(n: number): SessionFeel {
  return n <= 3 ? 'easy' : n <= 8 ? 'good' : 'hard'
}

/** A whole number from 1 to 10, or null. */
export function validEffort(n: unknown): number | null {
  return typeof n === 'number' && Number.isInteger(n) && n >= EFFORT_MIN && n <= EFFORT_MAX ? n : null
}

export interface SessionAwaitingFeel {
  date: string
  /** The day's name as the plan called it ('Push & Press'), when the row carries one. */
  day?: string | null
}

/**
 * How far back the coach will ask. Someone who trained on Monday and opens
 * the app on Friday does not remember Monday well enough for the answer to
 * mean anything, and being asked about it reads as the app not knowing what
 * day it is. Three days is a judgement, not a measured threshold — it is
 * stated here so it is one line to change.
 */
export const ASK_WITHIN_DAYS = 3

/**
 * How many answered sessions the back-off rule looks at.
 */
export const FEEL_RUN_WINDOW = 3

export interface FeelRun {
  /** The answers considered, most recent first. */
  recent: SessionFeel[]
  /** The 1-10 effort for the same sessions, null where none was tapped. */
  efforts?: (number | null)[]
  /**
   * True when the recent run is bad enough that the coach should raise it and
   * offer to reduce the dose.
   *
   * THE RULE, and it is mine rather than the document's: two or more of the
   * last three answered sessions came back 'rough', OR all three were 'hard'
   * or worse. The document says repeated misses should reduce the dose and
   * that affect predicts return; it does not name a threshold, because no
   * study has one. Two roughs is deliberately not one — a single awful
   * session is a bad day, and an app that reacts to every bad day teaches
   * people not to answer honestly.
   */
  needsBackoff: boolean
}

const atLeast = (f: SessionFeel, floor: SessionFeel): boolean =>
  FEEL_SCALE.indexOf(f) >= FEEL_SCALE.indexOf(floor)

/** Pure — the whole back-off decision, so it can be gated without a database. */
export function feelRun(answers: AnsweredSession[]): FeelRun {
  const recent = answers.slice(0, FEEL_RUN_WINDOW).map(a => a.felt)
  const efforts = answers.slice(0, FEEL_RUN_WINDOW).map(a => a.effort ?? null)
  if (recent.length < FEEL_RUN_WINDOW) return { recent, efforts, needsBackoff: false }
  const roughs = recent.filter(f => f === 'rough').length
  const allHardOrWorse = recent.every(f => atLeast(f, 'hard'))
  return { recent, efforts, needsBackoff: roughs >= 2 || allHardOrWorse }
}

/**
 * The line the coach is given. Empty string when there is nothing to say —
 * which is what stops the question being asked twice: once `felt` is written,
 * the session stops being "awaiting" and this line disappears from the brief.
 *
 * Deliberately phrased as a fact plus a permission, not as a script. The
 * prompt rules say when to ask; the wording is the coach's, in its own
 * persona, the way every other brief in chat-plan-context.ts works.
 */
export function buildFeelBrief(
  awaiting: SessionAwaitingFeel | null,
  run: FeelRun,
): string {
  const parts: string[] = []
  if (awaiting) {
    const which = awaiting.day ? `their ${awaiting.day} session` : 'their last session'
    parts.push(
      `UNREVIEWED SESSION: ${which} on ${awaiting.date} is finished and they have not been asked how it felt. `
      + `Ask once, conversationally, and call record_session_feel with their answer. `
      + `If they ignore the question or change the subject, drop it — do not ask again.`,
    )
  }
  if (run.needsBackoff) {
    parts.push(
      `HOW RECENT SESSIONS FELT: ${run.recent.join(', ')} (most recent first). `
      + `That is a run worth naming out loud. Offer to reduce the volume using propose_volume_change — `
      + `an offer, not a change: it does nothing until they confirm.`,
    )
  } else if (run.recent.length > 0) {
    parts.push(`HOW RECENT SESSIONS FELT: ${run.recent.join(', ')} (most recent first).`)
  }
  // The 1-10 he tapped on the summary, beside the words, so the coach can quote the number he gave and never invent one.
  if ((run.efforts ?? []).some(e => e != null)) {
    parts.push(`SESSION EFFORT HE RATED (1-10, most recent first): ${(run.efforts ?? []).map(e => e ?? 'not rated').join(', ')}. 7-8 is a normal hard training day; 9-10 is maximal.`)
  }
  return parts.join('\n')
}

// --- I/O -------------------------------------------------------------------

/**
 * Writes the answer onto an EXISTING session row. Never inserts: a row is
 * created when the session is resolved (ensureSessionSynced), so nothing to
 * update means nothing was trained that day, and manufacturing a session to
 * hang a feeling on would invent a workout.
 *
 * Returns whether the write landed, for the same reason setDeliberateRest
 * does: a coach that says "noted" on a false has repeated the lie that whole
 * path exists to stop.
 */
export async function recordSessionFeel(
  profileId: string,
  date: string,
  felt: SessionFeel,
  note?: string | null,
): Promise<boolean> {
  const { data: existing, error: readErr } = await supabase
    .from('workout_sessions')
    .select('id')
    .eq('profile_id', profileId)
    .eq('date', date)
    .maybeSingle()
  if (readErr) {
    console.error('recordSessionFeel: reading the day failed', readErr)
    return false
  }
  if (!existing?.id) {
    console.error('recordSessionFeel: no session on', date, '— refusing to invent one')
    return false
  }
  const { error } = await supabase
    .from('workout_sessions')
    .update({ felt, felt_note: note ?? null, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) console.error('recordSessionFeel: update failed', error)
  return !error
}

/**
 * Saves the 1-10 onto the day's EXISTING session row, with its feel word, so the chat stops asking how it felt.
 * Before the effort column exists on a database, the feel word alone is saved and the call still says yes: the
 * chat stops asking either way, and only the number waits for the migration.
 */
export async function recordSessionEffort(profileId: string, date: string, effort: number): Promise<boolean> {
  const n = validEffort(effort)
  if (n == null) return false
  const { data: existing, error: readErr } = await supabase
    .from('workout_sessions').select('id').eq('profile_id', profileId).eq('date', date).maybeSingle()
  if (readErr || !existing?.id) {
    console.error('recordSessionEffort: no session row on', date, readErr ?? '')
    return false
  }
  const payload: Record<string, unknown> = { effort: n, felt: effortToFelt(n), updated_at: new Date().toISOString() }
  let { error } = await supabase.from('workout_sessions').update(payload).eq('id', existing.id)
  if (error && isMissingColumnError(error, 'effort')) {
    delete payload.effort
    ;({ error } = await supabase.from('workout_sessions').update(payload).eq('id', existing.id))
  }
  if (error) console.error('recordSessionEffort: update failed', error)
  return !error
}

/** The 1-10 already saved for a day, or null (none, no row, no column yet, or a failed read). */
export async function readSessionEffort(profileId: string, date: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('workout_sessions').select('*').eq('profile_id', profileId).eq('date', date).maybeSingle()
  if (error || !data) return null
  return validEffort((data as { effort?: unknown }).effort)
}

export interface FeelContext {
  awaiting: SessionAwaitingFeel | null
  run: FeelRun
}

/**
 * Everything the coach's brief needs, in one round trip per question.
 * `todayDate` is passed in rather than read here so the caller's app-clock
 * (getAppNow) stays the single source of "now" — the UTC-vs-local date bug
 * this codebase already fixed once came from a second one.
 */
export async function loadFeelContext(profileId: string, todayDate: string): Promise<FeelContext> {
  const earliest = new Date(`${todayDate}T00:00:00`)
  earliest.setDate(earliest.getDate() - ASK_WITHIN_DAYS)
  // getLocalDateString, NOT toISOString().slice(0, 10) — which is what this
  // shipped with, three lines under a comment warning about exactly it.
  // `earliest` is a LOCAL midnight; slicing its UTC form moves it back a day
  // for every trainee east of UTC, so ASK_WITHIN_DAYS silently became four
  // days there and the coach asked about a session too old to remember
  // honestly. Caught by test:local-dates §3 on 3 Sep 2026, after it had
  // already merged.
  const earliestDate = getLocalDateString(earliest)

  const [awaitingRes, answeredRes] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('id, date, day')
      .eq('profile_id', profileId)
      .eq('is_completed', true)
      .is('felt', null)
      .gte('date', earliestDate)
      .lte('date', todayDate)
      .order('date', { ascending: false })
      .limit(ASK_WITHIN_DAYS + 1),
    supabase
      .from('workout_sessions')
      .select('*')
      .eq('profile_id', profileId)
      .not('felt', 'is', null)
      .order('date', { ascending: false })
      .limit(FEEL_RUN_WINDOW),
  ])

  if (awaitingRes.error) console.error('loadFeelContext: awaiting query failed', awaitingRes.error)
  if (answeredRes.error) console.error('loadFeelContext: answered query failed', answeredRes.error)

  // A FINISHED SESSION IS ONE WITH WORK IN IT (1 Nov 2026). The strip calls a day done only with working
  // sets; this asked "how did Friday feel?" about any completed row, so a row whose sets were removed (or a
  // legacy one with none) was "missed" on Home and "how did it feel?" in chat, the coach claiming a session
  // the app says did not happen. Only a row with at least one working set is asked about; a failed read
  // asks about nothing rather than risk the claim.
  const candidates = (awaitingRes.data ?? []) as Array<{ id: string; date: string; day: string | null }>
  let awaitingRow: { date: string; day: string | null } | undefined
  if (candidates.length > 0) {
    const { data: worked, error: workedErr } = await supabase
      .from('exercise_set_logs')
      .select('session_id')
      .in('session_id', candidates.map(c => c.id))
      .eq('is_warmup', false)
    if (workedErr) console.error('loadFeelContext: working-set check failed', workedErr)
    const withWork = new Set((workedErr ? [] : worked ?? []).map(r => (r as { session_id: string }).session_id))
    awaitingRow = candidates.find(c => withWork.has(c.id))
  }
  const answered: AnsweredSession[] = (answeredRes.data ?? []).map(r => ({
    date: r.date as string,
    felt: r.felt as SessionFeel,
    note: r.felt_note as string | null,
    effort: validEffort((r as { effort?: unknown }).effort),
  }))

  return {
    awaiting: awaitingRow ? { date: awaitingRow.date as string, day: awaitingRow.day as string | null } : null,
    run: feelRun(answered),
  }
}
