import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Activity, Clock, Heart, Plus, Flame, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { insertCardioLog, getCardioLogsForDate } from '@/lib/daily-tracking'
import type { CardioLog } from '@/lib/types'

const QUICK_TAGS = ['Running', 'HIIT', 'Muay Thai', 'Rowing', 'Cycling', 'Swimming', 'Jump Rope', 'Walking']

const RPE_LABELS: Record<number, string> = {
  1: 'Very Light',
  2: 'Light',
  3: 'Light-Moderate',
  4: 'Moderate',
  5: 'Moderate',
  6: 'Hard',
  7: 'Hard',
  8: 'Very Hard',
  9: 'Near Max',
  10: 'Max Effort',
}

function getRpeColor(rpe: number): string {
  if (rpe <= 3) return 'bg-emerald-500'
  if (rpe <= 5) return 'bg-yellow-500'
  if (rpe <= 7) return 'bg-orange-500'
  return 'bg-red-500'
}

interface CardioLoggerProps {
  profileId: string
}

export function CardioLogger({ profileId }: CardioLoggerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activityName, setActivityName] = useState('')
  const [duration, setDuration] = useState('')
  const [rpe, setRpe] = useState(5)
  const [heartRate, setHeartRate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [todayLogs, setTodayLogs] = useState<CardioLog[]>([])

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    getCardioLogsForDate(profileId, today).then(setTodayLogs).catch(console.error)
  }, [profileId, today])

  const handleSubmit = async () => {
    if (!activityName.trim() || !duration) return

    setSaving(true)
    try {
      const log = await insertCardioLog(
        profileId,
        today,
        activityName.trim(),
        parseInt(duration),
        rpe,
        heartRate ? parseInt(heartRate) : null,
        notes.trim() || null,
      )
      setTodayLogs(prev => [log, ...prev])
      setActivityName('')
      setDuration('')
      setRpe(5)
      setHeartRate('')
      setNotes('')
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to save cardio log:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="size-4 text-orange-500" />
            Cardio & Conditioning
          </CardTitle>
          {todayLogs.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {todayLogs.length} logged
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {todayLogs.length > 0 && (
          <div className="space-y-2">
            {todayLogs.map(log => (
              <div key={log.id} className="flex items-center gap-3 rounded-md border px-3 py-2 bg-muted/30">
                <div className={`size-2 rounded-full shrink-0 ${getRpeColor(log.intensity_rpe)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{log.activity_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.duration_minutes}min - RPE {log.intensity_rpe}
                    {log.avg_heart_rate ? ` - ${log.avg_heart_rate}bpm` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  <Flame className="size-3 mr-0.5" />
                  {log.intensity_rpe}/10
                </Badge>
              </div>
            ))}
            <Separator />
          </div>
        )}

        {!isOpen ? (
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => setIsOpen(true)}
          >
            <Plus className="size-4 mr-2" />
            Log Cardio / Conditioning
          </Button>
        ) : (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Log Activity</h4>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setIsOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activity-name" className="text-xs">Activity Name</Label>
              <Input
                id="activity-name"
                placeholder="Type any activity (e.g. Rucking, 5-a-side Football, Pad Work...)"
                value={activityName}
                onChange={e => setActivityName(e.target.value)}
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent ${
                      activityName === tag ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'
                    }`}
                    onClick={() => setActivityName(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="duration" className="text-xs flex items-center gap-1">
                  <Clock className="size-3" />
                  Duration (mins)
                </Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  placeholder="30"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="heart-rate" className="text-xs flex items-center gap-1">
                  <Heart className="size-3" />
                  Avg HR (optional)
                </Label>
                <Input
                  id="heart-rate"
                  type="number"
                  min="40"
                  max="220"
                  placeholder="145"
                  value={heartRate}
                  onChange={e => setHeartRate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Intensity / Effort (RPE {rpe} - {RPE_LABELS[rpe]})</Label>
              <div className="flex gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(val => (
                  <button
                    key={val}
                    type="button"
                    className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${
                      val === rpe
                        ? `${getRpeColor(val)} text-white shadow-sm scale-105`
                        : val <= rpe
                          ? `${getRpeColor(val)} text-white/80`
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                    onClick={() => setRpe(val)}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                <span>Very Light</span>
                <span>Max Effort</span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!activityName.trim() || !duration || saving}
            >
              {saving ? (
                <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Activity className="size-4 mr-2" />
              )}
              Save Activity
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
