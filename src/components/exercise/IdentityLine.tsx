// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §1.4 — TODAY · {weekday} · {focus}. During a dev
// override the marker is persistent, never a one-off toast, so a simulated
// session is never mistaken for a real one mid-scroll.
// ---------------------------------------------------------------------------

export function IdentityLine({
  dayName,
  focus,
  devDay,
  borrowedFrom,
}: {
  dayName: string
  focus: string
  devDay?: string | null
  borrowedFrom?: string
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <h2 className="text-base font-semibold">
        TODAY · {dayName} · {focus}
      </h2>
      {devDay && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          DEV · {devDay}
        </span>
      )}
      {borrowedFrom && (
        <span className="text-[10px] text-muted-foreground italic">borrowed from {borrowedFrom}</span>
      )}
    </div>
  )
}
