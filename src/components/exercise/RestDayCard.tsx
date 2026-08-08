import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Heart, ChevronRight, Loader2 } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { saveCardioLog, deleteCardioLog } from '@/lib/cardio-log-store'
import type { WorkoutDay, RecommendedCardio } from '@/lib/types'

// ---------------------------------------------------------------------------
// Rest and active-recovery days as first-class calm states (LAYOUT-DESIGN.md
// §1.8) — today both are dead ends with zero controls. Rebuilt: the week
// tally, a preview of tomorrow's session (tap -> peek), an activity log
// entry, and (rest day only) a "Train anyway" escape onto another training
// day's prescription.
// ---------------------------------------------------------------------------

function ActivityLogEntry() {
  const { profileId, date } = useActiveSession()
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState('')
  const [duration, setDuration] = useState('')
  const [saving, setSaving] = useState(false)
  const [loggedClientId, setLoggedClientId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)

  const handleUndo = async () => {
    if (!loggedClientId) return
    setUndoing(true)
    try {
      await deleteCardioLog(loggedClientId)
      setLoggedClientId(null)
      setActivity('')
      setDuration('')
    } finally {
      setUndoing(false)
    }
  }

  if (loggedClientId) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Activity logged for today.</span>
        <button type="button" className="font-semibold text-primary disabled:opacity-50" disabled={undoing} onClick={handleUndo}>
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        Log a walk or other activity
      </button>
    )
  }

  const handleSave = () => {
    if (!profileId || !activity.trim() || !duration) return
    setSaving(true)
    const view = saveCardioLog({
      userId: profileId,
      date,
      activityName: activity.trim(),
      durationMinutes: parseInt(duration) || 0,
      intensityRpe: 4,
    })
    setSaving(false)
    setLoggedClientId(view.clientId ?? null)
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Activity"
        value={activity}
        onChange={e => setActivity(e.target.value)}
        className="h-8 text-sm"
        autoFocus
      />
      <Input
        type="number"
        min="1"
        placeholder="Mins"
        value={duration}
        onChange={e => setDuration(e.target.value)}
        className="h-8 text-sm w-20"
      />
      <Button size="sm" className="h-8 shrink-0" disabled={!activity.trim() || !duration || saving} onClick={handleSave}>
        {saving ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
      </Button>
    </div>
  )
}

function TomorrowPreview({
  tomorrow,
  onPeek,
}: {
  tomorrow: { dayName: string; focus: string; exerciseCount: number }
  onPeek?: (dayName: string) => void
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center justify-between gap-2 rounded-lg bg-[color:var(--surface-raised)] px-3 py-2 text-left hover:bg-accent/40 transition-colors disabled:opacity-50"
      onClick={() => onPeek?.(tomorrow.dayName)}
      disabled={!onPeek}
    >
      <span className="text-xs text-foreground">
        Tomorrow · {tomorrow.focus} · {tomorrow.exerciseCount} exercises
      </span>
      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
    </button>
  )
}

export function RestDayCard({
  dayName,
  weekTally,
  tomorrow,
  onPeek,
  trainAnywayOptions,
  onTrainAnyway,
}: {
  dayName: string
  weekTally: { done: number; planned: number }
  tomorrow?: { dayName: string; focus: string; exerciseCount: number }
  onPeek?: (dayName: string) => void
  trainAnywayOptions: string[]
  onTrainAnyway: (sourceDayName: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <Card className="bg-[color:var(--surface-deep)]">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-full bg-muted shrink-0">
            <Heart className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Rest day · {dayName}</p>
            <p className="text-xs text-muted-foreground">Recovery is where the adaptation happens.</p>
          </div>
        </div>
        {weekTally.planned > 0 && (
          <p className="text-xs text-muted-foreground">
            This week: {weekTally.done} of {weekTally.planned} sessions done.
          </p>
        )}
        {tomorrow && <TomorrowPreview tomorrow={tomorrow} onPeek={onPeek} />}
        <ActivityLogEntry />
        {trainAnywayOptions.length > 0 && !pickerOpen && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            onClick={() => setPickerOpen(true)}
          >
            Train anyway →
          </button>
        )}
        {pickerOpen && (
          <div className="flex flex-wrap gap-1.5">
            {trainAnywayOptions.map(d => (
              <Button key={d} variant="outline" size="sm" className="h-7 text-xs" onClick={() => onTrainAnyway(d)}>
                {d}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ActiveRecoveryCard({
  workout,
  weekTally,
  tomorrow,
  onPeek,
}: {
  workout: WorkoutDay
  weekTally: { done: number; planned: number }
  tomorrow?: { dayName: string; focus: string; exerciseCount: number }
  onPeek?: (dayName: string) => void
}) {
  const cardio = workout.recommendedCardio
  return (
    <Card className="border-[color:var(--role-warn-border)] bg-gradient-to-br from-[color:var(--role-warn-bg)] to-background">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-[color:var(--role-warn-bg)] flex items-center justify-center shrink-0">
            <Heart className="size-5 text-[color:var(--role-warn)]" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Active recovery · {workout.day}</p>
            <p className="text-xs text-muted-foreground">{workout.focus}</p>
          </div>
        </div>
        {weekTally.planned > 0 && (
          <p className="text-xs text-muted-foreground">
            This week: {weekTally.done} of {weekTally.planned} sessions done.
          </p>
        )}
        {cardio && <RecoveryFinisher cardio={cardio} />}
        {tomorrow && <TomorrowPreview tomorrow={tomorrow} onPeek={onPeek} />}
        <ActivityLogEntry />
      </CardContent>
    </Card>
  )
}

function RecoveryFinisher({ cardio }: { cardio: RecommendedCardio }) {
  const { profileId, date } = useActiveSession()
  const [saving, setSaving] = useState(false)
  const [loggedClientId, setLoggedClientId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)

  const handleLog = () => {
    if (!profileId || loggedClientId) return
    setSaving(true)
    const view = saveCardioLog({
      userId: profileId,
      date,
      activityName: cardio.activity,
      durationMinutes: cardio.duration,
      intensityRpe: cardio.targetRpe,
    })
    setSaving(false)
    setLoggedClientId(view.clientId ?? null)
  }

  const handleUndo = async () => {
    if (!loggedClientId) return
    setUndoing(true)
    try {
      await deleteCardioLog(loggedClientId)
      setLoggedClientId(null)
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[color:var(--role-warn-bg)] px-3 py-2">
      <span className="text-xs text-foreground">
        {cardio.activity} · {cardio.duration}m · RPE {cardio.targetRpe}
      </span>
      {loggedClientId ? (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">Logged</span>
          <button type="button" className="text-xs font-semibold text-primary disabled:opacity-50" disabled={undoing} onClick={handleUndo}>
            {undoing ? 'Undoing…' : 'Undo'}
          </button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" disabled={saving} onClick={handleLog}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : 'Log'}
        </Button>
      )}
    </div>
  )
}
