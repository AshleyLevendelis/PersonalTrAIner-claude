// ---------------------------------------------------------------------------
// THE GROCERY SCREEN, REAL, AT PHONE SIZE — verify:grocery (design 3a/3b,
// 27 Sep 2026).
//
// Mounts the real GroceryScreen (and so the real GroceryList, the real grocery
// store and its real write queue) over a fake database seeded with a
// believable week's shop: fifteen lines across five aisles, three already in
// the trolley, one unmatched ingredient, counted items (broccoli by the head,
// bananas) and weighed ones. The real tab bar sits under it with the chat
// button flat, as App passes it, and the real settings menu goes in the top
// bar, as App hands it.
//
// WHAT IS NOT REAL, stated so the result is not overread: App.tsx itself.
// Its two lines for this screen — hiding the floating settings menu and
// passing the flat disc — are held by test:grocery-screen, not driven here.
// ---------------------------------------------------------------------------

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { setSupabaseClient } from '@/lib/supabase'
import { makeFakeSupabase, type Db } from './fake-supabase'
import { computeTargets } from '@/lib/nutrition-targets'
import type { MacroTargets, UserProfile } from '@/lib/types'
import type { PoolOption } from '@/lib/meal-generation'
import { GroceryScreen } from '@/components/GroceryScreen'
import { BottomTabBar } from '@/components/BottomTabBar'
import { ProfileMenu } from '@/components/ProfileMenu'
import { AppearanceProvider } from '@/hooks/useAppearance'
import { setDevClockOverride } from '@/lib/dev-clock'
import { ANCHOR_ISO, anchorNowMs } from './anchor.mjs'
import '@/index.css'

const PROFILE_ID = '00000000-0000-4000-8000-000000000003'
setDevClockOverride(PROFILE_ID, ANCHOR_ISO)
const params = new URLSearchParams(location.search)
const EMPTY = params.get('empty') === '1'
// THE LIST WAS BUILT TODAY, over seven days — the note GroceryList keeps when
// Rebuild runs. ?nomemo=1 leaves it out, as on a phone that never rebuilt.
if (params.get('nomemo') !== '1') {
  try { localStorage.setItem(`fitplan_grocery_built_v1:${PROFILE_ID}`, JSON.stringify({ startDate: ANCHOR_ISO.slice(0, 10), days: 7 })) } catch { /* the screen falls back to "Day 1" */ }
} else {
  try { localStorage.removeItem(`fitplan_grocery_built_v1:${PROFILE_ID}`) } catch { /* nothing to remove */ }
}

const profile = {
  id: PROFILE_ID, age: 30, gender: 'female', height_cm: 168, weight_kg: 65, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', bmr: 1450, tdee: 2100, dietary_preferences: [], macro_calculation_mode: 'STANDARD_STATIC',
  created_at: new Date(anchorNowMs() - 9 * 86400000).toISOString(),
} as unknown as UserProfile
const targets: MacroTargets | null = computeTargets(profile)

