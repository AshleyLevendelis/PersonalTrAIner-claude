import { Heart } from 'lucide-react'
import { useLiveHeartRate } from '@/lib/strap-live'
import { ZONES, zoneOf } from '@/lib/heart-series'

// THE LIVE NUMBER (option 3, strap-live.ts): "♥ 152" while a paired strap is sending, nothing otherwise. One reader for
// the round timer, the countdown, today's workout and the corner of every screen, so they cannot disagree. With `onOpen`
// it is a button (the corner one, 25 Nov 2026), opening the strap's row on Profile.
//
// WITH ITS ZONE ON A RECORDED WORKOUT (his words 27 Nov 2026: "While the exercise is running I should be able to see my
// heart rate and the zone"): given `estimatedMax`, it reads "♥ 152 · Zone 4". It NARROWS the old "shown, never judged":
// the zone is the same tenths-of-maximum description the summary draws (heart-series.ts), with no colour that says too
// high and no target; the caller passes no maximum for a health condition, pregnancy or no age, and then no zone shows.
export function LiveHeart({ className = '', onOpen, label, estimatedMax }: { className?: string; onOpen?: () => void; label?: string; estimatedMax?: number | null }) {
  const bpm = useLiveHeartRate()
  if (bpm == null) return null
  const zone = estimatedMax ? zoneOf(bpm, Math.max(estimatedMax, bpm)) : null
  const body = <><Heart className="size-3.5" aria-hidden /> {bpm}{zone && <span className="font-sans text-muted-foreground" data-live-zone={zone}> · Zone {zone}</span>}</>
  const cls = `inline-flex items-center gap-1 whitespace-nowrap tabular-mono ${className}`
  const spoken = zone ? `${bpm}, zone ${zone}, ${ZONES[zone - 1].word.toLowerCase()}` : `${bpm}`
  return onOpen
    ? <button type="button" className={cls} data-live-heart={bpm} data-live-heart-corner aria-label={`${label ?? 'Heart rate'}: ${spoken}`} onClick={onOpen}>{body}</button>
    : <span className={cls} data-live-heart={bpm} aria-label={`Heart rate ${spoken}`}>{body}</span>
}
