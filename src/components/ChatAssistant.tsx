import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Send, MessageCircle, Sparkles, CheckCircle2, ArrowDown, RotateCcw, AlertCircle, Trash2 } from 'lucide-react'
import { generateChatResponse } from '@/lib/chat-assistant'
import { calculateCalories, getActiveMesocycleWeek } from '@/lib/calculations'
import { computeBMR, computeStaticTDEE } from '@/lib/macro-calculator'
import { getAppNow } from '@/lib/dev-clock'
import { supabase } from '@/lib/supabase'
import { getRecentLogs, formatLogsForAI, getRecentCardioLogs, formatCardioLogsForAI } from '@/lib/daily-tracking'
import { saveChatCache, loadChatCache, clearChatCache } from '@/lib/chat-cache'
import { swapPoolMeal, type MealSlotName } from '@/lib/meal-store'
import type { ChatMessage, UserProfile, MacroTargets, WorkoutDay, MealPlanDay, MesocycleWeek, PlanAction } from '@/lib/types'

const ACTION_TAG_RE = /\[ACTION:\s*.*?\]/gi
const QUICK_REPLIES_RE = /\[QUICK_REPLIES:\s*(.*?)\]/gi
const TRAILING_BRACKET_RE = /\[(?:ACTION|QUICK_REPLIES)[^\]]*$/i
const PAGE_SIZE = 20

function stripTags(text: string): string {
  return text.replace(ACTION_TAG_RE, '').replace(QUICK_REPLIES_RE, '').trim()
}

function stripStreamingTags(text: string): string {
  let cleaned = text.replace(ACTION_TAG_RE, '').replace(QUICK_REPLIES_RE, '')
  cleaned = cleaned.replace(TRAILING_BRACKET_RE, '')
  cleaned = cleaned
    .split('\n')
    .filter(line => {
      const l = line.trim()
      if (/assigned \((ADD|REMOVE|MOVE)\)/i.test(l)) return false
      if (/no fatigue conflicts detected/i.test(l)) return false
      if (/active training days configured/i.test(l)) return false
      if (/RECALIBRATED —/.test(l)) return false
      if (/^Schedule updated —/.test(l)) return false
      return true
    })
    .join('\n')
  return cleaned.trim()
}

