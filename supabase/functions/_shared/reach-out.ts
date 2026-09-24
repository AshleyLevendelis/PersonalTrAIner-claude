// ---------------------------------------------------------------------------
// THE COACH REACHING SOMEONE WHOSE APP IS SHUT — the run, with every edge of
// the world handed in.
//
// Slice 3 of docs/plans/the-coach-can-reach-you.md. Ashley's ruling, 17 Sep
// 2026: all seven proactive moments, each switchable, all on to begin with.
// Built 24 Sep 2026 on her "implement all the chat fixes".
//
// WHY EVERYTHING IS INJECTED. This runs hourly on a server, against a database
// and a push service, and its first real run is on her phone. CLAUDE.md: "a
// script whose first real run costs something gets a mocked end-to-end gate
// BEFORE it runs, not after". So the loop here takes its clock, its reads, its
// writes and its sender as arguments; the edge function wires the real ones,
// and test:reach-out drives this exact code with fakes.
//
// WHERE THE FACTS COME FROM — the design decision that kept this small. Which
// days are training days is the whole plan engine, which lives only in src/.
// So the APP, whenever it is open, sends ahead the few plan-shaped facts: the
// weekday pattern it trains on (the same one the streak counts by), when the
// plan and the current block end, and the streak Home just counted. Everything
// else is read live from the database: what was logged, her own marks and
// moves, a finished session nobody has rated, and an unanswered offer.
// ---------------------------------------------------------------------------

import { momentToRaise, type MomentFacts, type MomentKey, type MomentSwitches } from './coach-moments.ts'

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  /** The person's IANA timezone, recorded by the phone when it subscribed. */
  timezone: string
}

/** The row the app sends ahead. Every field optional: a stale or partial row must not crash a run. */
export interface MomentFactsRow {
  /** Weekday names the plan trains on — "Monday", … — the pattern the streak itself counts by. */
  training_weekdays?: string[] | null
  /** The day after the plan's last week. Nothing is "planned" from here on. */
  plan_ends_on?: string | null
  /** The day after the current block's last week, as the app last saw it. */
  block_ends_on?: string | null
  streak_days?: number | null
  /** The local date the streak was counted on. A streak not counted since before yesterday is not trusted. */
  streak_as_of?: string | null
  updated_at?: string | null
}

/** What a day's session row says happened, when she said anything. */
export interface DayMarks {
  rest?: boolean
  movedAway?: boolean
  swapped?: boolean
  missed?: boolean
}

export interface LiveFacts {
  /** Local dates, most recent first, on which anything at all was logged — sets or cardio. */
  activityDates: string[]
  /** Her own marks on recent days' sessions, by date. */
  marks: Record<string, DayMarks>
  /** Dates a session was moved ONTO — a training day the weekday pattern does not show. */
  movedInto: string[]
  /** A session finished in the last 36 hours that nobody has said how it felt. */
  unratedRecentSession: boolean
  /** An open "you're beating the weights" offer, not yet answered or expired. */
  beatTargetOffered: boolean
}

export interface SentRecord { moment: MomentKey; sent_on: string }

export interface ReachOutDeps {
  now: Date
  listSubscriptions(): Promise<PushSubscriptionRow[]>
  loadFactsRow(userId: string): Promise<MomentFactsRow | null>
  loadSwitches(userId: string): Promise<MomentSwitches>
  loadLive(userId: string, localToday: string, timezone: string): Promise<LiveFacts>
  /** The last few notifications this person was sent, newest first. */
  loadRecentSends(userId: string): Promise<SentRecord[]>
  /** 'gone' means the phone unsubscribed; the row should be dropped. */
  send(sub: PushSubscriptionRow, payload: { title: string; body: string; moment: MomentKey }): Promise<'ok' | 'gone' | 'failed'>
  recordSent(userId: string, localDate: string, moment: MomentKey): Promise<void>
  dropSubscription(id: string): Promise<void>
}

export interface ReachOutReport {
  people: number
  sent: number
  quiet: number
  alreadyToday: number
  failed: number
  dropped: number
}

/** A local calendar date and hour in a timezone — never the server's. Falls back to UTC on an unknown zone. */
export function localParts(now: Date, timezone: string): { date: string; hour: number } {
  const fmt = (tz: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  let parts: Intl.DateTimeFormatPart[]
  try { parts = fmt(timezone) } catch { parts = fmt('UTC') }
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 }
}

/** Whole days from `a` to `b`, both YYYY-MM-DD. Calendar arithmetic in UTC, so no DST step can shave a day. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** The weekday of a local YYYY-MM-DD, read at noon UTC so no timezone can move it. */
export function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]
}

/**
 * IS THIS A TRAINING DAY, AS SHE LEFT IT? The plan's weekday pattern — the one
 * the streak counts by — then her own changes on top, read live: a day made a
 * rest day, moved away or swapped for something else is not owed; a day a
 * session was moved ONTO is. Without the second half a moved session would be
 * nagged about on the day it left, which is the worst notification there is:
 * one about something she already dealt with.
 */
