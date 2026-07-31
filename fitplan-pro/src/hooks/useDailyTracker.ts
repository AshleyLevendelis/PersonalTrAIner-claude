import { useState, useEffect, useCallback } from 'react'
import { getWeeklyDashboard, markSessionCompleted, type WeeklyDashboardDay } from '@/lib/daily-tracking'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function useDailyTracker(profileId: string | undefined) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [days, setDays] = useState<WeeklyDashboardDay[]>([])
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekStartStr = toDateStr(weekStart)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndStr = toDateStr(weekEnd)

  const refresh = useCallback(async () => {
    if (!profileId) return
    setLoading(true)
    setError(null)
    try {
      const result = await getWeeklyDashboard(profileId, weekStartStr, weekEndStr)
      setDays(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load weekly data')
    } finally {
      setLoading(false)
    }
  }, [profileId, weekStartStr, weekEndStr])

  useEffect(() => {
    refresh()
  }, [refresh])

  const selectedDay = days.find(d => d.date === selectedDate) || null

  const completeSession = useCallback(async (sessionId: string) => {
    try {
      await markSessionCompleted(sessionId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark session complete')
    }
  }, [refresh])

  const goToPreviousWeek = useCallback(() => {
    const prev = new Date(weekStart)
    prev.setDate(prev.getDate() - 7)
    setWeekStart(prev)
    setSelectedDate(toDateStr(prev))
  }, [weekStart])

  const goToNextWeek = useCallback(() => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    setWeekStart(next)
    setSelectedDate(toDateStr(next))
  }, [weekStart])

  return {
    days,
    selectedDate,
    setSelectedDate,
    selectedDay,
    weekStartStr,
    weekEndStr,
    loading,
    error,
    refresh,
    completeSession,
    goToPreviousWeek,
    goToNextWeek,
  }
}
