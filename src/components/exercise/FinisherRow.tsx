import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Activity, Loader2 } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { saveCardioLog } from '@/lib/cardio-log-store'
import type { RecommendedCardio } from '@/lib/types'

// ---------------------------------------------------------------------------
// The PRESCRIBED cardio entry point (LAYOUT-DESIGN.md §1.7 F) — one line,
// one-tap Log with activity/duration/RPE prefilled from the plan. Distinct
// from AddUnplannedWork (§1.7 G), which is for anything NOT prescribed.
// Writes through the optimistic cardio-log-store wrapper (§7.6 #5), never
// the old direct insertCardioLog network call.
// ---------------------------------------------------------------------------

export function FinisherRow({ cardio, onLogged }: { cardio: RecommendedCardio; onLogged?: () => void }) {
  const { profileId, date } = useActiveSession()
  const [saving, setSaving] = useState(false)
  const [logged, setLogged] = useState(false)

  const handleLog = () => {
    if (!profileId || logged) return
    setSaving(true)
    // saveCardioLog is synchronous/local-first — the UI reflects the save
    // immediately; the network round-trip and any retry happen in the
    // background (cardio-log-store's flush loop).
    const view = saveCardioLog({
      userId: profileId,
      date,
      activityName: cardio.activity,
      durationMinutes: cardio.duration,
      intensityRpe: cardio.targetRpe,
    })
    setSaving(false)
    // The plan supplies this duration, so a refusal is a bad prescription
    // rather than a bad tap — but "Logged" over a row that never wrote is
    // the exact class of lie this round is closing, so the state only flips
    // when the write really happened.
    if (!view) {
      console.error('Refused to log the prescribed finisher cardio:', cardio)
      return
    }
    setLogged(true)
    onLogged?.()
  }

  // "Rowing Intervals — 6 rounds of 20s hard / 40s easy" -> the two halves the
  // row shows on two lines. An en/em dash or a plain hyphen surrounded by
  // spaces, because the catalogue uses more than one and a reader should not
  // have to know which.
  const [name, protocol] = (() => {
    const m = /^(.*?)\s+[—–-]\s+(.+)$/.exec(cardio.activity.trim())
    return m ? [m[1], m[2]] : [cardio.activity, null]
  })()

  return (
    <div className="flex items-start justify-between gap-2 rounded-[10px] border border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] px-3 py-2">
      <div className="flex items-start gap-2 min-w-0">
        <Activity className="size-3.5 text-[color:var(--role-warn)] shrink-0 mt-0.5" />
        {/* THE PROTOCOL IS NOT AN AFTERTHOUGHT — Ashley, 14 Sep 2026: "the
            finisher title is truncated (Finisher · 11m Rowing Intervals — 6
            rounds...), making it impossible to see the full description, round
            breakdown, or work/rest durations."

            The row had `truncate` on one line. The plan's own strings are
            genuinely long and carry the whole prescription after an em dash —
            "Rowing Intervals — 6 rounds of 20s hard / 40s easy" — so what the
            ellipsis ate was the instruction, not decoration.

            SPLIT AT THE DASH RATHER THAN JUST WRAPPING. The name, duration and
            effort are what she scans for; the rounds and the work/rest are
            what she needs once she is doing it. Two lines say that; one long
            wrapped line makes her read the whole thing to find either. Split
            off the string the plan already writes, so a new protocol phrasing
            needs no change here — and a name with no dash simply has no second
            line. */}
        <div className="min-w-0">
          <span className="block text-xs text-foreground">
            Finisher · {cardio.duration}m {name} · RPE {cardio.targetRpe}
          </span>
          {protocol && (
            <span className="block text-[0.6875rem] leading-4 text-muted-foreground">{protocol}</span>
          )}
        </div>
      </div>
      <Button
        variant={logged ? 'ghost' : 'outline'}
        size="sm"
        className="h-7 text-xs shrink-0"
        disabled={saving || logged}
        onClick={handleLog}
      >
        {saving ? <Loader2 className="size-3 animate-spin" /> : logged ? 'Logged' : 'Log'}
      </Button>
    </div>
  )
}
