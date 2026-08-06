import { ExerciseRow, type ExerciseRowProps } from './ExerciseRow'

// ---------------------------------------------------------------------------
// Fused superset rendering (LAYOUT-DESIGN.md §3.4) — a bracketed group with
// the shared "alternate — no rest between" line stated once, not repeated
// per member. Members come from session-derive's groupExercises, which
// preserves each one's original exIndex for swap/ban addressing.
// ---------------------------------------------------------------------------

export function SupersetGroup({
  label,
  members,
}: {
  label: string
  members: { props: Omit<ExerciseRowProps, 'supersetLabel'> }[]
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
        {members.map((m, i) => (
          <ExerciseRow key={i} {...m.props} supersetLabel={`${label}${i + 1}`} />
        ))}
        <p className="text-[10px] text-muted-foreground italic">alternate — no rest between</p>
      </div>
    </div>
  )
}
