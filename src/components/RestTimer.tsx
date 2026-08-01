import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { X, Timer, Play, Pause, SkipForward } from 'lucide-react'

interface RestTimerProps {
  durationSeconds: number
  exerciseName: string
  onDismiss: () => void
  onComplete: () => void
}

export function RestTimer({ durationSeconds, exerciseName, onDismiss, onComplete }: RestTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  const playChime = useCallback(() => {
    try {
      const ctx = new AudioContext()
      audioRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {
      // Audio not available — silent fallback
    }
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200])
    }
  }, [])

  useEffect(() => {
    if (isPaused) return

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          playChime()
          setTimeout(() => onComplete(), 1500)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPaused, playChime, onComplete])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.close()
      }
    }
  }, [])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const progress = ((durationSeconds - remaining) / durationSeconds) * 100

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <Card className="border-primary/30 bg-card/95 backdrop-blur-sm shadow-lg">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-sm font-medium">Rest Timer</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  if (intervalRef.current) clearInterval(intervalRef.current)
                  onDismiss()
                }}
              >
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  if (intervalRef.current) clearInterval(intervalRef.current)
                  onDismiss()
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums tracking-tight">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Next: {exerciseName}
            </p>
          </div>

          <Progress value={progress} className="h-1.5" />

          {remaining === 0 && (
            <Badge className="w-full justify-center bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0">
              Rest complete — go!
            </Badge>
          )}
        </div>
      </Card>
    </div>
  )
}
