// ---------------------------------------------------------------------------
// HOME'S WEEK VOLUME — design handoff 2a, 10 Oct 2026.
//
// Working sets this calendar week (Monday to today) against LAST week's SAME
// days (Monday to the same weekday), so a Wednesday is never measured against
// a whole finished week. Monday-first, the week the Home strip draws.
// ---------------------------------------------------------------------------

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The Monday on or before `iso` (local dates, noon-anchored so no clock change moves it). */
function mondayOf(iso: string): string {
  return addDays(iso, -((new Date(`${iso}T12:00:00`).getDay() + 6) % 7))
}

export function weekVolume(logs: { date: string }[], today: string): { thisWeek: number; lastWeekSoFar: number } {
  const thisMonday = mondayOf(today)
  const lastMonday = addDays(thisMonday, -7)
  const lastSameDay = addDays(today, -7)
  return {
    thisWeek: logs.filter(l => l.date >= thisMonday && l.date <= today).length,
    lastWeekSoFar: logs.filter(l => l.date >= lastMonday && l.date <= lastSameDay).length,
  }
}
