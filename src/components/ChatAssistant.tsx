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
import { getExerciseEntry } from '@/lib/exercise-db'
import { createPendingAction, claimPendingAction, declinePendingAction, markExecuting, resolvePendingAction, getPendingAction, isWithinUndoWindow, type PendingActionReceipt } from '@/lib/pending-actions-store'
import { executeExerciseSwap, executeMealSwap, undoExerciseSwap, type ExerciseSwapPayload, type MealSwapPayload } from '@/lib/pending-action-executor'
import type { SwapScope } from '@/lib/mesocycle-edit'
import { useActiveSession } from '@/hooks/useActiveSession'
import { parseWorkoutEntries, type ParsedSetGroup, type WorkoutEntryInput } from '@/lib/set-parse'
import { executeLogWorkout } from '@/lib/nl-logging-executor'
import { normalizeExternalUrl } from '@/lib/chat-links'
import { createFact, createGoal, createContextFact, retireFact, retireContextFact, abandonGoal, type UserFactRow, type UserGoalRow, type UserContextFactRow } from '@/lib/memory-store'
import { resolveExerciseTarget, resolveFoodTarget } from '@/lib/fact-compiler'
import { checkFactConflict, checkGoalConflict } from '@/lib/memory-reconcile'
import { getPRCache } from '@/lib/pr-engine'
import { ProposalCard } from '@/components/chat/ProposalCard'
import { ReceiptCard } from '@/components/chat/ReceiptCard'
import { ClarificationCard } from '@/components/chat/ClarificationCard'
import type { ChatMessage, UserProfile, MacroTargets, WorkoutDay, MealPlanDay, MesocycleWeek, PlanAction, ChatPendingActionView, ChatReceiptView, ChatClarificationView } from '@/lib/types'

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
  /** Fired after a confirmed propose_exercise_swap executes — App.tsx's setMesocycle, since the executor is pure and returns the new array rather than mutating App.tsx's state directly. */
  onMesocycleUpdated: (mesocycle: MesocycleWeek[]) => void
  /** Fired after a confirmed propose_meal_swap executes — mirrors App.tsx's handleSwapMealSlot's setManualMealPicks, the ONLY thing that makes a swapped-in pool option actually render as today's pick. Without this the receipt would claim a swap the Meals/Nutrition tab never shows — exactly the incident this framework exists to prevent. */
  onMealSwapApplied: (slot: MealSlotName, chosenName: string) => void
  /** Memory & goals (VISION-ARCHITECTURE.md §1) — active facts/goals/context, loaded by App.tsx alongside the profile. Read-only here: resolveAndSaveMemory writes through memory-store directly and calls onMemoryChanged so App.tsx re-fetches, the same "the client is the only writer, the caller reloads after" shape pending_actions uses. */
  memoryFacts: UserFactRow[]
  memoryGoals: UserGoalRow[]
  memoryContextFacts: UserContextFactRow[]
  onMemoryChanged: () => void | Promise<void>
  /** Deep-link target for a memory receipt's "View in memory" button. */
  onOpenMemory?: () => void
}

