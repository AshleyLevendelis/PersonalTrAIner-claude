import { Heart } from 'lucide-react'
import { useLiveHeartRate } from '@/lib/strap-live'

// THE LIVE NUMBER (option 3, strap-live.ts): "♥ 152" while a paired strap is sending, nothing otherwise. One reader for
// the round timer, the countdown and today's workout, so they cannot disagree. Shown, never judged (CSCS, mine): no
// zone, no target, no colour that says too high.
export function LiveHeart({ className = '' }: { className?: string }) {
  const bpm = useLiveHeartRate()
  if (bpm == null) return null
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap tabular-mono ${className}`} data-live-heart={bpm} aria-label={`Heart rate ${bpm}`}>
      <Heart className="size-3.5" aria-hidden /> {bpm}
    </span>
  )
}
