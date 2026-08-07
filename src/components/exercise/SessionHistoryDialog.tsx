// ---------------------------------------------------------------------------
// Overall (not per-exercise) session history — date/name/duration/volume,
// newest first, tap through to what was actually logged. Reachable from
// WeekContextRow's "⋮" menu.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChevronDown } from 'lucide-react'
import { getSessionHistory, type SessionHistoryEntry } from '@/lib/exercise-history'
import { getSetsForSession } from '@/lib/set-log-store'
import type { ExerciseSetLog } from '@/lib/types'

export function SessionHistoryDialog({
  open,
  onOpenChange,
  profileId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId?: string
}) {
  const [entries, setEntries] = useState<SessionHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [expandedSets, setExpandedSets] = useState<ExerciseSetLog[]>([])

  useEffect(() => {
    if (!open || !profileId) return
    let cancelled = false
    setLoading(true)
    getSessionHistory(profileId)
      .then(result => { if (!cancelled) setEntries(result) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, profileId])

  useEffect(() => {
    if (!open) { setExpandedSessionId(null); setExpandedSets([]) }
  }, [open])

  const toggleExpand = (sessionId: string) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null)
      setExpandedSets([])
      return
    }
    setExpandedSessionId(sessionId)
    getSetsForSession(sessionId).then(setExpandedSets)
  }

  const byExercise = new Map<string, ExerciseSetLog[]>()
  for (const s of expandedSets) {
    if (s.is_warmup) continue
    const list = byExercise.get(s.exercise_name) ?? []
    list.push(s)
    byExercise.set(s.exercise_name, list)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session history</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.sessionId} className="border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--hairline)' }}>
                <button
                  type="button"
                  onClick={() => toggleExpand(entry.sessionId)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{entry.day ?? entry.splitType} · {entry.date}</p>
                    <p className="text-xs text-muted-foreground tabular-mono">
                      {entry.durationMinutes != null ? `${entry.durationMinutes}m` : '—'} · {Math.round(entry.totalVolumeKg).toLocaleString()}kg · {entry.totalSets} sets
                    </p>
                  </div>
                  <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expandedSessionId === entry.sessionId ? 'rotate-180' : ''}`} />
                </button>
                {expandedSessionId === entry.sessionId && (
                  <div className="mt-2 space-y-1.5 pl-1">
                    {[...byExercise.entries()].map(([name, sets]) => (
                      <p key={name} className="text-xs">
                        <span className="font-medium">{name}</span>{' '}
                        <span className="tabular-mono text-muted-foreground">
                          {sets.sort((a, b) => a.set_number - b.set_number).map(s => s.is_bodyweight ? `${s.reps_completed}` : `${s.weight_kg}kg×${s.reps_completed}`).join(', ')}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
