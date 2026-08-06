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
  // here; each member is already its own bordered row (ExerciseRow.tsx). The
  // left accent border is the only grouping cue, plus the shared caption.
  return (
    <div className="space-y-2 border-l-2 border-muted-foreground/20 pl-2">
      {members.map((m, i) => (
        <ExerciseRow key={i} {...m.props} supersetLabel={`${label}${i + 1}`} />
      ))}
      <p className="text-[10px] text-muted-foreground italic px-1">alternate — no rest between</p>
    </div>
  )
}
