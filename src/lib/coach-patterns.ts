// ---------------------------------------------------------------------------
// PATTERNS THE APP SEES IN HIS LOGS (17 Nov 2026, the chat review, his "Build it all": "notice a stuck weight, low
// protein three days running, tiredness building up"). The APP finds them, from the logs it already reads; the coach is
// told them as facts and coaches to at most one, once, when it fits. Nothing here is a diagnosis.
//
// The thresholds are mine (CSCS), recorded in BACKLOG with the basis:
//   - A STUCK LIFT: the last three sessions of a lift at the same top working weight with no rep gained. Three
//     exposures with no progress by either lever (load or reps) is the standard double-progression stall; one or two
//     is noise (sleep, a bad day).
//   - LOW PROTEIN: the last three days he logged food (today excluded, it is not over), each under 80% of his protein
//     target. Three days, not one, so a single off day is never a pattern; 80% so a near miss is not one either; only
//     logged days, so a day he did not log is never read as a day he did not eat.
//   - TIREDNESS BUILDING: "Too hard" on a lift's effort question three or more times in the last seven days. The app's
//     own question, so the signal is his answer, not a guess from his numbers.
// ---------------------------------------------------------------------------

import { effortFromRpe } from './lift-effort'

export interface PatternSet { exercise_name: string; date: string; weight_kg: number | null; reps_completed: number | null; is_warmup?: boolean; unit?: string }
export interface EatenProteinDay { protein: number; meals: number }

/** A lift whose last three sessions held the same top weight with no rep gained. */
export function stuckLifts(sets: readonly PatternSet[], minSessions = 3): { name: string; weightKg: number; reps: number; sessions: number }[] {
  const top = new Map<string, Map<string, { w: number; r: number }>>()
  for (const s of sets) {
    if (s.is_warmup || !(Number(s.weight_kg) > 0) || !(Number(s.reps_completed) > 0) || (s.unit && s.unit !== 'reps')) continue
    const byDate = top.get(s.exercise_name) ?? new Map<string, { w: number; r: number }>()
    const cur = byDate.get(s.date)
    const w = Number(s.weight_kg), r = Number(s.reps_completed)
    if (!cur || w > cur.w || (w === cur.w && r > cur.r)) byDate.set(s.date, { w, r })
    top.set(s.exercise_name, byDate)
  }
  const out: { name: string; weightKg: number; reps: number; sessions: number }[] = []
  for (const [name, byDate] of top) {
    const sessions = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-minSessions).map(e => e[1])
    if (sessions.length < minSessions) continue
    const sameWeight = sessions.every(x => x.w === sessions[0].w)
    const noRepGained = sessions[sessions.length - 1].r <= sessions[0].r
    if (sameWeight && noRepGained) out.push({ name, weightKg: sessions[0].w, reps: sessions[sessions.length - 1].r, sessions: sessions.length })
  }
  return out
}

/** The last three days he logged food, before today, each under 80% of his protein target; null when not so. */
export function lowProtein(byDate: Record<string, EatenProteinDay> | null, today: string, targetG: number): { days: number; avgG: number } | null {
  if (!byDate || !(targetG > 0)) return null
  const logged = Object.entries(byDate).filter(([d, v]) => d < today && v && v.meals > 0).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3)
  if (logged.length < 3) return null
  if (!logged.every(([, v]) => v.protein < targetG * 0.8)) return null
  return { days: 3, avgG: Math.round(logged.reduce((a, [, v]) => a + v.protein, 0) / 3) }
}

/**
 * "Too hard" on a lift's effort question three or more times in the seven days to today. The answer is kept as the
 * effort on the lift's last working set (lift-effort.ts), so it is read back the same way: one lift on one day counts
 * once, however many of its sets carry it.
 */
export function tirednessBuilding(sets: readonly (PatternSet & { rpe?: number | null })[], today: string): number | null {
  const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - 6)
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hard = new Set(sets.filter(s => !s.is_warmup && s.date >= from && s.date <= today && effortFromRpe(s.rpe) === 'hard').map(s => `${s.exercise_name}|${s.date}`))
  return hard.size >= 3 ? hard.size : null
}

/** The lines the coach is given, plain facts, at most one of each kind. */
export function coachPatternLines(input: { stuck: ReturnType<typeof stuckLifts>; protein: ReturnType<typeof lowProtein>; proteinTargetG: number; tooHard: number | null }): string[] {
  const lines: string[] = []
  const s = input.stuck[0]
  if (s) lines.push(`- ${s.name} has been ${s.weightKg} kg for ${s.reps} reps or fewer for ${s.sessions} sessions running (no rep gained).`)
  if (input.protein) lines.push(`- Protein has been under 80% of the ${Math.round(input.proteinTargetG)} g target on the last ${input.protein.days} days he logged food (about ${input.protein.avgG} g a day).`)
  if (input.tooHard != null) lines.push(`- He has answered "Too hard" on ${input.tooHard} lifts in the last 7 days.`)
  return lines
}
