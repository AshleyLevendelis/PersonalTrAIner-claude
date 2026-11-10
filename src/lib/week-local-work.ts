// ---------------------------------------------------------------------------
// THE WEEK AS THIS PHONE KNOWS IT — a week read with the phone's own unsent work laid over it.
//
// Ashley, 10 Nov 2026, from a gym with no Wi-Fi: "it's not possible to log a workout without Internet. We should be
// able to do as much as possible in the app without network." Logging itself was local-first already; the WEEK was
// not. It read sets and sessions from the server alone and kept its last answer when a read failed, so a whole
// session trained offline showed "18 of 18 working sets" on the card over "✓ Done · 0 of 18 sets", "0 of 4
// sessions · 0/68 sets" and an empty strip: the app saying the workout had not happened while holding all of it.
//
// One function, used by the week hook on both outcomes of its read:
//   - the server answered: each day's rows are the server's with this phone's queued sets on top;
//   - the read failed: each day's rows are the phone's last full answer for that day (or what the screen already
//     held) with the queue on top.
// And a day this phone FINISHED counts as finished before the server has heard: the Finish tap is recorded on the
// phone first (active-session-store), with at least one working set, exactly the rule Finish itself applies.
//
// Display only. Nothing here writes, and nothing prescribes from it.
// ---------------------------------------------------------------------------
import { addDays } from './session-move'
import { partitionLogsByKind, type WeeklyDashboardDay } from './daily-tracking'
import { weekViewForDate } from './set-log-store'
import { getActiveSessionRecord } from './active-session-store'
import type { ExerciseSetLog, WorkoutSession } from './types'

export interface WeekLocalReaders {
  setsFor: (profileId: string, date: string, serverRows: ExerciseSetLog[] | null, fallbackRows: ExerciseSetLog[]) => ExerciseSetLog[]
  finishedAt: (profileId: string, date: string) => string | null
}

const DEVICE: WeekLocalReaders = {
  setsFor: weekViewForDate,
  finishedAt: (profileId, date) => {
    const record = getActiveSessionRecord(profileId, date)
    return record?.status === 'finished' ? (record.finishedAtIso ?? record.lastActivityIso ?? null) : null
  },
}

/**
 * `week` is the server's answer when `served`, else whatever the screen already held (possibly nothing). Returns one
 * day per date of the range either way, so a week first opened with no signal still shows what the phone holds.
 */
export function weekWithLocalWork(
  profileId: string,
  week: WeeklyDashboardDay[],
  from: string,
  to: string,
  served: boolean,
  readers: WeekLocalReaders = DEVICE,
): WeeklyDashboardDay[] {
  const byDate = new Map(week.map(d => [d.date, d]))
  const out: WeeklyDashboardDay[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day: WeeklyDashboardDay = byDate.get(date)
      ?? { date, metric: null, nutrition: null, session: null, exercises: [], workingLogs: [], warmupLogs: [], cardioLogs: [] }
    const held = [...day.workingLogs, ...day.warmupLogs]
    const rows = readers.setsFor(profileId, date, served ? held : null, held).map(r => ({ ...r, date }))
    const { workingLogs, warmupLogs } = partitionLogsByKind(rows, date)
    let session: WorkoutSession | null = day.session
    const finishedAt = readers.finishedAt(profileId, date)
    if (finishedAt && workingLogs.length > 0 && !session?.is_completed) {
      session = {
        ...(session ?? { profile_id: profileId, date, split_type: 'training', duration_minutes: 0 }),
        is_completed: true,
        finished_at: finishedAt,
      }
    }
    out.push({ ...day, session, workingLogs, warmupLogs })
  }
  return out
}
