import { ExerciseRow, type ExerciseRowProps } from './ExerciseRow'
import { supersetAlternation } from '@/lib/coach-voice'
import { formatRampSets } from '@/lib/session-derive'
import type { Exercise } from '@/lib/types'

// ---------------------------------------------------------------------------
// Fused superset rendering (LAYOUT-DESIGN.md §3.4) — a bracketed group with
// the shared "alternate — no rest between" line stated once, not repeated
// per member. Members come from session-derive's groupExercises, which
// preserves each one's original exIndex for swap/ban addressing.
// ---------------------------------------------------------------------------

/**
 * The superset CHROME — rail, numbering, and the alternate line — with no
 * opinion about what a row is.
 *
 * Extracted because the peek had drifted, exactly the way the collapsed row
 * once had. PeekPanel's header comment already promised the two surfaces
 * "cannot drift apart again" because ExerciseLine is shared; that was true of
 * the ROW and false of everything around it. A peeked day rendered its
 * superset members as two plain rows both badged "A", with no rail and —
 * the part that actually matters — WITHOUT "alternate — no rest between".
 * That line is not decoration, it is the instruction for how to train the
 * pair, and Friday's plan simply did not carry it.
 *
 * Found by scripts/render-screens.tsx on its first run, which is what that
 * harness is for: no assertion about kilograms can notice a missing sentence.
 *
 * Takes a render function rather than rows, because the two callers cannot
 * share a row TYPE — today's ExerciseRow knows about logged sets and the live
 * session; the peek's deliberately cannot (see PeekPanel's read-only
 * guarantee). Only the numbering is handed back, so "A1"/"A2" has one
 * definition instead of two.
 */
export function SupersetShell({
  label,
  count,
  ramped = [],
  renderMember,
}: {
  label: string
  count: number
  /**
   * The member labels whose exercise carries a build-up — "A1", or both.
   *
   * Passed IN rather than derived here, because this shell deliberately has
   * "no opinion about what a row is" (see above) and the two callers hold
   * different row types. Both read the same `formatRampSets`, so the two
   * surfaces cannot disagree about whether a pair ramps.
   */
  ramped?: string[]
  /** Called per member with its 1-based superset label ("A1", "A2"). */
  renderMember: (index: number, memberLabel: string) => React.ReactNode
}) {
  // Flattened (LAYOUT-DESIGN.md §1.6, "never nested cards") — no outer card
  // here. Density pass 3b: the grouping cue is a glowing mint rail rather
  // than a muted 2px border, so the group reads as one unit by light instead
  // of by line. Rendered as a positioned span (not border-l) so the glow can
  // spill sideways without being clipped to the rail's own width.
  return (
    <div className="relative pl-3.5">
      <span
        aria-hidden
        className="absolute left-0 top-1 bottom-6 w-[3px] rounded-full bg-primary glow-mint-box"
      />
      <div className="space-y-2">
        {Array.from({ length: count }, (_, i) => renderMember(i, `${label}${i + 1}`))}
        {/* THE INSTRUCTION FOR THE PAIR, from the phrasebook so both surfaces
            and the coach exam read one sentence. Its second clause appears
            only when a member ramps — see supersetAlternation for why an
            unconditional "alternate" is wrong advice on a pair that has a
            build-up in it. */}
        <p className="text-[0.625rem] text-muted-foreground italic" data-testid="superset-alternation">
          {supersetAlternation(ramped)}
        </p>
      </div>
    </div>
  )
}

export function SupersetGroup({
  label,
  members,
}: {
  label: string
  members: { props: Omit<ExerciseRowProps, 'supersetLabel'> }[]
}) {
  return (
    <SupersetShell
      label={label}
      count={members.length}
      ramped={rampedMemberLabels(label, members.map(m => (m.props as { ex: Exercise }).ex))}
      renderMember={(i, memberLabel) => (
        <ExerciseRow key={i} {...members[i].props} supersetLabel={memberLabel} />
      )}
    />
  )
}

/**
 * Which members of a pair carry a build-up, by their A1/A2 label.
 *
 * Exported so the read-only surfaces answer it with the same function rather
 * than their own copy — the drift this file's header was written about, one
 * sentence further down the card. A 'stale' ramp names an exercise the slot
 * no longer holds, so it prescribes nothing and must not produce the clause.
 */
export function rampedMemberLabels(label: string, exercises: Exercise[]): string[] {
  return exercises
    .map((ex, i) => {
      const ramp = formatRampSets(ex)
      return ramp && ramp.kind !== 'stale' && ramp.sets.length > 0 ? `${label}${i + 1}` : null
    })
    .filter((x): x is string => x !== null)
}
