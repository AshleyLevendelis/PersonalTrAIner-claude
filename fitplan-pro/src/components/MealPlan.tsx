import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  UtensilsCrossed,
  RefreshCw,
  Loader2,
  Flame,
  Beef,
  Wheat,
  Droplets,
  ChefHat,
} from 'lucide-react'
import type { WeeklyMealPlan, WeeklyMealSlot, MacroTargets, MealPlanDay, UserProfile, WorkoutDay, DayName } from '@/lib/types'
import { DAY_NAMES } from '@/lib/types'

interface MealPlanProps {
  weeklyPlan: WeeklyMealPlan | null
  legacyPlan: MealPlanDay[]
  profile: UserProfile | null
  exercisePlan: WorkoutDay[]
  macros: MacroTargets | null
  onSwapMeal: (dayName: DayName, mealSlot: string) => Promise<void>
}

const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
}

export function MealPlan({ weeklyPlan, legacyPlan, profile, exercisePlan, macros, onSwapMeal }: MealPlanProps) {
  if (weeklyPlan && Object.keys(weeklyPlan).length > 0) {
    return <WeeklyView weeklyPlan={weeklyPlan} profile={profile} exercisePlan={exercisePlan} onSwapMeal={onSwapMeal} />
  }

  if (legacyPlan.length > 0) {
    return <LegacyView plan={legacyPlan} macros={macros} />
  }

  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
        <UtensilsCrossed className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No meal plan generated yet.</p>
        <p className="text-xs text-muted-foreground/70">Complete onboarding to generate your weekly plan.</p>
      </CardContent>
    </Card>
  )
}

function WeeklyView({
  weeklyPlan,
  profile,
  exercisePlan,
  onSwapMeal,
}: {
  weeklyPlan: WeeklyMealPlan
  profile: UserProfile | null
  exercisePlan: WorkoutDay[]
  onSwapMeal: (dayName: DayName, mealSlot: string) => Promise<void>
}) {
  const today = new Date()
  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1
  const defaultDay = DAY_NAMES[todayIdx]

  return (
    <Card className="border-border/50 bg-card overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ChefHat className="size-4 text-emerald-500" />
          Weekly Meal Plan
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultDay} className="w-full">
          <TabsList className="w-full grid grid-cols-7 mb-4">
            {DAY_NAMES.map((day) => {
              const isTraining = profile?.training_days.some(td => td.day === day && td.available)
              return (
                <TabsTrigger
                  key={day}
                  value={day}
                  className="text-xs px-1 relative"
                >
                  {DAY_SHORT[day]}
                  {isTraining && (
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500" />
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {DAY_NAMES.map((day) => (
            <TabsContent key={day} value={day}>
              <DayMealList
                dayName={day}
                slots={weeklyPlan[day] || []}
                onSwapMeal={onSwapMeal}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

function DayMealList({
  dayName,
  slots,
  onSwapMeal,
}: {
  dayName: string
  slots: WeeklyMealSlot[]
  onSwapMeal: (dayName: DayName, mealSlot: string) => Promise<void>
}) {
  const totalCals = slots.reduce((s, m) => s + m.scaled_calories, 0)
  const totalProtein = slots.reduce((s, m) => s + m.scaled_protein, 0)
  const totalCarbs = slots.reduce((s, m) => s + m.scaled_carbs, 0)
  const totalFat = slots.reduce((s, m) => s + m.scaled_fat, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{dayName}</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Flame className="size-3 text-orange-400" />
            {totalCals} kcal
          </span>
          <span className="flex items-center gap-1">
            <Beef className="size-3 text-sky-400" />
            {totalProtein}g
          </span>
          <span className="flex items-center gap-1">
            <Wheat className="size-3 text-amber-400" />
            {totalCarbs}g
          </span>
          <span className="flex items-center gap-1">
            <Droplets className="size-3 text-rose-400" />
            {totalFat}g
          </span>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        {slots.map((slot, idx) => (
          <MealSlotCard key={`${slot.meal_slot}-${idx}`} slot={slot} dayName={dayName} onSwapMeal={onSwapMeal} />
        ))}
      </div>

      {slots.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No meals planned for this day.</p>
      )}
    </div>
  )
}

function MealSlotCard({
  slot,
  dayName,
  onSwapMeal,
}: {
  slot: WeeklyMealSlot
  dayName: string
  onSwapMeal: (dayName: DayName, mealSlot: string) => Promise<void>
}) {
  const [swapping, setSwapping] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleSwap = async () => {
    setSwapping(true)
    try {
      await onSwapMeal(dayName as DayName, slot.meal_slot)
    } finally {
      setSwapping(false)
    }
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] shrink-0 bg-accent/50">
              {slot.meal_slot}
            </Badge>
            <span className="text-sm font-medium truncate">{slot.recipe.name}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{slot.scaled_calories} kcal</span>
            <span>P: {slot.scaled_protein}g</span>
            <span>C: {slot.scaled_carbs}g</span>
            <span>F: {slot.scaled_fat}g</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={handleSwap}
          disabled={swapping}
          title="Swap meal"
        >
          {swapping ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>

      {slot.ingredient_lines.length > 0 && slot.ingredient_lines[0] !== 'Recipe not available - use any meal matching your macros' && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {expanded ? 'Hide ingredients' : `View ${slot.ingredient_lines.length} ingredients`}
          </button>

          {expanded && (
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-3 border-l-2 border-border/50">
              {slot.ingredient_lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {slot.scale_factor !== 1 && (
        <p className="text-[10px] text-muted-foreground/60 italic">
          Scaled to {Math.round(slot.scale_factor * 100)}% of original serving
        </p>
      )}
    </div>
  )
}

function LegacyView({ plan, macros }: { plan: MealPlanDay[]; macros: MacroTargets | null }) {
  const totalCalories = plan.reduce((sum, day) => {
    return sum + day.items.reduce((s, item) => s + item.calories, 0)
  }, 0)

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <UtensilsCrossed className="size-4 text-emerald-500" />
            Daily Meal Plan
          </CardTitle>
          {macros && (
            <Badge variant="outline" className="text-[10px]">
              Target: {macros.calories} kcal
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {plan.map((day, i) => (
          <div key={i} className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{day.meal}</h4>
            {day.items.map((item, j) => (
              <div key={j} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.calories} kcal</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>P: {item.protein}g</span>
                  <span>C: {item.carbs}g</span>
                  <span>F: {item.fat}g</span>
                </div>
              </div>
            ))}
          </div>
        ))}
        <Separator />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Daily Total</span>
          <span className="font-medium">{totalCalories} kcal</span>
        </div>
      </CardContent>
    </Card>
  )
}