export function ChatAssistant({ profile, macros, exercisePlan, mesocycle, planCreatedAt, mealPlan, exerciseExclusions, latestWeightKg, onPlanUpdate, onLogsUpdated, onWeightLogged, onMesocycleUpdated, onMealSwapApplied, memoryFacts, memoryGoals, memoryContextFacts, onMemoryChanged, onOpenMemory }: ChatAssistantProps) {
  // NL logging (§3) writes through the SAME frozen session identity +
  // logSet facade SetGrid.tsx uses — never saveSet directly (see
  // nl-logging-executor.ts's own doc comment).
  const activeSession = useActiveSession()

  // Keyed by an in-memory resolverId, not persisted: holds the full
  // entries/groups for a log_workout turn that hit a BLOCKING ambiguity, so
  // answering one ClarificationCard can re-parse and continue rather than
  // losing everything already resolved in that message. Ephemeral by
  // design, same as pendingAction/receipt/clarification on ChatMessage.
  const parseSessionsRef = useRef<Record<string, { entries: WorkoutEntryInput[]; todaysPlanExerciseNames: string[] }>>({})

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
      // Memory & goals (VISION-ARCHITECTURE.md §1) — display_text only
      // (never raw_phrase/ids): this is prompt context, not a data dump.
      // Lets the model avoid re-asking/re-recording something already
      // known, and consumes context facts (tone) — the ONLY place they're
      // ever read, matching the "class='context' is unreachable by
      // anything plan-affecting" structural barrier.
      active_facts: memoryFacts.map(f => f.display_text),
      active_goals: memoryGoals.map(g => g.display_text),
      context_facts: memoryContextFacts.map(c => c.display_text),
      training_days_count: profile.training_days.filter(d => d.available).length,
      exercise_summary: exerciseSummary,
      meal_summary: mealSummary,
      favorites_summary: favoritesSummary,
      workout_log_history: workoutLogHistory,
      cardio_log_history: cardioLogHistory,
    }
  }

  /**
   * Returns true on a clean success, false on failure. replace_food,
   * replace_exercise, adjust_volume, and update_workout_schedule are gone
   * from this switch entirely — replace_food/replace_exercise are
   * categorically superseded by propose_meal_swap/propose_exercise_swap
   * (Part 3), and adjust_volume/update_workout_schedule's server-side
   * tools were already unconditionally declined before this round, making
   * their client branches dead weight rather than reachable-but-disabled
   * code. Neither the log_weight action's own doc note nor a correction-
   * string return path is needed anymore now that replace_food's mismatch-
   * surfacing logic left with it.
   */
  const applyPlanAction = async (action: PlanAction): Promise<boolean | string> => {
    if (!profile.id) return false

    if (action.type === 'log_weight') {
      // The edge function already wrote daily_metrics; the app just needs
      // to recompute living targets from the new latest weigh-in.
      await onWeightLogged?.()
      return true
    }

    if (action.type === 'ban_exercise') {
      // Vision-architecture patch round, fix 4: this used to write
      // exercise_exclusions here (from a fresh DB read) AND App.tsx's
      // handleBanExercise wrote it again moments later (from possibly-stale
      // exerciseExclusions React state), so the second write could clobber
      // the first. Single write path now: this branch only forwards the
      // action; handleBanExercise does the one fresh-read-then-write.
      onPlanUpdate(action)
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

    if (action.type === 'log_workout_set') {
      // Same single-write-path pattern as log_workout_session, just for one
      // set (chat-gemini/index.ts's log_workout_set handler). Fix 3
      // (vision-architecture patch round): this type was missing from the
      // PlanAction union, so applyPlanAction fell through to `return false`
      // below and the user was told "Action failed" about a write that had
      // already landed.
      onLogsUpdated?.()
      return true
    }

    return false
  }

  /**
   * VISION-ARCHITECTURE.md §2 — the edge function response shape is
   * extending across commits C9-C16 to also carry `pendingAction` (a
   * plan-mutation proposal, action_class='plan_mutation'), `receipt` (an
   * immediate append-only write already applied, e.g. natural-language
   * logging), or `offer` (D3: a non-imperative statement downgraded from a
   * proposal — a suggestion chip, no pending row, no Confirm button). None
   * of the new tools exist yet as of this commit, so these fields are
   * always undefined in practice until then — the type is ready ahead of
   * the server emitting it, same as imperative-classifier.ts/set-parse.ts
   * being built before anything calls them.
   */
  interface ChatApiResponse {
    reply: string
    action?: PlanAction
    // I1: the edge function returns INTENT only, never a pending_actions
    // row — that table has exactly one writer (the client). `proposal` is
    // the raw material for createPendingAction, not an already-created
    // row; processResponse is what actually inserts it and only then has
    // a real id to render a ProposalCard against.
    proposal?: {
      kind: string
      // propose_meal_swap: server can cheaply build the full shape (pool
      // data is a simple REST fetch, no client-only TS modules needed).
      scopeKey?: string
      preconditions?: Record<string, unknown>
      payload?: Record<string, unknown>
      preImage?: unknown
      diff?: import('@/lib/pending-actions-store').ProposalDiff
      // propose_exercise_swap: recomputing a load preview needs
      // mesocycle-edit.ts/load-prescription.ts, which only exist in the
      // client's module graph — the server sends raw validated args only,
      // and the client builds scopeKey/preconditions/payload/diff itself
      // (buildExerciseSwapProposal) before ever calling createPendingAction.
      rawArgs?: Record<string, unknown>
    }
    receipt?: ChatReceiptView
    offer?: { text: string }
    // Wire shape matches the log_workout tool schema's snake_case param
    // names verbatim (Gemini function-call args come back exactly as
    // declared) — mapped to WorkoutEntryInput's camelCase at the one
    // boundary that consumes it (resolveAndMaybeLog), not here.
    logWorkout?: { date: string | null; entries: { raw_text: string; exercise_phrase: string; sets_phrase: string }[] }
    // Memory & goals (VISION-ARCHITECTURE.md §1 Part 2) — I1 holds: the
    // server never writes user_facts/user_goals/user_context_facts, it
    // forwards the validated tool args. resolveAndSaveMemory resolves
    // targets, checks a baseline, runs reconciliation, and only then writes.
    memoryIntent?: { tool: 'record_fact' | 'record_goal' | 'record_context_fact'; rawArgs: Record<string, unknown> }
  }

  const callGemini = async (userMessage: string): Promise<ChatApiResponse> => {
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
    // An EMPTY string is a legitimate reply — log_workout returns "" on
    // purpose (D1: the client's own client-authored copy replaces it once
    // it decides RECEIPT vs CLARIFICATION). Only a missing/non-string reply
    // is malformed; the old `!data.reply` truthiness check rejected "" and
    // fell back to the local canned response, silently skipping the whole
    // logWorkout payload — caught in browser verification.
    if (typeof data.reply !== 'string') {
      throw new Error('Invalid response from AI')
    }
    return { reply: data.reply, action: data.action, proposal: data.proposal, receipt: data.receipt, offer: data.offer, logWorkout: data.logWorkout }
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

  /** Client-authored copy for a proposal turn — D1 means the model's own text for this turn is never rendered, only this. Generic across every propose_* kind: the headline row is always diff.rows[0]. */
  const describeProposalClientSide = (pendingAction: ChatPendingActionView): string => {
    const headline = pendingAction.diff.rows[0]
    if (!headline) return "Here's a change I can make:"
    return `I can swap **${headline.before}** for **${headline.after}**:`
  }

  /**
   * VISION-ARCHITECTURE.md §2.4 — builds propose_exercise_swap's diff
   * CLIENT-side (the server only validated + classified via D2 and sent
   * raw args back; recomputing a load preview needs mesocycle-edit.ts,
   * which doesn't exist in the edge function's module graph). Returns null
   * on anything that doesn't resolve against the LIVE plan — that's an
   * honest "I can't propose this" rather than a card with fabricated
   * before/after values.
   *
   * The load preview is deliberately a note, not a number: precisely
   * mirroring recomputeLoad's logged-history-then-prescribeLoad
   * composition here would duplicate real logic (progression-engine
   * lookups, isMainLiftSlot's private heuristic) for a value that gets
   * superseded the instant the swap actually executes anyway (C8's
   * executeExerciseSwap already calls the real recomputeLoad at confirm
   * time) — showing an approximate number pre-confirm risks being wrong
   * in a way "recomputed when applied" never is.
   */
  const buildExerciseSwapProposal = (rawArgs: Record<string, unknown>): {
    scopeKey: string
    preconditions: Record<string, unknown>
    payload: ExerciseSwapPayload
    preImage: MesocycleWeek[]
    diff: import('@/lib/pending-actions-store').ProposalDiff
  } | null => {
    const dayArg = String(rawArgs.day ?? '')
    const oldItem = String(rawArgs.old_item ?? '')
    const newItem = String(rawArgs.new_item ?? '')
    if (!dayArg || !oldItem || !newItem || mesocycle.length === 0) return null

    const week = mesocycle.find(w => w.week_number === activeSession.liveWeek)
    const day = week?.days.find(d => d.day.toLowerCase() === dayArg.toLowerCase())
    if (!day) return null
    const exIndex = day.exercises.findIndex(e => e.name.toLowerCase() === oldItem.toLowerCase())
    if (exIndex === -1) return null
    const oldEx = day.exercises[exIndex]
    const newEntry = getExerciseEntry(newItem)
    if (!newEntry) return null

    const scope: SwapScope = rawArgs.scope === 'permanent' ? 'permanent' : 'today'
    const payload: ExerciseSwapPayload = {
      weekNumber: activeSession.liveWeek,
      dayName: day.day,
      exIndex,
      oldExerciseName: oldEx.name,
      newExerciseName: newEntry.name,
      scope,
    }

    return {
      scopeKey: `${profile.id}:propose_exercise_swap:${day.day}:${exIndex}`,
      preconditions: { day: day.day, exIndex, currentExerciseName: oldEx.name },
      payload,
      preImage: mesocycle,
      diff: {
        rows: [{ field: 'Exercise', before: oldEx.name, after: newEntry.name }],
        unchanged: [`${day.day}'s other ${day.exercises.length - 1} exercise${day.exercises.length - 1 === 1 ? '' : 's'}`, `Sets × reps: ${oldEx.sets}×${oldEx.reps}`],
        implications: [{ severity: 'info', text: 'Load recomputed for the new movement once you confirm.' }],
        rationale: typeof rawArgs.reason === 'string' ? rawArgs.reason : undefined,
        editable: [{ field: 'scope', options: ['today', 'permanent'] }],
        reversible: true,
      },
    }
  }

  /**
   * VISION-ARCHITECTURE.md §3.1/§3.4 — runs the deterministic parser over a
   * log_workout turn's entries and decides RECEIPT vs CLARIFICATION.
   * Nothing writes until every BLOCKING ambiguity is resolved (a partially-
   * parsed message never silently logs half of what was said). Only one
   * clarification is asked at a time; answering it re-parses the full
   * entries array (session-held in parseSessionsRef), which may surface
   * another before finally logging.
   */
  /**
   * VISION-ARCHITECTURE.md §1 Part 2 — resolves a record_fact/record_goal/
   * record_context_fact intent and writes it. IMMEDIATE-style (log_workout's
   * pattern), not a pending_actions proposal: memory rows are append-only
   * observations about the user, not plan mutations, so there's nothing to
   * "claim" — but every write still produces a receipt with undo, never a
   * silent save (Part 2: "no silent writes").
   *
   * Three ways this can end WITHOUT writing anything: an unresolved
   * exercise target (asks which one), a measurable goal with no baseline
   * anywhere (asks for one — the model can re-call record_goal next turn
   * once it has the number), or a reconciliation conflict (asks instead of
   * guessing which fact is current).
   */
  const resolveAndSaveMemory = async (intent: { tool: 'record_fact' | 'record_goal' | 'record_context_fact'; rawArgs: Record<string, unknown> }): Promise<{ text: string; receipt?: ChatReceiptView }> => {
    const args = intent.rawArgs
    const profileId = profile.id
    if (!profileId) return { text: "I can't save that yet — your profile hasn't finished setting up." }

    if (intent.tool === 'record_context_fact') {
      const displayText = String(args.display_text || '').trim()
      const rawPhrase = String(args.origin_verbatim_quote || '').trim()
      if (!displayText || !rawPhrase) return { text: '' }
      const row = await createContextFact({ profileId, source: 'chat', rawPhrase, displayText })
      await onMemoryChanged()
      return {
        text: `Saved: ${displayText}`,
        receipt: {
          kind: 'memory_context_fact_saved',
          title: 'Saved to memory',
          rows: [{ label: 'Noted', detail: displayText }],
          status: 'done',
          undoToken: row.id,
          resolvedAt: new Date().toISOString(),
        },
      }
    }

    if (intent.tool === 'record_fact') {
      const kind = String(args.kind || '') as UserFactRow['kind']
      const rawPhrase = String(args.origin_verbatim_quote || '').trim()
      if (!rawPhrase) return { text: '' }

      if (kind === 'food_preference' || kind === 'exercise_preference') {
        const polarity = (args.polarity === 'like' ? 'like' : 'dislike') as 'like' | 'dislike'
        const hardness = (args.hardness === 'hard' ? 'hard' : 'soft') as 'hard' | 'soft'
        const targetPhrase = String(args.target_phrase || '').trim()
        if (!targetPhrase) return { text: "What should I remember that about, specifically?" }

        const resolution = kind === 'exercise_preference' ? resolveExerciseTarget(targetPhrase) : { resolution: 'resolved' as const, resolvedRefs: resolveFoodTarget(targetPhrase) }
        if (resolution.resolution === 'unresolved') {
          return { text: `I don't recognize "${targetPhrase}" as an exercise — could you name it the way it appears on your plan?` }
        }

        const conflict = checkFactConflict({ kind, polarity, resolvedRefs: resolution.resolvedRefs }, memoryFacts)
        if (conflict.needsConfirmation) return { text: conflict.message }

        const displayText = `${polarity === 'dislike' ? (hardness === 'hard' ? "won't eat/do" : 'not keen on') : (hardness === 'hard' ? 'always wants' : 'prefers')} ${targetPhrase}`
        const row = await createFact({
          profileId, kind, source: 'chat', rawPhrase, displayText,
          polarity, hardness, resolvedRefs: resolution.resolvedRefs,
        })
        await onMemoryChanged()
        const effect = kind === 'exercise_preference' && hardness === 'hard'
          ? `excludes ${resolution.resolvedRefs.length} exercise${resolution.resolvedRefs.length === 1 ? '' : 's'} from your plan`
          : hardness === 'hard' ? 'excluded from your meals' : 'recorded — biases suggestions, nothing removed'
        return {
          text: `Saved: ${displayText}`,
          receipt: {
            kind: 'memory_fact_saved',
            title: 'Saved to memory',
            rows: [{ label: displayText, detail: effect }],
            status: 'done',
            undoToken: row.id,
            resolvedAt: new Date().toISOString(),
          },
        }
      }

      if (kind === 'timing_rule') {
        const timingSubject = String(args.timing_subject || '').trim()
        const timingAnchor = args.timing_anchor === 'training' ? 'training' : 'slot'
        const timingSlot = ['breakfast', 'lunch', 'dinner', 'snack'].includes(String(args.timing_slot)) ? (args.timing_slot as UserFactRow['timing_slot']) : null
        if (!timingSubject || (timingAnchor === 'slot' && !timingSlot)) {
          return { text: "Which meal slot should that apply to?" }
        }
        const displayText = `${args.timing_relation === 'after' ? 'no' : 'no'} ${timingSubject} ${args.timing_relation || 'before'} ${timingAnchor === 'training' ? 'training' : timingSlot}`
        const row = await createFact({
          profileId, kind, source: 'chat', rawPhrase, displayText,
          timingSubject, timingRelation: (args.timing_relation === 'after' ? 'after' : 'before'),
          timingAnchor, timingSlot: timingSlot ?? undefined,
        })
        await onMemoryChanged()
        return {
          text: `Saved: ${displayText}`,
          receipt: {
            kind: 'memory_fact_saved',
            title: 'Saved to memory',
            rows: [{
              label: displayText,
              detail: timingAnchor === 'slot' ? `applied to your ${timingSlot} pool` : 'recorded — not yet applied (needs day-context meal generation doesn\'t have yet)',
            }],
            status: 'done',
            undoToken: row.id,
            resolvedAt: new Date().toISOString(),
          },
        }
      }

      if (kind === 'hard_constraint') {
        const constraintKind = args.constraint_kind === 'equipment' ? 'equipment' : 'availability'
        const weekday = String(args.weekday || '')
        const description = String(args.description || '').trim()
        if (constraintKind === 'availability' && !weekday) return { text: 'Which day?' }
        const displayText = constraintKind === 'availability' ? `no gym ${weekday}s` : (description || 'equipment constraint')
        const row = await createFact({
          profileId, kind, source: 'chat', rawPhrase, displayText,
          constraintKind, weekday: constraintKind === 'availability' ? weekday : undefined,
        })
        await onMemoryChanged()
        return {
          text: `Saved: ${displayText}`,
          receipt: {
            kind: 'memory_fact_saved',
            title: 'Saved to memory',
            rows: [{ label: displayText, detail: constraintKind === 'availability' ? 'recorded — not yet applied (takes effect on your next plan regeneration)' : 'recorded' }],
            status: 'done',
            undoToken: row.id,
            resolvedAt: new Date().toISOString(),
          },
        }
      }
      return { text: '' }
    }

    // record_goal
    const metric = String(args.metric || '') as UserGoalRow['metric']
    const trackable = args.trackable === 'measurable' ? 'measurable' : 'directional'
    const rawPhrase = String(args.origin_verbatim_quote || '').trim()
    const metricRef = args.metric_ref ? String(args.metric_ref).trim() : undefined
    const targetValue = typeof args.target_value === 'number' ? args.target_value : undefined
    let baselineValue = typeof args.baseline_value === 'number' ? args.baseline_value : undefined
    let baselineSource: 'logged_data' | 'user_stated' | undefined = baselineValue != null ? 'user_stated' : undefined

    if (trackable === 'measurable' && baselineValue == null) {
      // "Using logged data where it already knows" — pr-engine's cache is
      // the one synchronous source of a lift's last-known max weight
      // (getLastSessionSets is async and gated to the one call site
      // useActiveSession.loadGhosts owns — F1 in test-no-forked-state.ts —
      // so this reuses the cache rather than adding a second fetcher).
      if ((metric === 'lift_working_kg' || metric === 'lift_1rm_kg') && metricRef && profileId) {
        const pr = getPRCache(profileId)[metricRef]
        if (pr) { baselineValue = pr.maxWeight; baselineSource = 'logged_data' }
      } else if (metric === 'body_weight_kg' && latestWeightKg != null) {
        baselineValue = latestWeightKg
        baselineSource = 'logged_data'
      }
    }

    if (trackable === 'measurable' && baselineValue == null) {
      return { text: `What's your current ${metricRef ? metricRef + ' ' : ''}number? I need a starting point before I can track progress toward that.` }
    }

    const knownLifts = { known_squat_kg: profile.known_squat_kg, known_bench_kg: profile.known_bench_kg, known_deadlift_kg: profile.known_deadlift_kg }
    const conflict = checkGoalConflict({ metric, metricRef, baselineValue }, memoryGoals, knownLifts)
    if (conflict.needsConfirmation) return { text: conflict.message }

    const displayText = trackable === 'directional'
      ? (String(args.description || '').trim() || 'directional goal')
      : `${metricRef ? metricRef + ' ' : ''}${metric.replace(/_/g, ' ')}: ${baselineValue} → ${targetValue}${args.target_date ? ` by ${args.target_date}` : ''}`

    const row = await createGoal({
      profileId, metric, trackable, metricRef, baselineValue, baselineSource,
      targetValue, targetDate: typeof args.target_date === 'string' ? args.target_date : undefined,
      source: 'chat', rawPhrase, displayText,
    })
    await onMemoryChanged()

    const trackingNote = trackable === 'directional'
      ? "I'll bias your plan toward this, but a directional goal like this can't be measured as a percentage — I won't report progress as a number."
      : baselineSource === 'logged_data' ? `Starting point pulled from your logged data: ${baselineValue}.` : `Starting point: ${baselineValue}.`

    return {
      text: `Saved: ${displayText}\n\n${trackingNote}`,
      receipt: {
        kind: 'memory_goal_saved',
        title: 'Goal saved',
        rows: [{ label: displayText, detail: trackable === 'directional' ? 'tracked directionally, not as a percentage' : 'baseline captured' }],
        status: 'done',
        undoToken: row.id,
        resolvedAt: new Date().toISOString(),
      },
    }
  }

  const resolveAndMaybeLog = (entries: WorkoutEntryInput[]): { text: string; receipt?: ChatReceiptView; clarification?: ChatClarificationView } => {
    const todaysWorkout = exercisePlan.find(d => d.day === activeSession.dayName)
    const todaysPlanExerciseNames = todaysWorkout?.exercises.map(e => e.name) ?? []
    const parsed = parseWorkoutEntries({ entries, todaysPlanExerciseNames })

    if (parsed.needsClarification) {
      const idx = parsed.groups.findIndex((g: ParsedSetGroup) => g.resolution === 'ambiguous' || !!g.ambiguity)
      const group = parsed.groups[idx]
      const resolverId = `parse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      parseSessionsRef.current[resolverId] = { entries, todaysPlanExerciseNames }

      const prompt = group.resolution === 'ambiguous'
        ? `Which "${group.matchedRawPhrase}" did you mean?`
        : group.ambiguity?.message ?? "I need one more detail before I can log this."
      const options = group.resolution === 'ambiguous' && group.ambiguousCandidates
        ? group.ambiguousCandidates.map(c => ({ label: c.name, value: c.name }))
        : []
      return { text: prompt, clarification: { prompt, options, resolverId } }
    }

    const todaysPlanSetCounts = new Map((todaysWorkout?.exercises ?? []).map(e => [e.name, e.sets] as const))
    const todaysPlanLoads = new Map(
      (todaysWorkout?.exercises ?? [])
        .filter(e => e.suggested_load_kg != null)
        .map(e => [e.name, e.suggested_load_kg as number] as const)
    )
    const { rows, totalSets, loggedKeys } = executeLogWorkout(parsed.groups, {
      profileId: activeSession.profileId ?? '',
      date: activeSession.date,
      weekNumber: activeSession.liveWeek,
      dayName: activeSession.dayName,
      setsFor: activeSession.setsFor,
      logSet: activeSession.logSet,
      declareOffPlan: activeSession.declareOffPlan,
      todaysPlanSetCounts,
      todaysPlanLoads,
    })
    onLogsUpdated?.()
    const exerciseCount = parsed.groups.filter((g: ParsedSetGroup) => !g.routesToCardio).length
    const summary = `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} · ${totalSets} set${totalSets === 1 ? '' : 's'}`
    return {
      text: `Logged · ${activeSession.dayName}`,
      receipt: {
        kind: 'log_workout',
        title: `Logged · ${activeSession.dayName}`,
        rows,
        summary,
        status: 'done',
        resolvedAt: new Date().toISOString(),
        // Undo (C17) parses this back out to call deleteSet per natural key
        // — loggedKeys never leaves this module otherwise, so JSON-encode
        // it onto the one field the receipt view already carries.
        undoToken: JSON.stringify(loggedKeys),
      },
    }
  }

  /** Continuation of resolveAndMaybeLog after a ClarificationCard answer — see its own doc comment for why only exercise_name ambiguity round-trips through a tap choice. */
  const handleClarificationChoice = async (msgIndex: number, value: string) => {
    const msg = messages[msgIndex]
    if (!msg.clarification) return
    const session = parseSessionsRef.current[msg.clarification.resolverId]
    if (!session) return
    delete parseSessionsRef.current[msg.clarification.resolverId]

    const priorParse = parseWorkoutEntries({ entries: session.entries, todaysPlanExerciseNames: session.todaysPlanExerciseNames })
    const idx = priorParse.groups.findIndex((g: ParsedSetGroup) => g.resolution === 'ambiguous' || !!g.ambiguity)
    if (idx === -1) return
    const updatedEntries = session.entries.map((e, i) => (i === idx ? { ...e, exercisePhrase: value } : e))

    const outcome = resolveAndMaybeLog(updatedEntries)
    setMessages(prev => prev.map((m, i) => (i === msgIndex ? { ...m, clarification: outcome.clarification, receipt: outcome.receipt, content: outcome.text } : m)))
  }

  /**
   * VISION-ARCHITECTURE.md §2.6, D1 — "the client discards model prose on
   * ANY turn that produced a proposal." result.pendingAction/result.receipt
   * take priority over result.reply unconditionally: a turn carrying either
   * renders ONLY client-authored copy + the corresponding card. This is the
   * exact fix for the incident (the model's own "Schedule updated" text
   * rendered as if the write had already happened) — enforced here, not by
   * asking the model to behave, so no prompt-text discipline can regress it.
   */
  const processResponse = async (result: ChatApiResponse): Promise<{
    text: string
    action?: PlanAction
    pendingAction?: ChatPendingActionView
    receipt?: ChatReceiptView
    clarification?: ChatClarificationView
  }> => {
    if (result.proposal && profile.id) {
      // I1: the client is the ONLY writer of pending_actions — this INSERT
      // is what actually creates the row the edge function only described.
      let built: { scopeKey: string; preconditions: Record<string, unknown>; payload: Record<string, unknown>; preImage?: unknown; diff: import('@/lib/pending-actions-store').ProposalDiff } | null = null

      if (result.proposal.kind === 'propose_exercise_swap' && result.proposal.rawArgs) {
        const swap = buildExerciseSwapProposal(result.proposal.rawArgs)
        if (swap) built = { scopeKey: swap.scopeKey, preconditions: swap.preconditions, payload: swap.payload as unknown as Record<string, unknown>, preImage: swap.preImage, diff: swap.diff }
      } else if (result.proposal.diff && result.proposal.payload && result.proposal.scopeKey) {
        built = { scopeKey: result.proposal.scopeKey, preconditions: result.proposal.preconditions ?? {}, payload: result.proposal.payload, preImage: result.proposal.preImage, diff: result.proposal.diff }
      }

      if (!built) {
        return { text: "I couldn't find that on your current plan — it may have changed since you last looked." }
      }

      // action_class is hardcoded 'plan_mutation' here since both current
      // propose_* kinds (exercise swap, meal swap) are plan mutations;
      // revisit if a non-mutation propose_* kind is ever added.
      const row = await createPendingAction({
        profileId: profile.id,
        actionClass: 'plan_mutation',
        kind: result.proposal.kind,
        scopeKey: built.scopeKey,
        preconditions: built.preconditions,
        payload: built.payload,
        preImage: built.preImage,
        diff: built.diff,
      })
      const pendingAction: ChatPendingActionView = { id: row.id, kind: row.kind, status: row.status, diff: row.diff }
      return { text: describeProposalClientSide(pendingAction), pendingAction }
    }
    if (result.receipt) {
      return { text: result.receipt.title, receipt: result.receipt }
    }
    if (result.logWorkout) {
      const entries: WorkoutEntryInput[] = result.logWorkout.entries.map(e => ({
        rawText: e.raw_text,
        exercisePhrase: e.exercise_phrase,
        setsPhrase: e.sets_phrase,
      }))
      return resolveAndMaybeLog(entries)
    }
    if (result.memoryIntent) {
      return resolveAndSaveMemory(result.memoryIntent)
    }
    if (result.offer) {
      // D3: a non-imperative statement downgraded to a suggestion chip —
      // no pendingAction, no Confirm button, nothing written. The offer's
      // text IS safe client-owned copy (built server-side from the
      // classifier's decision, not model free-text describing a change).
      return { text: result.offer.text }
    }

    // No proposal, no receipt, no offer: the existing immediate-action path
    // (log_weight, log_workout_session, etc. — writes the server already
    // made) is unchanged, and rendering the model's own reply is still safe
    // here because this turn made no plan-mutation claim.
    let responseText = result.reply
    let action = result.action
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
          pendingAction: processed.pendingAction,
          receipt: processed.receipt,
          clarification: processed.clarification,
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
    let pendingAction: ChatPendingActionView | undefined
    let receipt: ChatReceiptView | undefined
    let clarification: ChatClarificationView | undefined
    let failed = false

    if (useAI) {
      try {
        const result = await callGemini(userText)
        const processed = await processResponse(result)
        responseText = processed.text
        action = processed.action
        pendingAction = processed.pendingAction
        receipt = processed.receipt
        clarification = processed.clarification
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
      pendingAction,
      receipt,
      clarification,
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

  /**
   * Confirm-exactly-once gate (§2.5): claimPendingAction's conditional
   * UPDATE is the real correctness mechanism — this handler can be invoked
   * by a double-tap and only one call will see `outcome: 'claimed'`.
   *
   * The preconditions check is `async () => true` here — always-pass — an
   * interim placeholder until propose_exercise_swap/propose_meal_swap
   * (C15/C16) supply a real content-fingerprint check against the live
   * plan/pool. Nothing can produce a pendingAction message to click
   * Confirm on until those tools exist, so this is forward-built plumbing
   * like C2/C3 before it.
   *
   * On a successful claim, dispatches by kind to the matching executor and
   * replaces the card with a terminal ReceiptCard — never a blanket
   * "Done!" when the receipt shows a partial/failed op.
   */
  const handleConfirmProposal = async (msgIndex: number, editedScope?: string) => {
    const msg = messages[msgIndex]
    if (!msg.pendingAction || !profile.id) return
    const claimResult = await claimPendingAction(msg.pendingAction.id, async () => true)

    if (claimResult.outcome !== 'claimed') {
      setMessages(prev => prev.map((m, i) => {
        if (i !== msgIndex || !m.pendingAction) return m
        if (claimResult.outcome === 'stale') return { ...m, pendingAction: { ...m.pendingAction, status: 'stale' } }
        return m
      }))
      return
    }

    const row = claimResult.row
    await markExecuting(row.id)

    let title: string
    let rows: { label: string; detail: string }[] = []
    let receipt: PendingActionReceipt
    let undoToken: string | undefined

    if (row.kind === 'propose_exercise_swap') {
      const payload = row.payload as unknown as ExerciseSwapPayload
      const scope: SwapScope = editedScope === 'permanent' ? 'permanent' : payload.scope
      const result = await executeExerciseSwap(profile, mesocycle, { ...payload, scope })
      onMesocycleUpdated(result.mesocycle)
      receipt = result.receipt
      const ok = receipt.failed.length === 0
      title = ok ? 'Swapped' : "Couldn't apply the swap"
      rows = ok ? [{ label: payload.oldExerciseName, detail: `→ ${payload.newExerciseName}` }] : []
      undoToken = ok ? row.id : undefined // undo (C17) re-fetches row.pre_image by this id — no need to re-capture it here
    } else if (row.kind === 'propose_meal_swap') {
      const payload = row.payload as unknown as MealSwapPayload
      const result = await executeMealSwap(profile.id, payload)
      receipt = result.receipt
      const ok = receipt.failed.length === 0 && result.appliedName
      title = ok ? 'Swapped' : "Couldn't apply the swap"
      rows = ok ? [{ label: payload.slot, detail: `→ ${result.appliedName}` }] : []
      if (ok && result.appliedName) {
        // The step that actually makes the swap visible — without this the
        // receipt would claim a swap the Meals/Nutrition tab never shows.
        onMealSwapApplied(payload.slot, result.appliedName)
      }
      if (ok && result.appliedMacros) {
        await upsertFavorite({
          new_item: result.appliedName!,
          meal_slot: payload.slot,
          protein: result.appliedMacros.protein,
          carbs: result.appliedMacros.carbs,
          fat: result.appliedMacros.fat,
        })
      }
      undoToken = ok ? row.id : undefined
    } else {
      receipt = { landed: [], failed: [{ op: row.kind, error: 'Not available yet' }] }
      title = "Couldn't apply that"
    }

    const status: 'done' | 'partial' | 'failed' = receipt.failed.length === 0 ? 'done' : (receipt.landed.length > 0 ? 'partial' : 'failed')
    await resolvePendingAction(row.id, status, receipt)

    setMessages(prev => prev.map((m, i) => i === msgIndex
      ? { ...m, pendingAction: undefined, receipt: { kind: row.kind as ChatReceiptView['kind'], title, rows, status, result: receipt, undoToken, resolvedAt: new Date().toISOString() } }
      : m
    ))
  }

  const handleRejectProposal = async (msgIndex: number) => {
    const msg = messages[msgIndex]
    if (!msg.pendingAction) return
    await declinePendingAction(msg.pendingAction.id)
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex && m.pendingAction ? { ...m, pendingAction: { ...m.pendingAction, status: 'declined' } } : m
    ))
  }

  /**
   * VISION-ARCHITECTURE.md §2.5 — three undo shapes behind one handler:
   * NL-logged sets reuse deleteSet directly (undoToken is a JSON-encoded
   * natural-key list, never leaves the browser); the two swap kinds
   * re-fetch the pending_actions row fresh (undoToken is its id — never
   * trusts anything cached on the message) so undo always restores from
   * the DB's own record of what happened. All three are only offered for
   * the 10-minute post-confirm window.
   */
  const handleUndoReceipt = async (msgIndex: number) => {
    const msg = messages[msgIndex]
    const receipt = msg.receipt
    if (!receipt?.undoToken || !profile.id) return

    if (receipt.kind === 'log_workout') {
      if (!isWithinUndoWindow(receipt.resolvedAt ?? null)) return
      const keys: { exerciseId: string; setNumber: number }[] = JSON.parse(receipt.undoToken)
      for (const key of keys) {
        activeSession.deleteSet({ userId: profile.id, date: activeSession.date, exerciseId: key.exerciseId, setNumber: key.setNumber })
      }
    } else if (receipt.kind === 'memory_fact_saved' || receipt.kind === 'memory_goal_saved' || receipt.kind === 'memory_context_fact_saved') {
      // Memory rows are never claimed through pending_actions (§1 Part 2's
      // rows are append-only observations, not plan mutations) — undoToken
      // is the row's own id, and undo is a direct retire (soft delete,
      // same append-only-with-a-reverse convention meal_events.voided_at
      // uses), gated by the same 10-minute window every receipt honors.
      if (!isWithinUndoWindow(receipt.resolvedAt ?? null)) return
      if (receipt.kind === 'memory_fact_saved') await retireFact(receipt.undoToken)
      else if (receipt.kind === 'memory_context_fact_saved') await retireContextFact(receipt.undoToken)
      else await abandonGoal(receipt.undoToken)
      await onMemoryChanged()
    } else {
      const row = await getPendingAction(receipt.undoToken)
      if (!row || !isWithinUndoWindow(row.resolved_at)) return

      if (row.kind === 'propose_exercise_swap') {
        const payload = row.payload as unknown as ExerciseSwapPayload
        const preImage = row.pre_image as MesocycleWeek[] | null
        if (!preImage || !planCreatedAt) return
        await undoExerciseSwap(profile.id, preImage, payload.weekNumber, payload.scope, planCreatedAt)
        onMesocycleUpdated(preImage)
      } else if (row.kind === 'propose_meal_swap') {
        const payload = row.payload as unknown as MealSwapPayload
        if (!payload.currentName) return
        onMealSwapApplied(payload.slot, payload.currentName)
      } else {
        return
      }
    }

    setMessages(prev => prev.map((m, i) => (i === msgIndex && m.receipt ? { ...m, receipt: { ...m.receipt, undoToken: undefined } } : m)))
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
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      // Defect 2 (cleanup round): a malformed or double-protocol href (e.g.
      // the model emitting a URL that already carries a protocol-shaped
      // fragment) must never reach the DOM as an unopenable link — normalize
      // to exactly one https://, or drop the anchor entirely and render the
      // link text plainly if it still doesn't parse as a URL.
      const normalized = normalizeExternalUrl(href)
      if (!normalized) return <>{children}</>
      return (
        <a href={normalized} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">{children}</a>
      )
    },
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
                    {msg.pendingAction && msg.status !== 'failed' && (
                      <ProposalCard
                        pendingAction={msg.pendingAction}
                        onConfirm={scope => handleConfirmProposal(i, scope)}
                        onReject={() => handleRejectProposal(i)}
                      />
                    )}
                    {msg.receipt && msg.status !== 'failed' && (
                      <ReceiptCard
                        title={msg.receipt.title}
                        rows={msg.receipt.rows}
                        summary={msg.receipt.summary}
                        status={msg.receipt.status}
                        receipt={msg.receipt.result}
                        undoAvailable={!!msg.receipt.undoToken && isWithinUndoWindow(msg.receipt.resolvedAt ?? null)}
                        onUndo={msg.receipt.undoToken ? () => handleUndoReceipt(i) : undefined}
                        onViewMemory={msg.receipt.kind.startsWith('memory_') ? onOpenMemory : undefined}
                      />
                    )}
                    {msg.clarification && msg.status !== 'failed' && (
                      <ClarificationCard
                        contextLines={msg.clarification.contextLines}
                        prompt={msg.clarification.prompt}
                        options={msg.clarification.options}
                        onChoose={async value => {
                          if (navigator.vibrate) navigator.vibrate(10)
                          await handleClarificationChoice(i, value)
                        }}
                      />
                    )}
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