function extractQuickReplies(text: string): string[] {
  const match = QUICK_REPLIES_RE.exec(text)
  QUICK_REPLIES_RE.lastIndex = 0
  if (!match) return []
  return match[1]
    .split('|')
    .map(opt => opt.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}

interface FavoriteMeal {
  name: string
  meal_slot: string
  times_used: number
}

interface ChatAssistantProps {
  profile: UserProfile
  /** Living targets from computeTargets (M0) — the SAME numbers the Nutrition tab shows, respecting the user's selected macro mode. */
  macros: MacroTargets
  exercisePlan: WorkoutDay[]
  mesocycle: MesocycleWeek[]
  /** When the CURRENT plan was generated — the live-week anchor (C0 Part 6). Falls back to profile.created_at upstream. */
  planCreatedAt?: string
  mealPlan: MealPlanDay[]
  exerciseExclusions: string[]
  /** Latest daily_metrics weigh-in — keeps the chat's bmr/tdee/weight context in lockstep with the Nutrition tab (living targets, M0). */
  latestWeightKg?: number | null
  onPlanUpdate: (action: PlanAction) => void | Promise<void>
  onLogsUpdated?: () => void
  /** Fired when a chat log_weight action lands so the app recomputes living targets. */
  onWeightLogged?: () => void | Promise<void>
}

export function ChatAssistant({ profile, macros, exercisePlan, mesocycle, planCreatedAt, mealPlan, exerciseExclusions, latestWeightKg, onPlanUpdate, onLogsUpdated, onWeightLogged }: ChatAssistantProps) {
  const buildInitialGreeting = (): string => {
    const now = new Date()
    const hour = now.getHours()
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
    const todaySession = exercisePlan.find(d => d.day === dayName)
    const name = profile.display_name || ''
    const persona = profile.coaching_persona || 'supportive'

    const trainingTime = profile.preferred_time || 'morning'
    const sessionPassedCutoff: Record<string, number> = {
      morning: 13,
      midday: 16,
      evening: 21,
      night: 23,
      varies: 22,
    }
    const cutoff = sessionPassedCutoff[trainingTime] || 22

    const getNextSession = () => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      for (let i = 1; i <= 7; i++) {
        const nextDay = days[(now.getDay() + i) % 7]
        const session = exercisePlan.find(d => d.day === nextDay)
        if (session) return { day: nextDay, session, daysAway: i }
      }
      return null
    }

    const greetByPersona = (): string => {
      switch (persona) {
        case 'drill_sergeant':
          return name ? `Listen up, ${name}.` : `Listen up.`
        case 'analytical':
          return name ? `Good to see you, ${name}.` : `Good to see you.`
        case 'hype':
          return name ? `LET'S GO ${name}! 🔥` : `LET'S GO! 🔥`
        case 'supportive':
        default:
          return name ? `Hey ${name}!` : `Hey there!`
      }
    }

    const signOff = (): string => {
      switch (persona) {
        case 'drill_sergeant':
          return `\n\nNo excuses. Ask me about your meals, macros, or plan changes — I'm watching.`
        case 'analytical':
          return `\n\nI can assist with meal plans, macro analysis, recovery optimization, or plan adjustments.`
        case 'hype':
          return `\n\nYou can ask me ANYTHING — meals, macros, recovery, plan changes. WE'RE IN THIS TOGETHER! 💪`
        case 'supportive':
        default:
          return `\n\nYou can also ask me about your meals, macros, recovery, or request plan changes anytime.`
      }
    }

    if (todaySession) {
      const movements = todaySession.exercises.map(e => e.name).slice(0, 3).join(', ')
      const exerciseList = `**${todaySession.focus}** (${movements}${todaySession.exercises.length > 3 ? '...' : ''})`

      if (hour >= cutoff) {
        const next = getNextSession()
        const nextLine = next
          ? `\n\nLooking ahead, your next session is **${next.session.focus}** on ${next.day}.`
          : ''
        switch (persona) {
          case 'drill_sergeant':
            return `${greetByPersona()} Your ${trainingTime} ${exerciseList} session was today. Did you execute, or do I need to hear your excuse?${nextLine}${signOff()}`
          case 'analytical':
            return `${greetByPersona()} Today's ${trainingTime} ${exerciseList} session window has closed. I'd like to log your completion data — did you train as prescribed?${nextLine}${signOff()}`
          case 'hype':
            return `${greetByPersona()} You had a ${trainingTime} ${exerciseList} session today! Tell me you CRUSHED IT! 🏆${nextLine}${signOff()}`
          default:
            return `${greetByPersona()} You had a ${trainingTime} ${exerciseList} session on the cards today.\n\nHow did it go? Let me know if you crushed it, skipped it, or need to reschedule.${nextLine}${signOff()}`
        }
      }

      switch (persona) {
        case 'drill_sergeant':
          return `${greetByPersona()} It's ${dayName}. You have a ${trainingTime} session: ${exerciseList}. No negotiation — get it done. Need adjustments? Speak now.${signOff()}`
        case 'analytical':
          return `${greetByPersona()} Today (${dayName}) your program prescribes a ${trainingTime} session: ${exerciseList}. Are all parameters nominal, or do we need to adjust variables based on recovery status?${signOff()}`
        case 'hype':
          return `${greetByPersona()} Happy ${dayName}! You've got a FIRE session coming up: ${exerciseList} (${trainingTime}). This is YOUR day to dominate! Ready to GO?! 💥${signOff()}`
        default:
          return `${greetByPersona()} Happy ${dayName}! Looking at your profile, you have a ${trainingTime} session scheduled today: ${exerciseList}.\n\nAre you ready to get after it, or do we need to make any adjustments based on how your body is feeling?${signOff()}`
      }
    }

    const next = getNextSession()
    const nextLine = next
      ? ` Your next session is **${next.session.focus}** on ${next.day}.`
      : ''

    switch (persona) {
      case 'drill_sergeant':
        return `${greetByPersona()} It's ${dayName} — rest day. Use it wisely: hydrate, stretch, sleep.${nextLine} Don't get comfortable.${signOff()}`
      case 'analytical':
        return `${greetByPersona()} ${dayName} is programmed as a recovery day — optimal for parasympathetic restoration.${nextLine} Active recovery (walking, mobility) is recommended.${signOff()}`
      case 'hype':
        return `${greetByPersona()} Happy ${dayName}! Rest day — your muscles are GROWING right now! 📈${nextLine} Fuel up, hydrate, and get ready for what's next!${signOff()}`
      default:
        return `${greetByPersona()} Happy ${dayName}! Today is a rest day on your schedule — perfect for recovery and mobility work.${nextLine}${signOff()}`
    }
  }

  // Lazy init: restore the last-seen conversation from the synchronous
  // localStorage mirror instantly, before the (async, fire-and-forget-backed)
  // Supabase history fetch below even starts — see chat-cache.ts for why this
  // matters (the DB write for the most recent reply can race a chat-suggested
  // external link's tab backgrounding and never land).
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const cached = profile.id ? loadChatCache(profile.id) : null
    return cached ?? [
      {
        role: 'assistant',
        content: buildInitialGreeting(),
        status: 'complete',
      }
    ]
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRecalibrating, setIsRecalibrating] = useState(false)
  const [useAI, setUseAI] = useState(true)
  const [lastFailedInput, setLastFailedInput] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<FavoriteMeal[]>([])
  const [workoutLogHistory, setWorkoutLogHistory] = useState('')
  const [cardioLogHistory, setCardioLogHistory] = useState('')
  const [quickRepliesDismissed, setQuickRepliesDismissed] = useState(false)
  const [showScrollPill, setShowScrollPill] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const isFirstRenderRef = useRef(true)

  const checkIfNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: smooth ? 'smooth' : 'instant',
        })
      }
    })
  }, [])

  // Fix #6: ResizeObserver-based scroll instead of setTimeout/useEffect[messages]
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (isNearBottomRef.current) {
        scrollToBottom()
        setShowScrollPill(false)
      } else if (!isFirstRenderRef.current) {
        setShowScrollPill(true)
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToBottom])

  useEffect(() => {
    if (isFirstRenderRef.current && messages.length > 0 && historyLoaded) {
      isFirstRenderRef.current = false
      scrollToBottom()
      setShowScrollPill(false)
    }
  }, [messages.length, historyLoaded, scrollToBottom])

  const handleScroll = useCallback(() => {
    const nearBottom = checkIfNearBottom()
    isNearBottomRef.current = nearBottom
    if (nearBottom) setShowScrollPill(false)
  }, [checkIfNearBottom])

  useEffect(() => {
    if (profile.id) {
      loadFavorites()
      loadWorkoutLogs()
      loadChatHistory()
    }
  }, [profile.id])

  // Synchronous write-through mirror (see chat-cache.ts) — fires on every
  // messages change, so the cache is never behind what's rendered on screen
  // even if the corresponding Supabase write never completes.
  useEffect(() => {
    if (profile.id) saveChatCache(profile.id, messages)
  }, [profile.id, messages])

  // Fix #3: Last 20 messages, no date filter, includes id + status + created_at
  const loadChatHistory = async () => {
    if (!profile.id) return
    try {
      const { data, count } = await supabase
        .from('chat_messages')
        .select('id, role, content, action_data, status, created_at', { count: 'exact' })
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (data && data.length > 0) {
        const loaded: ChatMessage[] = data.reverse().map(row => ({
          id: row.id,
          role: row.role as 'user' | 'assistant',
          content: row.content,
          status: (row.status || 'complete') as ChatMessage['status'],
          action: row.action_data as PlanAction | undefined,
          created_at: row.created_at,
        }))
        // Never regress below what the localStorage-cache-restored state
        // already shows — the DB fetch can legitimately be behind if the
        // most recent write(s) hadn't landed yet (see chat-cache.ts). A
        // shorter DB result means it's missing something the user already
        // saw, not that the conversation actually shrank.
        setMessages(prev => (loaded.length >= prev.length ? loaded : prev))
        setHasMoreMessages((count ?? 0) > PAGE_SIZE)
      }
      setHistoryLoaded(true)
    } catch (err) {
      console.error('Failed to load chat history:', err)
      setHistoryLoaded(true)
    }
  }

  const loadOlderMessages = async () => {
    if (!profile.id || isLoadingOlder) return
    setIsLoadingOlder(true)
    try {
      const oldestMsg = messages[0]
      const cursor = oldestMsg?.created_at
      if (!cursor) { setHasMoreMessages(false); setIsLoadingOlder(false); return }

      const { data } = await supabase
        .from('chat_messages')
        .select('id, role, content, action_data, status, created_at')
        .eq('profile_id', profile.id)
        .lt('created_at', cursor)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (data && data.length > 0) {
        const older: ChatMessage[] = data.reverse().map(row => ({
          id: row.id,
          role: row.role as 'user' | 'assistant',
          content: row.content,
          status: (row.status || 'complete') as ChatMessage['status'],
          action: row.action_data as PlanAction | undefined,
          created_at: row.created_at,
        }))
        const scrollEl = scrollRef.current
        const prevHeight = scrollEl?.scrollHeight || 0
        setMessages(prev => [...older, ...prev])
        requestAnimationFrame(() => {
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight
          }
        })
        setHasMoreMessages(data.length === PAGE_SIZE)
      } else {
        setHasMoreMessages(false)
      }
    } catch (err) {
      console.error('Failed to load older messages:', err)
    } finally {
      setIsLoadingOlder(false)
    }
  }

  const loadWorkoutLogs = async () => {
    if (!profile.id) return
    try {
      const [logs, cardioLogs] = await Promise.all([
        getRecentLogs(profile.id, 14),
        getRecentCardioLogs(profile.id, 14),
      ])
      setWorkoutLogHistory(formatLogsForAI(logs))
      setCardioLogHistory(formatCardioLogsForAI(cardioLogs))
    } catch (err) {
      console.error('Failed to load workout logs:', err)
    }
  }

  const loadFavorites = async () => {
    if (!profile.id) return
    const { data } = await supabase
      .from('favorite_meals')
      .select('name, meal_slot, times_used')
      .eq('profile_id', profile.id)
      .order('times_used', { ascending: false })
      .limit(5)
    if (data) setFavorites(data)
  }

  const upsertFavorite = async (action: { new_item: string; meal_slot: string; protein: number; carbs: number; fat: number; portion_size?: string; prep?: string }) => {
    if (!profile.id) return

    const calories = calculateCalories(action.protein, action.carbs, action.fat)

    const { data: existing } = await supabase
      .from('favorite_meals')
      .select('id, times_used')
      .eq('profile_id', profile.id)
      .eq('name', action.new_item)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('favorite_meals')
        .update({
          times_used: existing.times_used + 1,
          last_used_at: new Date().toISOString(),
          meal_slot: action.meal_slot,
          calories,
          protein: action.protein,
          carbs: action.carbs,
          fat: action.fat,
          portion_size: action.portion_size || null,
          prep: action.prep || null,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('favorite_meals')
        .insert({
          profile_id: profile.id,
          name: action.new_item,
          meal_slot: action.meal_slot,
          calories,
          protein: action.protein,
          carbs: action.carbs,
          fat: action.fat,
          portion_size: action.portion_size || null,
          prep: action.prep || null,
        })
    }

    loadFavorites()
  }

  // Fix #4: System prompt context assembled once per call, separate from conversation window
  const buildContext = () => {
    const activeWeek = getActiveMesocycleWeek(planCreatedAt ?? profile.created_at, getAppNow(profile.id), mesocycle.length > 0 ? mesocycle.length : 4)
    const activeWeekData = mesocycle.length > 0
      ? mesocycle.find(w => w.week_number === activeWeek)?.days || exercisePlan
      : exercisePlan

    const exerciseSummary = activeWeekData
      .map(d => `${d.day}: ${d.focus} - ${d.exercises.map(e => `${e.name} (${e.sets}x${e.reps}, rest ${e.rest})`).join(', ')}`)
      .join('\n')

    const mealSummary = mealPlan
      .map(m => `${m.meal}: ${m.items.map(i => `${i.name} (${i.calories} kcal, P:${i.protein}g C:${i.carbs}g F:${i.fat}g)`).join(', ')}`)
      .join('\n')

    const favoritesSummary = favorites.length > 0
      ? favorites.map(f => `- ${f.name} (${f.meal_slot}, used ${f.times_used}x)`).join('\n')
      : ''

    const now = new Date()
    const currentTimeFormatted = now.toLocaleDateString('en-US', { weekday: 'long' }) + ' ' +
      now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const todayStr = now.toISOString().slice(0, 10)
    const workoutLoggedToday = workoutLogHistory.includes(todayStr)

    const effectiveWeightKg = latestWeightKg != null && latestWeightKg > 0 ? latestWeightKg : profile.weight_kg
    const liveBmr = computeBMR({ ...profile, weight_kg: effectiveWeightKg })
    const liveTdee = computeStaticTDEE(liveBmr, profile.activity_level)

    return {
      current_date: now.toISOString(),
      current_time_formatted: currentTimeFormatted,
      workout_logged_today: workoutLoggedToday,
      day_of_week: now.toLocaleDateString('en-US', { weekday: 'long' }),
      profile_id: profile.id || '',
      profile: {
        age: profile.age,
        gender: profile.gender,
        height_cm: profile.height_cm,
        // Living targets (M0): current weight and live-computed BMR/TDEE,
        // not the frozen onboarding columns — the chat's numbers must match
        // the Nutrition tab exactly.
        weight_kg: effectiveWeightKg,
        activity_level: profile.activity_level,
        fitness_goal: profile.fitness_goal,
        preferred_time: profile.preferred_time,
        bmr: liveBmr,
        tdee: liveTdee,
      },
      session_duration_preference: profile.session_duration_preference,
      workout_split_preference: profile.workout_split_preference,
      coaching_persona: profile.coaching_persona || 'supportive',
      display_name: profile.display_name || '',
      macros,
      dietary_preferences: profile.dietary_preferences || [],
      concurrent_activities: profile.concurrent_activities || [],
      // weekly_schedule intentionally no longer sent (trace-report fix): the
      // edge function stopped reading it from context — it only ever fed a
      // field the update_workout_schedule tool wrote and nothing else read,
      // which could only desync from the mesocycle the Exercise tab renders.
      exercise_exclusions: exerciseExclusions,
      training_days_count: profile.training_days.filter(d => d.available).length,
      exercise_summary: exerciseSummary,
      meal_summary: mealSummary,
      favorites_summary: favoritesSummary,
      workout_log_history: workoutLogHistory,
      cardio_log_history: cardioLogHistory,
    }
  }

  /** Returns true on a clean success, false on failure, or a correction-note string when the action succeeded but not exactly as the model's own reply text described (see the replace_food branch). */
  const applyPlanAction = async (action: PlanAction): Promise<boolean | string> => {
    if (!profile.id) return false

    if (action.type === 'log_weight') {
      // The edge function already wrote daily_metrics; the app just needs
      // to recompute living targets from the new latest weigh-in.
      await onWeightLogged?.()
      return true
    }

    if (action.type === 'replace_food') {
      // ONE meal-mutation layer (M0 Part 6): this is the same
      // meal-store.swapPoolMeal call the Meals tab's swap button makes. The
      // old body here wrote the deprecated meal_plans table directly (rows
      // that never matched on live) and then mutated the dead legacy
      // mealPlan state via onPlanUpdate — the exact disjoint chat write
      // path the discovery round flagged. swapPoolMeal is an honest M0
      // stub (always null until M1 fills the pools), so the chat appends
      // its standard "change was not applied" note instead of claiming a
      // swap happened.
      // Try the model's suggested new_item as an exact pool-option match
      // first (chooseName); meal-store falls back to nothing if it doesn't
      // match rather than silently picking something else — a mismatch
      // means the user asked for a specific dish outside the verified pool,
      // and the standard "action failed" text below is the honest response
      // (no unverified AI-invented meal is ever accepted into the plan).
      const applied = await swapPoolMeal(
        profile.id,
        action.meal_slot.toLowerCase() as MealSlotName,
        action.old_item,
        action.new_item,
        'chat',
      )
      if (!applied) return false

      await upsertFavorite({
        new_item: applied.name,
        meal_slot: action.meal_slot,
        protein: applied.macros.protein,
        carbs: applied.macros.carbs,
        fat: applied.macros.fat,
        portion_size: action.portion_size,
        prep: action.prep,
      })

      // The model's own reply text was generated before this ran and may
      // name a dish that isn't what the verified pool actually returned
      // (chooseName only matches when the model happened to guess an exact
      // pool option name — it has no visibility into the pool). Surface the
      // real result as a correction note rather than let an inaccurate
      // AI-written sentence stand as if it were true.
      return applied.name === action.new_item
        ? true
        : `Swapped to **${applied.name}** (${Math.round(applied.macros.calories)} kcal, ${Math.round(applied.macros.protein)}g protein) — the closest verified match in your meal pool for that slot.`
    }

    if (action.type === 'replace_exercise') {
      if (action.permanent !== false) {
        const { data, error } = await supabase
          .from('exercise_plans')
          .update({
            name: action.new_item,
            sets: action.sets,
            reps: action.reps,
            rest: action.rest,
          })
          .eq('profile_id', profile.id)
          .ilike('day', action.day)
          .ilike('name', `%${action.old_item}%`)
          .select('id')

        if (error) {
          console.error('Failed to update exercise plan:', error)
          return false
        }

        if (!data || data.length === 0) return false
      }

      onPlanUpdate(action)
      return true
    }

    if (action.type === 'adjust_volume') {
      const multipliers: Record<string, { sets: number; removeCount: number; halve?: boolean }> = {
        reduce_light: { sets: -1, removeCount: 0 },
        reduce_half: { sets: 0, removeCount: 0, halve: true },
        reduce_heavy: { sets: -2, removeCount: 1 },
        increase_moderate: { sets: 1, removeCount: 0 },
        increase_heavy: { sets: 2, removeCount: 0 },
      }
      const modifier = multipliers[action.adjustment] || { sets: 0, removeCount: 0 }

      const { data: exercises, error: fetchErr } = await supabase
        .from('exercise_plans')
        .select('id, sets, sort_order')
        .eq('profile_id', profile.id)
        .ilike('day', action.day)
        .order('sort_order', { ascending: true })

      if (fetchErr || !exercises || exercises.length === 0) {
        console.error('Failed to fetch exercises for volume adjustment:', fetchErr)
        return false
      }

      let toUpdate = exercises
      if (modifier.removeCount > 0 && exercises.length > modifier.removeCount) {
        const toRemove = exercises.slice(-modifier.removeCount)
        for (const ex of toRemove) {
          await supabase.from('exercise_plans').delete().eq('id', ex.id)
        }
        toUpdate = exercises.slice(0, -modifier.removeCount)
      }

      for (const ex of toUpdate) {
        const currentSets = ex.sets || 3
        const newSets = modifier.halve
          ? Math.max(1, Math.round(currentSets / 2))
          : Math.max(1, currentSets + modifier.sets)
        await supabase.from('exercise_plans').update({ sets: newSets }).eq('id', ex.id)
      }

      onPlanUpdate(action)
      return true
    }

    if (action.type === 'ban_exercise') {
      const exerciseName = (action as any).exercise_name || (action as any).old_item || ''
      if (exerciseName && profile.id) {
        const { data: profileRow } = await supabase
          .from('fitness_profiles')
          .select('exercise_exclusions')
          .eq('id', profile.id)
          .maybeSingle()
        const current: string[] = profileRow?.exercise_exclusions || []
        if (!current.includes(exerciseName)) {
          await supabase
            .from('fitness_profiles')
            .update({ exercise_exclusions: [...current, exerciseName] })
            .eq('id', profile.id)
        }
      }
      onPlanUpdate(action)
      return true
    }

    if (action.type === 'update_workout_schedule') {
      setIsRecalibrating(true)
      await onPlanUpdate(action)
      setIsRecalibrating(false)
      return true
    }

    if (action.type === 'log_workout_session') {
      // The edge function already wrote these sets into the unified store
      // (exercise_set_logs, session-linked) before this action arrived — the
      // pre-C0 client-side duplicate write is gone (single write path).
      // Just tell the exercise tab to refetch so the rows light up.
      onLogsUpdated?.()
      return true
    }

    return false
  }

  const callGemini = async (userMessage: string): Promise<{ reply: string; action?: PlanAction }> => {
    // Fix #4: Only send conversation turns (last 20), context goes separately as system prompt
    const history = messages
      .filter(m => m.status === 'complete' || m.status === undefined)
      .slice(1)
      .slice(-PAGE_SIZE)
      .map(m => ({ role: m.role, content: m.content }))

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-gemini`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: userMessage,
        history,
        context: buildContext(),
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      const errorType = errData.error_type || 'unknown'
      const userMsg = errData.user_message || ''
      if (errorType === 'ai_upstream') {
        throw { message: 'The AI service is temporarily unavailable.', retryable: true, userInput: userMsg }
      }
      if (errorType === 'content_filter') {
        return { reply: errData.reply || 'That triggered a content filter. Try rephrasing.', action: undefined }
      }
      throw { message: errData.error || `Request failed (${response.status})`, retryable: true, userInput: userMsg }
    }

    const data = await response.json()
    if (!data.reply || typeof data.reply !== 'string') {
      throw new Error('Invalid response from AI')
    }
    return { reply: data.reply, action: data.action }
  }

  // Helper: persist user message to Supabase (fire-and-forget)
  const persistUserMessage = (text: string) => {
    if (!profile.id) return
    supabase.from('chat_messages').insert({
      profile_id: profile.id,
      role: 'user',
      content: text,
      status: 'complete',
    }).then()
  }

  // Helper: insert placeholder for assistant response, returns its DB id
  const insertPlaceholder = async (): Promise<string | undefined> => {
    if (!profile.id) return undefined
    const { data } = await supabase
      .from('chat_messages')
      .insert({
        profile_id: profile.id,
        role: 'assistant',
        content: '',
        status: 'pending',
      })
      .select('id')
      .maybeSingle()
    return data?.id
  }

  // Helper: update placeholder row with final content
  const finalizePlaceholder = (placeholderId: string | undefined, content: string, status: 'complete' | 'failed', action?: PlanAction) => {
    if (!placeholderId || !profile.id) return
    supabase.from('chat_messages').update({
      content,
      status,
      action_data: action || null,
    }).eq('id', placeholderId).then()
  }

  // Helper: process an AI response and apply actions
  const processResponse = async (result: { reply: string; action?: PlanAction }): Promise<{ text: string; action?: PlanAction }> => {
    let responseText = result.reply
    let action = result.action

    // Fix #5: Only confirm action if mutation actually succeeds
    if (action) {
      try {
        const success = await applyPlanAction(action)
        if (success) {
          if (navigator.vibrate) navigator.vibrate([10, 50, 10])
          if (typeof success === 'string') responseText += `\n\n_${success}_`
        } else {
          responseText += '\n\n_Action failed — the change was not applied._'
          action = undefined
        }
      } catch (err) {
        console.error('Plan action failed:', err)
        responseText += '\n\n_Action failed — the change was not applied._'
        action = undefined
      }
    }

    return { text: responseText, action }
  }

  // Fix #2: Retry affordance for pending/failed messages
  const retryMessage = async (failedIndex: number) => {
    const failedMsg = messages[failedIndex]
    if (!failedMsg || failedMsg.role !== 'assistant' || isLoading) return

    const userMsg = messages.slice(0, failedIndex).reverse().find(m => m.role === 'user')
    if (!userMsg) return

    setIsLoading(true)
    setMessages(prev => prev.map((m, i) =>
      i === failedIndex ? { ...m, status: 'pending' as const, content: '' } : m
    ))

    if (failedMsg.id && profile.id) {
      supabase.from('chat_messages').update({ status: 'pending', content: '' }).eq('id', failedMsg.id).then()
    }

    try {
      const result = await callGemini(userMsg.content)
      const processed = await processResponse(result)
      const quickReplies = extractQuickReplies(processed.text)
      const cleanedText = stripTags(processed.text)

      setMessages(prev => prev.map((m, i) =>
        i === failedIndex ? {
          ...m,
          content: cleanedText,
          status: 'complete' as const,
          action: processed.action,
          quickReplies,
        } : m
      ))
      setQuickRepliesDismissed(false)
      setLastFailedInput(null)
      finalizePlaceholder(failedMsg.id, cleanedText, 'complete', processed.action)
    } catch {
      setMessages(prev => prev.map((m, i) =>
        i === failedIndex ? {
          ...m,
          content: '_Retry failed. Tap to try again._',
          status: 'failed' as const,
        } : m
      ))
      finalizePlaceholder(failedMsg.id, 'Response failed', 'failed')
    } finally {
      setIsLoading(false)
    }
  }

  // Fix #1: Full message lifecycle with placeholder
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return
    if (navigator.vibrate) navigator.vibrate(10)

    const userText = input.trim()
    const now = new Date().toISOString()
    const userMessage: ChatMessage = { role: 'user', content: userText, status: 'complete', created_at: now }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Save user message immediately (fire-and-forget, 0ms latency)
    persistUserMessage(userText)

    // Insert DB placeholder for assistant response
    const placeholderId = await insertPlaceholder()

    // Add pending placeholder to UI
    const placeholderMsg: ChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      status: 'pending',
    }
    setMessages(prev => [...prev, placeholderMsg])

    let responseText: string | undefined
    let action: PlanAction | undefined
    let failed = false

    if (useAI) {
      try {
        const result = await callGemini(userText)
        const processed = await processResponse(result)
        responseText = processed.text
        action = processed.action
        setLastFailedInput(null)
      } catch (err: unknown) {
        failed = true
        const error = err as { message?: string; retryable?: boolean }
        if (error.retryable || (err instanceof DOMException && err.name === 'AbortError')) {
          const isTimeout = err instanceof DOMException && err.name === 'AbortError'
          responseText = isTimeout
            ? '_That request took too long to process. Tap "Retry" to try again._'
            : `_${error.message || 'Something went wrong with the AI service. Tap "Retry" to try again.'}_`
          setLastFailedInput(userText)
        } else {
          console.error('Gemini API error, falling back to local:', err)
          failed = false
          responseText = generateChatResponse(userText, { profile, macros, exercisePlan, mealPlan })
        }
      }
    } else {
      responseText = generateChatResponse(userText, { profile, macros, exercisePlan, mealPlan })
    }

    const quickReplies = extractQuickReplies(responseText!)
    const cleanedText = stripTags(responseText!)
    const finalStatus = failed ? 'failed' as const : 'complete' as const
    const assistantMessage: ChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: cleanedText,
      status: finalStatus,
      action,
      quickReplies,
    }

    // Replace placeholder with final message
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === placeholderId && m.role === 'assistant' && m.status === 'pending')
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = assistantMessage
        return updated
      }
      return [...prev.filter(m => !(m.role === 'assistant' && m.status === 'pending' && !m.content)), assistantMessage]
    })
    setIsLoading(false)
    setQuickRepliesDismissed(false)

    finalizePlaceholder(placeholderId, cleanedText, finalStatus, action)
  }

  // Resets to a single fresh greeting: clears the in-memory list, the
  // localStorage mirror, and the server rows (so a reload doesn't resurrect
  // the old conversation via loadChatHistory).
  const handleClearChat = () => {
    if (!window.confirm('Clear this conversation? This cannot be undone.')) return
    setMessages([{ role: 'assistant', content: buildInitialGreeting(), status: 'complete' }])
    setHasMoreMessages(false)
    setQuickRepliesDismissed(false)
    setLastFailedInput(null)
    if (profile.id) {
      clearChatCache(profile.id)
      supabase.from('chat_messages').delete().eq('profile_id', profile.id).then()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleQuickReply = (text: string) => {
    if (isLoading) return
    if (navigator.vibrate) navigator.vibrate(10)
    setQuickRepliesDismissed(true)
    setInput(text)

    // Use the full lifecycle by delegating to the send flow
    setTimeout(() => {
      const el = document.querySelector<HTMLButtonElement>('[data-chat-send]')
      if (el) el.click()
    }, 0)
  }

  const getQuickRepliesForLastMessage = (): string[] => {
    if (quickRepliesDismissed || isLoading) return []
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') return []
    return lastMsg.quickReplies || []
  }

  const renderActionBadge = (action: PlanAction) => {
    if (action.type === 'replace_food') {
      return (
        <div className="flex items-center gap-2 mt-2 rounded-md border border-border bg-accent/50 px-3 py-2 text-xs">
          <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />
          <span className="text-accent-foreground">
            Plan updated: <strong>{action.old_item}</strong> replaced with <strong>{action.new_item}</strong> in {action.meal_slot}
            {action.is_verified && <span className="ml-1 text-green-600">(Verified)</span>}
          </span>
        </div>
      )
    }
    if (action.type === 'replace_exercise') {
      return (
        <div className="flex items-center gap-2 mt-2 rounded-md border border-border bg-accent/50 px-3 py-2 text-xs">
          <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />
          <span className="text-accent-foreground">
            Plan updated: <strong>{action.old_item}</strong> replaced with <strong>{action.new_item}</strong> on {action.day}
          </span>
        </div>
      )
    }
    if (action.type === 'update_workout_schedule') {
      const patchItems = Array.isArray(action.schedule_patch) ? action.schedule_patch : []
      const patchedDays = patchItems
        .map((item: { day: string; action: string; block_name: string }) => {
          if (item.action === 'REMOVE') return `${item.day}: Rest`
          if (item.action === 'ADD') return `${item.day}: +${item.block_name}`
          return `${item.day}: ${item.block_name}`
        })
        .join(', ')
      return (
        <div className="flex items-center gap-2 mt-2 rounded-md border border-border bg-accent/50 px-3 py-2 text-xs">
          <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />
          <span className="text-accent-foreground">
            Schedule updated: {patchedDays}
            {action.recalibrated_days && action.recalibrated_days.length > 0 && (
              <span className="ml-1 text-amber-600">({action.recalibrated_days.length} day{action.recalibrated_days.length > 1 ? 's' : ''} fatigue-adapted)</span>
            )}
          </span>
        </div>
      )
    }
    return null
  }

  const isInterrupted = (msg: ChatMessage) =>
    msg.role === 'assistant' && (msg.status === 'pending' || msg.status === 'streaming' || msg.status === 'failed')

  const markdownComponents = {
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
    h1: ({ children }: { children?: React.ReactNode }) => <p className="font-semibold mb-1">{children}</p>,
    h2: ({ children }: { children?: React.ReactNode }) => <p className="font-semibold mb-1">{children}</p>,
    h3: ({ children }: { children?: React.ReactNode }) => <p className="font-semibold mb-1">{children}</p>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">{children}</a>
    ),
  }

  return (
    <Card className="flex flex-col h-[600px] max-h-[80dvh]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-5 text-primary" />
            <CardTitle className="text-base">Fitness Assistant</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              aria-label="Clear chat"
              title="Clear chat"
            >
              <Trash2 className="size-3.5" />
            </Button>
            <Button
              variant={useAI ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseAI(prev => !prev)}
            >
              <Sparkles className="size-3" />
              {useAI ? 'AI On' : 'AI Off'}
            </Button>
          </div>
        </div>
        {useAI && (
          <Badge variant="secondary" className="w-fit text-xs mt-1">
            Powered by Gemini 3.5 Flash
          </Badge>
        )}
      </CardHeader>
      <Separator />
      <CardContent className="relative flex-1 flex flex-col p-0 overflow-hidden">
        <div
          className="flex-1 overflow-y-auto p-4 overscroll-contain"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          <div ref={contentRef} className="space-y-4">
            {hasMoreMessages && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={loadOlderMessages}
                  disabled={isLoadingOlder}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors min-h-[44px]"
                >
                  {isLoadingOlder ? 'Loading...' : 'Load Previous Messages'}
                </button>
              </div>
            )}
            {messages.map((msg, i) => {
              const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1
              const quickReplies = isLastAssistant ? getQuickRepliesForLastMessage() : []
              return (
                <div
                  key={msg.id || `msg-${i}`}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="max-w-[80%]">
                    <div
                      className={`rounded-lg px-4 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground whitespace-pre-wrap'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        stripStreamingTags(msg.content)
                      ) : isInterrupted(msg) && !msg.content ? (
                        /* Pending placeholder — show loading dots */
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <div className="flex gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                          </div>
                          {isRecalibrating ? (
                            <span className="text-xs">Recalibrating your schedule...</span>
                          ) : (
                            <span className="text-xs">Thinking...</span>
                          )}
                        </div>
                      ) : isInterrupted(msg) && msg.content ? (
                        /* Interrupted/failed with content — show content + retry */
                        <div>
                          <ReactMarkdown components={markdownComponents}>
                            {stripStreamingTags(msg.content)}
                          </ReactMarkdown>
                          <button
                            className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                            onClick={() => retryMessage(i)}
                            disabled={isLoading}
                          >
                            {msg.status === 'failed' ? <AlertCircle className="size-3" /> : <RotateCcw className="size-3" />}
                            {msg.status === 'failed' ? 'Response failed — tap to retry' : 'Response interrupted — tap to retry'}
                          </button>
                        </div>
                      ) : (
                        <ReactMarkdown components={markdownComponents}>
                          {stripStreamingTags(msg.content)}
                        </ReactMarkdown>
                      )}
                    </div>
                    {msg.action && msg.status !== 'failed' && renderActionBadge(msg.action)}
                    {/* Retry button for interrupted messages without content */}
                    {isInterrupted(msg) && !msg.content && !isLoading && (
                      <button
                        className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                        onClick={() => retryMessage(i)}
                      >
                        <RotateCcw className="size-3" />
                        Response interrupted — tap to retry
                      </button>
                    )}
                    {quickReplies.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {quickReplies.map(option => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => handleQuickReply(option)}
                            className="rounded-full border border-border bg-background px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/80 min-h-[44px]"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {!isLoading && lastFailedInput && (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => {
                    const retryText = lastFailedInput
                    setLastFailedInput(null)
                    setInput(retryText)
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] min-w-[44px]"
                >
                  <span>Response failed — tap to retry</span>
                </button>
              </div>
            )}
          </div>
        </div>
        {showScrollPill && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
            <button
              type="button"
              onClick={() => {
                scrollToBottom(true)
                setShowScrollPill(false)
                isNearBottomRef.current = true
              }}
              className="flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-2 text-xs shadow-lg hover:opacity-90 transition-opacity min-h-[44px] min-w-[44px]"
            >
              <ArrowDown className="size-3.5" />
              <span>Jump to latest</span>
            </button>
          </div>
        )}
        <div className="p-4 border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your plan or request changes..."
              className="min-h-[40px] max-h-[100px] resize-none"
              rows={1}
            />
            <Button data-chat-send onClick={sendMessage} disabled={!input.trim() || isLoading} size="icon" className="shrink-0 self-end">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
