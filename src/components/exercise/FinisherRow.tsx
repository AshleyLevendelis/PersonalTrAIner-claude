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
    saveCardioLog({
      userId: profileId,
      date,
      activityName: cardio.activity,
      durationMinutes: cardio.duration,
      intensityRpe: cardio.targetRpe,
    })
    setSaving(false)
    setLogged(true)
    onLogged?.()
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Activity className="size-3.5 text-[color:var(--role-warn)] shrink-0" />
        <span className="text-xs text-foreground truncate">
          Finisher · {cardio.duration}m {cardio.activity} · RPE {cardio.targetRpe}
        </span>
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
