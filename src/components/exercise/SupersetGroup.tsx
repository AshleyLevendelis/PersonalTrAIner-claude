import { ExerciseRow, type ExerciseRowProps } from './ExerciseRow'

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
  renderMember,
}: {
  label: string
  count: number
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
        <p className="text-[10px] text-muted-foreground italic">alternate — no rest between</p>
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
      renderMember={(i, memberLabel) => (
        <ExerciseRow key={i} {...members[i].props} supersetLabel={memberLabel} />
      )}
    />
  )
}
