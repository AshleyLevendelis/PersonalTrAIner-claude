// ---------------------------------------------------------------------------
// WHAT FEELS TIGHT TODAY, FOR THE COACH (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (a) 9).
//
// Before a session he can tap what feels tight, and up to three mobility drills go in at the front of TODAY's warm-up
// (tightness.ts, 15 Sep 2026). The coach was told none of it, so "why is there a hip drill in my warm-up?" was
// answered blind. This block is built from the SAME result the Exercise screen draws (tightnessWarmup, called with the
// same areas, injuries, warm-up and pregnancy), so the coach names the drills the screen shows and nothing else, and
// says the screen's own "couldn't" when an area got nothing.
//
// Tightness is not pain: the block says so, so a "my hip is tight" answer is never treated as an injury, and pain still
// goes through the app's own three questions (edit-reason.ts).
//
// Pure: today's areas and the warm-up result in, one block out ('' when nothing was said today).
// ---------------------------------------------------------------------------
import { areaLabel, uncoveredNote, type TightnessWarmup } from './tightness'

function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function buildCoachTightness(areas: readonly string[], warmup: Pick<TightnessWarmup, 'items' | 'noDrill' | 'notThisTime' | 'alreadyCovered'>): string {
  if (areas.length === 0) return ''
  const lines: string[] = [`- Said feels tight: ${listOf(areas.map(areaLabel))}.`]
  if (warmup.items.length > 0) lines.push(`- Added to the start of today's warm-up for it: ${listOf(warmup.items.map(i => i.name))}.`)
  if (warmup.alreadyCovered.length > 0) lines.push(`- Already prepared by today's own warm-up: ${listOf(warmup.alreadyCovered.map(areaLabel))}.`)
  const couldNot = uncoveredNote(warmup)
  if (couldNot) lines.push(`- What the screen told them it could not add: ${couldNot}`)
  return 'WHAT FEELS TIGHT TODAY (their answer before today\'s session; today only, nothing else in the plan changed). '
    + 'Tightness is not pain: if they say it hurts, ask the app\'s pain questions before changing anything:\n'
    + lines.join('\n')
}
