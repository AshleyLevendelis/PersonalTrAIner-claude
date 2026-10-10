// ---------------------------------------------------------------------------
// THE DATES WHERE "UNDO" WAS TAPPED on "resized to fit around your swap"
// (runs 3-4, M34). Kept on the phone, per person, and read by every place a
// day is served (the Nutrition tab, its trials and the shopping list), so the
// screen and the list cannot disagree about a portion. A convenience, like
// the logged-meal Undo beside it: a cleared browser forgets it, and the day
// simply fits around the swap again.
// ---------------------------------------------------------------------------
const key = (profileId: string) => `fitplan_held_sizes_kept_${profileId}`

export function readKeptHeldSizes(profileId: string | null | undefined): string[] {
  if (!profileId) return []
  try {
    const raw = JSON.parse(localStorage.getItem(key(profileId)) ?? '[]')
    return Array.isArray(raw) ? raw.filter((d): d is string => typeof d === 'string') : []
  } catch {
    return []
  }
}

export function writeKeptHeldSize(profileId: string, date: string, keep: boolean): string[] {
  const next = new Set(readKeptHeldSizes(profileId))
  if (keep) next.add(date)
  else next.delete(date)
  const list = [...next].sort()
  try { localStorage.setItem(key(profileId), JSON.stringify(list)) } catch { /* holds for this visit through the caller's state */ }
  return list
}