export function isPlanned(date: string, row: MomentFactsRow | null, live: LiveFacts): boolean {
  if (live.movedInto.includes(date)) return true
  if (row?.plan_ends_on && date >= row.plan_ends_on) return false
  const pattern = new Set(row?.training_weekdays ?? [])
  if (!pattern.has(weekdayOf(date))) return false
  const m = live.marks[date]
  return !(m?.rest || m?.movedAway || m?.swapped)
}

/**
 * THE FACTS FOR ONE PERSON, TODAY, ON THEIR CLOCK. Pure — the gate calls it
 * directly as well as through the run.
 *
 * Each fact that could otherwise repeat for ever is bounded, because a
 * notification about a stale fact is a nag about nothing: an unrated session
 * counts for 36 hours (bounded by the read), a block's end for three days, and
 * a streak only if Home counted it yesterday or today.
 */
export function factsFor(row: MomentFactsRow | null, live: LiveFacts, localToday: string, localHour: number): MomentFacts {
  const yesterday = addDays(localToday, -1)
  const logged = new Set(live.activityDates)
  const lastLog = live.activityDates[0] ?? null
  const streakFresh = !!row?.streak_as_of && daysBetween(row.streak_as_of, localToday) <= 1
  const blockEnd = row?.block_ends_on ?? null
  return {
    localHour,
    awaitingFeel: live.unratedRecentSession,
    plannedToday: isPlanned(localToday, row, live),
    loggedToday: logged.has(localToday),
    // SHE ALREADY SAID SO counts as accounted for: the in-app coach stops
    // asking about a miss once it is declared, and the phone does the same.
    missedYesterday: isPlanned(yesterday, row, live) && !logged.has(yesterday) && !live.marks[yesterday]?.missed,
    daysSinceAnyLog: lastLog ? daysBetween(lastLog, localToday) : null,
    streakDays: streakFresh ? Math.max(0, row?.streak_days ?? 0) : 0,
    blockJustEnded: !!blockEnd && daysBetween(blockEnd, localToday) >= 0 && daysBetween(blockEnd, localToday) <= 3,
    beatTargetPending: live.beatTargetOffered,
  }
}

/**
 * HOW OFTEN, and these are MY defaults rather than her ruling — how often the
 * app speaks is Ashley's, and these are the conservative reading until she
 * rules (docs/plans/the-coach-can-reach-you.md). At most ONE notification a
 * day, whatever is live; and never the SAME moment two days running, so an
 * unanswered "you missed yesterday" does not become a daily chant.
 */
export function mayNotify(recent: SentRecord[], localToday: string, moment: MomentKey): 'ok' | 'already_today' | 'same_as_yesterday' {
  if (recent.some(r => r.sent_on === localToday)) return 'already_today'
  const yesterday = addDays(localToday, -1)
  if (recent.some(r => r.sent_on === yesterday && r.moment === moment)) return 'same_as_yesterday'
  return 'ok'
}

export async function runReachOut(deps: ReachOutDeps): Promise<ReachOutReport> {
  const report: ReachOutReport = { people: 0, sent: 0, quiet: 0, alreadyToday: 0, failed: 0, dropped: 0 }
  const subs = await deps.listSubscriptions()
  const byUser = new Map<string, PushSubscriptionRow[]>()
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

  for (const [userId, devices] of byUser) {
    report.people++
    // ONE PERSON'S FAILURE IS NOT EVERYONE'S. A bad row or a read that throws
    // skips this person for this hour, and the next hour tries again.
    try {
      // The first device's timezone speaks for the person. Two phones in two
      // zones is rare enough that the gap is named rather than engineered.
      const { date: today, hour } = localParts(deps.now, devices[0].timezone)
      const recent = await deps.loadRecentSends(userId)
      if (recent.some(r => r.sent_on === today)) { report.alreadyToday++; continue }

      const [row, switches, live] = await Promise.all([
        deps.loadFactsRow(userId), deps.loadSwitches(userId), deps.loadLive(userId, today, devices[0].timezone),
      ])
      const moment = momentToRaise(factsFor(row, live, today, hour), switches)
      if (!moment || mayNotify(recent, today, moment.key) !== 'ok') { report.quiet++; continue }

      let delivered = false
      for (const device of devices) {
        const outcome = await deps.send(device, { title: 'Your coach', body: moment.text, moment: moment.key })
        if (outcome === 'ok') delivered = true
        else if (outcome === 'gone') { await deps.dropSubscription(device.id); report.dropped++ }
        else report.failed++
      }
      // RECORDED ONLY WHEN SOMETHING ARRIVED. A send that failed everywhere
      // is tried again next hour rather than counted as said.
      if (delivered) { await deps.recordSent(userId, today, moment.key); report.sent++ }
    } catch (err) {
      console.error('[reach-out] skipped one person this hour:', err)
      report.failed++
    }
  }
  return report
}
