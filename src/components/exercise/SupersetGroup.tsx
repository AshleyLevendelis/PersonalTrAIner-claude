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
  return (
    <div className="rounded-lg border border-muted-foreground/20 bg-muted/10 p-2 space-y-2">
      <div className="space-y-2">
        {members.map((m, i) => (
          <ExerciseRow key={i} {...m.props} supersetLabel={`${label}${i + 1}`} />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground italic px-1">alternate — no rest between</p>
    </div>
  )
}
