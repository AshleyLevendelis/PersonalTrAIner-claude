// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §2 D1 / §7.3 — REBUILT down to NutritionPanel only. The
// DayPill grid, TrainingPanel, and the Complete-Session status row are
// deleted: the Exercise tab now owns day/week orientation entirely (the
// week strip + today view), and this card duplicating that with its own,
// non-dev-clock-aware today-detection was exactly the two-day-strips /
// two-completion-concepts conflict the redesign exists to resolve. What's
// left is genuinely this card's own job — today's nutrition at a glance —
// and it's hidden on the Exercise tab (App.tsx) so it never competes with
// the session view for space.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Flame, Loader2 } from 'lucide-react'
import { getWeeklyDashboard, type WeeklyDashboardDay } from '@/lib/daily-tracking'
import { getAppNow, getLocalDateString } from '@/lib/dev-clock'
import { calculateDailyMacros } from '@/lib/macro-calculator'
import type { UserProfile, WorkoutDay } from '@/lib/types'

interface WeeklyPlannerCardProps {
  profileId: string
  profile?: UserProfile | null
  exercisePlan?: WorkoutDay[]
}

function getCarbDayType(carbsG: number, proteinG: number, fatsG: number): 'low' | 'medium' | 'high' {
  const totalMacroG = carbsG + proteinG + fatsG
  if (totalMacroG === 0) return 'medium'
  const carbRatio = carbsG / totalMacroG
  if (carbRatio >= 0.45) return 'high'
  if (carbRatio <= 0.25) return 'low'
  return 'medium'
}

export function WeeklyPlannerCard({ profileId, profile, exercisePlan }: WeeklyPlannerCardProps) {
  const [day, setDay] = useState<WeeklyDashboardDay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const today = getLocalDateString(getAppNow(profileId))
    getWeeklyDashboard(profileId, today, today)
      .then(days => { if (!cancelled) setDay(days[0] ?? null) })
      .catch(() => { if (!cancelled) setDay(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [profileId])

  const nutrition = day?.nutrition
  const computed = profile ? calculateDailyMacros(profile, todayWeekdayName(profileId), exercisePlan ?? []) : null

  if (loading) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const carbColors = {
    low: { bar: 'bg-sky-500', badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
    medium: { bar: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    high: { bar: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  }

  if (nutrition) {
    const carbType = getCarbDayType(nutrition.target_carbs_g, nutrition.target_protein_g, nutrition.target_fats_g)
    const colors = carbColors[carbType]
    const maxMacro = Math.max(nutrition.target_protein_g, nutrition.target_carbs_g, nutrition.target_fats_g, 1)
    return (
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Flame className="size-4 text-orange-400" />
              {nutrition.target_calories} kcal today
            </CardTitle>
            <Badge variant="outline" className={`text-[10px] ${colors.badge}`}>{carbType.toUpperCase()} CARB</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <MacroBar label="Protein" value={nutrition.target_protein_g} max={maxMacro} colorClass="bg-sky-500" />
          <MacroBar label="Carbs" value={nutrition.target_carbs_g} max={maxMacro} colorClass={colors.bar} />
          <MacroBar label="Fats" value={nutrition.target_fats_g} max={maxMacro} colorClass="bg-rose-400" />
        </CardContent>
      </Card>
    )
  }

  if (computed) {
    const carbType = getCarbDayType(computed.carbs, computed.protein, computed.fat)
    const colors = carbColors[carbType]
    const maxMacro = Math.max(computed.protein, computed.carbs, computed.fat, 1)
    return (
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Flame className="size-4 text-orange-400" />
              {computed.calories} kcal today
            </CardTitle>
            <Badge variant="outline" className={`text-[10px] ${colors.badge}`}>{carbType.toUpperCase()} CARB</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <MacroBar label="Protein" value={computed.protein} max={maxMacro} colorClass="bg-sky-500" />
          <MacroBar label="Carbs" value={computed.carbs} max={maxMacro} colorClass={colors.bar} />
          <MacroBar label="Fats" value={computed.fat} max={maxMacro} colorClass="bg-rose-400" />
        </CardContent>
      </Card>
    )
  }

  return null
}

function todayWeekdayName(profileId: string): string {
  return getAppNow(profileId).toLocaleDateString('en-US', { weekday: 'long' })
}

function MacroBar({ label, value, max, colorClass }: { label: string; value: number; max: number; colorClass: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}g</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
