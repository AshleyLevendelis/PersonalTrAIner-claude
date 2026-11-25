import { Heart } from 'lucide-react'
import { useLiveHeartRate } from '@/lib/strap-live'

// THE LIVE NUMBER (option 3, strap-live.ts): "♥ 152" while a paired strap is sending, nothing otherwise. One reader for
// the round timer, the countdown, today's workout and the corner of every screen, so they cannot disagree. Shown, never
// judged (CSCS, mine): no zone, no target, no colour that says too high. With `onOpen` it is a button (the corner one,
// 25 Nov 2026), opening the strap's row on Profile.
export function LiveHeart({ className = '', onOpen, label }: { className?: string; onOpen?: () => void; label?: string }) {
  const bpm = useLiveHeartRate()
  if (bpm == null) return null
  const body = <><Heart className="size-3.5" aria-hidden /> {bpm}</>
  const cls = `inline-flex items-center gap-1 whitespace-nowrap tabular-mono ${className}`
  return onOpen
    ? <button type="button" className={cls} data-live-heart={bpm} data-live-heart-corner aria-label={`${label ?? 'Heart rate'}: ${bpm}`} onClick={onOpen}>{body}</button>
    : <span className={cls} data-live-heart={bpm} aria-label={`Heart rate ${bpm}`}>{body}</span>
}