const created = (i: number) => new Date(anchorNowMs() - (100 - i) * 60_000).toISOString()
type Ref = { day: number; slot: string; mealName: string }
const refs = (slot: string, meals: string[], days: number[]): Ref[] => days.map((day, i) => ({ day, slot, mealName: meals[i % meals.length] }))
const row = (i: number, name: string, category: string, quantity: number, unit: string, mealRefs: Ref[], extra: Record<string, unknown> = {}) => ({
  id: `g-${i}`, profile_id: PROFILE_ID, canonical_key: name.toLowerCase(), display_name: name, quantity, unit, category,
  source: 'generated', meal_refs: mealRefs, checked: false, needs_review: false, client_id: `g-${i}`,
  created_at: created(i), dismissed: false, user_edited: false, ...extra,
})
const seeded = EMPTY ? [] : [
  row(1, 'Broccoli', 'produce', 600, 'g', refs('dinner', ['Salmon & greens', 'Beef stir-fry', 'Chicken traybake'], [0, 2, 4])),
  row(2, 'Spinach', 'produce', 300, 'g', refs('lunch', ['Chicken & greens wrap'], [1, 3])),
  row(3, 'Banana', 'produce', 708, 'g', refs('breakfast', ['Yogurt bowl', 'Oats & banana'], [0, 1, 2, 3, 4, 5])),
  row(4, 'Sweet potato', 'produce', 800, 'g', refs('dinner', ['Chicken traybake', 'Salmon & greens'], [0, 1, 4, 6])),
  row(5, 'Chicken breast', 'meat_fish', 1180, 'g', refs('lunch', ['Chicken rice bowl', 'Chicken rice bowl', 'Chicken & greens wrap', 'Chicken rice bowl', 'Chicken & greens wrap'], [0, 1, 3, 4, 5])),
  row(6, 'Salmon fillet', 'meat_fish', 2, 'fillets', refs('dinner', ['Salmon & greens'], [0, 4])),
  row(7, 'Lean beef mince', 'meat_fish', 500, 'g', refs('dinner', ['Beef stir-fry', 'Chilli'], [2, 5])),
  row(8, 'Greek yogurt', 'dairy', 1000, 'g', refs('breakfast', ['Yogurt bowl'], [0, 1, 2, 3, 4, 5, 6])),
  row(9, 'Cheddar', 'dairy', 200, 'g', refs('lunch', ['Cheese toastie'], [2, 6])),
  row(10, 'Milk', 'dairy', 1000, 'ml', refs('breakfast', ['Oats & banana'], [1, 3, 5])),
  row(11, 'Brown rice', 'dry_goods', 600, 'g', [...refs('lunch', ['Chicken rice bowl'], [0, 1, 4]), ...refs('dinner', ['Beef stir-fry'], [2, 5])]),
  row(12, 'Harissa paste', 'dry_goods', 60, 'g', refs('dinner', ['Chicken traybake'], [0]), { needs_review: true }),
  row(13, 'Peanut butter', 'dry_goods', 200, 'g', refs('breakfast', ['Oats & banana'], [1, 3]), { checked: true }),
  row(14, 'Frozen berries', 'frozen', 500, 'g', refs('breakfast', ['Yogurt bowl'], [0, 2, 4]), { checked: true }),
  row(15, 'Oats', 'dry_goods', 400, 'g', refs('breakfast', ['Oats & banana'], [1, 3, 5]), { checked: true }),
]

const db: Db = { fitness_profiles: [{ ...profile }], grocery_items: seeded as never }
setSupabaseClient(makeFakeSupabase(db) as never)
;(window as never as Record<string, unknown>).__fakeDb = db

// ONE MEAL PER SLOT for Rebuild, so a rebuild has something real to build
// from and its result is recognisable (tuna appears; nothing seeded has it).
const option = (slot: 'breakfast' | 'lunch' | 'dinner', name: string, ingredients: PoolOption['ingredients'], kcal: number): PoolOption => ({
  slot, name, ingredients, tags: [],
  macros: { calories: kcal, protein: Math.round(kcal * 0.3 / 4), carbs: Math.round(kcal * 0.45 / 4), fat: Math.round(kcal * 0.25 / 9) } as MacroTargets,
})
const mealPools = {
  breakfast: [option('breakfast', 'Yogurt bowl', [{ name: 'greek yogurt', quantity: 200, unit: 'g' }, { name: 'banana', quantity: 1, unit: 'medium' }], 450)],
  lunch: [option('lunch', 'Tuna rice bowl', [{ name: 'tuna', quantity: 120, unit: 'g' }, { name: 'brown rice', quantity: 80, unit: 'g' }], 650)],
  dinner: [option('dinner', 'Chicken traybake', [{ name: 'chicken breast', quantity: 180, unit: 'g' }, { name: 'sweet potato', quantity: 200, unit: 'g' }, { name: 'broccoli', quantity: 150, unit: 'g' }], 700)],
}

// navigator.share, so the Share button is offered as it is on a phone.
if (!('share' in navigator)) (navigator as never as Record<string, unknown>).share = async () => {}

function Harness() {
  const [, setTick] = useState(0)
  return (
    <AppearanceProvider>
      <div className="min-h-screen bg-background text-foreground">
        <GroceryScreen
          profileId={PROFILE_ID}
          mealPools={mealPools}
          targets={targets}
          softLikedFoods={[]}
          todaysPicks={{}}
          mealShape={{ mealsPerDay: 3, includeSnacks: false, batchCooking: false }}
          onClose={() => { (window as never as Record<string, unknown>).__closed = true; setTick(t => t + 1) }}
          headerAction={<ProfileMenu onOpenProfile={() => {}} onReplayTour={() => {}} />}
        />
        <BottomTabBar activeTab="nutrition" onTabChange={() => {}} flatChatDisc />
      </div>
    </AppearanceProvider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
