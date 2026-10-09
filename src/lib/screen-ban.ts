// ---------------------------------------------------------------------------
// BANNING AN EXERCISE FROM THE SCREEN — asked first, and it can be taken back.
//
// 9 Oct 2026 (M10). "Ban exercise" on the ⋮ menu wrote a permanent preference
// and rewrote every week of the plan the instant it was tapped: no question,
// no word afterwards, no way back. Deleting ONE logged set asks first. The
// coach's ban has asked first since 14 Sep. The design has said what this
// should be since LAYOUT-DESIGN §4.3 was written:
//
//   "It becomes propose-and-confirm everywhere it exists: the ⋯ entry opens a
//    confirm card stating blast radius … and the receipt carries the durable
//    Undo — which reverses BOTH writes … or it is not offered … never a dead
//    Undo button."
//
// So this is that, built as drawn. The WORDS are the coach's card's own
// (`banConfirmLines` is called by both), because one change must not be
// described two ways depending on where it was asked for.
//
// Like screen-swap.ts, the write lives here rather than inline in App.tsx so
// the browser harness runs the function the app ships.
// ---------------------------------------------------------------------------
import type { MesocycleWeek, UserProfile } from './types'
import { banExerciseFromMesocycle } from './mesocycle-edit'
import { saveMesocycle } from './mesocycle-persistence'
import { createFact, deleteFactPermanently } from './memory-store'
import { couldNot } from './coach-voice'

export interface BanBlastRadius {
  /** Sessions across the WHOLE plan that hold it — that is what a ban means. */
  sessions: number
  weeks: number
  totalWeeks: number
}

export function banBlastRadius(mesocycle: MesocycleWeek[], exerciseName: string): BanBlastRadius {
  const wanted = exerciseName.toLowerCase()
  let sessions = 0
  const weeks = new Set<number>()
  for (const w of mesocycle) {
    for (const d of w.days) {
      if (d.exercises.some(e => e.name.toLowerCase() === wanted)) { sessions++; weeks.add(w.week_number) }
    }
  }
  return { sessions, weeks: weeks.size, totalWeeks: mesocycle.length }
}

/** What a ban will do, said before the tap. The coach's card and the screen's sheet both print these. */
export function banConfirmLines(radius: BanBlastRadius): { warn: string | null; info: string } {
  const { sessions } = radius
  if (sessions === 0) {
    return {
      warn: null,
      info: `It isn't on this plan anywhere, so nothing changes today — but it will never be chosen for you again, in this plan or the next one, and it won't be offered as a swap.`,
    }
  }
  return {
    warn: `This is every week of your plan, not just today — ${sessions} session${sessions === 1 ? '' : 's'} get${sessions === 1 ? 's' : ''} rebuilt. Each one gets the closest alternative your kit and injuries allow.`,
    info: `Where there's no good alternative, that slot comes out rather than being filled with something worse. It will never be chosen for you again, in this plan or the next.`,
  }
}

export interface BanOutcome {
  /** A sentence to show, or null when the ban is recorded and the plan saved. */
  error: string | null
  /** True once the preference itself is recorded — the ban is real even if the plan's rewrite failed. */
  banned: boolean
  /**
   * Takes the ban back: removes the preference AND puts the plan back as it
   * was. Null when there is nothing this function can fully reverse — the
   * design's rule is that an Undo which cannot do both halves is not offered.
   * Resolves to a sentence when the undo itself fails, null when it worked.
   */
  undo: (() => Promise<string | null>) | null
}

export async function banOnScreen(input: {
  profile: UserProfile
  mesocycle: MesocycleWeek[]
  exerciseName: string
  /** The live exclusion list, WITHOUT this exercise. */
  exclusions: string[]
  /** Preserved so the resave does not rewind live-week detection to week 1. */
  planCreatedAt?: string | null
  show: (mesocycle: MesocycleWeek[]) => void
  /** Re-read the memory the rest of the app compiles its exclusions from. */
  reloadMemory: () => Promise<void>
}): Promise<BanOutcome> {
  const { profile, mesocycle, exerciseName, exclusions, planCreatedAt, show, reloadMemory } = input
  if (!profile.id) return { error: null, banned: false, undo: null }
  const profileId = profile.id
  if (exclusions.includes(exerciseName)) return { error: null, banned: true, undo: null }

  let factId: string
  try {
    // An independent INSERT, never a read-modify-write of a shared array:
    // nothing to clobber and nothing to read fresh before appending.
    const fact = await createFact({
      profileId,
      kind: 'exercise_preference',
      source: 'manual',
      rawPhrase: exerciseName,
      displayText: `won't eat/do ${exerciseName}`,
      polarity: 'dislike',
      hardness: 'hard',
      resolvedRefs: [exerciseName],
    })
    factId = fact.id
    await reloadMemory()
  } catch (err) {
    console.error('Recording the ban failed:', err)
    return { error: `${couldNot('save that')} ${exerciseName} hasn't been removed — check your connection and try again.`, banned: false, undo: null }
  }

  /** Both halves, or the sentence saying which did not happen. */
  const undoWith = (planWasRewritten: boolean) => async (): Promise<string | null> => {
    try {
      await deleteFactPermanently(factId)
      await reloadMemory()
    } catch (err) {
      console.error('Undoing the ban failed:', err)
      return `${couldNot('undo that')} ${exerciseName} is still off your plan — try again in a moment.`
    }
    if (!planWasRewritten) return null
    show(mesocycle)
    try {
      await saveMesocycle(profileId, mesocycle, planCreatedAt ?? profile.created_at)
      return null
    } catch (err) {
      console.error('Restoring the plan after an undone ban failed:', err)
      return `${exerciseName} can be picked again, but your plan couldn't be put back just now — reopen the app to retry.`
    }
  }

  if (mesocycle.length === 0) return { error: null, banned: true, undo: undoWith(false) }

  const updated = await banExerciseFromMesocycle({
    mesocycle, profile, bannedName: exerciseName,
    exclusions: [...new Set([...exclusions, exerciseName])],
  })
  show(updated)
  try {
    await saveMesocycle(profileId, updated, planCreatedAt ?? profile.created_at)
  } catch (err) {
    // The preference row DID land, so the ban is real and survives — only
    // this plan's rewrite failed. Say exactly that, and put the screen back.
    console.error('Persisting ban failed:', err)
    show(mesocycle)
    return {
      error: `${exerciseName} won't be picked again, but this plan couldn't be updated — reopen the app to retry.`,
      banned: true,
      undo: undoWith(false),
    }
  }
  return { error: null, banned: true, undo: undoWith(true) }
}
