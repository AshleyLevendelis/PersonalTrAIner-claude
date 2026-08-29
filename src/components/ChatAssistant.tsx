import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, CheckCircle2, ArrowDown, RotateCcw, AlertCircle, Trash2, Mic, MessageCircle } from 'lucide-react'
import { calculateCalories, getActiveMesocycleWeek } from '@/lib/calculations'
import { computeBMR, computeStaticTDEE, resolveBodyMetrics } from '@/lib/macro-calculator'
import { getAppNow, getSessionDateContext } from '@/lib/dev-clock'
import { supabase } from '@/lib/supabase'
import { getRecentLogs, formatLogsForAI, getRecentCardioLogs, formatCardioLogsForAI } from '@/lib/daily-tracking'
import { saveChatCache, loadChatCache, clearChatCache } from '@/lib/chat-cache'
import { swapPoolMeal, setMealPick, type MealSlotName } from '@/lib/meal-store'
import { getExerciseEntry } from '@/lib/exercise-db'
import { createPendingAction, claimPendingAction, declinePendingAction, markExecuting, resolvePendingAction, getPendingAction, isWithinUndoWindow, type PendingActionReceipt } from '@/lib/pending-actions-store'
import { APPEND_PROPOSAL_KINDS, INTENT_PROPOSAL_VERB, buildIntentProposal } from '@/lib/intent-proposal'
import { pickAccountabilityCheckIn } from '@/lib/accountability'
import { executeExerciseSwap, executeMealSwap, executeMealAddition, undoMealAddition, undoExerciseSwap, executeInjuryAdaptation, executeLastingInjury, executeInjuryRecovered, executeEquipmentAdaptation, type ExerciseSwapPayload, type MealSwapPayload, type InjuryAdaptationPayload, type LastingInjuryPayload, type InjuryRecoveredPayload, type EquipmentAdaptationPayload } from '@/lib/pending-action-executor'
import { buildMealAdditionProposal, type MealAdditionPayload } from '@/lib/meal-addition'
import { buildMealSwapProposal } from '@/lib/meal-swap-proposal'
import type { SwapScope } from '@/lib/mesocycle-edit'
import { createPlanAdaptation } from '@/lib/plan-adaptations-store'
import { updateProfileField } from '@/lib/profile-store'
import { substituteForInjury, substituteForEquipment, assessAdaptation, countSlots } from '@/lib/plan-adaptations'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useSpeechToText } from '@/hooks/useSpeechToText'
import { useViewportInset } from '@/hooks/useViewportInset'
import { keepsComposerFocus, refocusComposer } from '@/lib/composer-focus'
import { TAB_BAR_HEIGHT_PX } from '@/components/BottomTabBar'
import { useBottomDockHeight } from '@/hooks/useBottomDockHeight'
import { cn } from '@/lib/utils'
import { parseWorkoutEntries, type ParsedSetGroup, type WorkoutEntryInput } from '@/lib/set-parse'
import { executeLogWorkout } from '@/lib/nl-logging-executor'
import { normalizeExternalUrl } from '@/lib/chat-links'
import { buildFirstRunIntro, type FirstRunSessionBrief } from '@/lib/first-run-intro'
import { buildCoachExerciseSummary } from '@/lib/chat-plan-context'
import { createFact, createGoal, createContextFact, retireFact, retireContextFact, abandonGoal, type UserFactRow, type UserGoalRow, type UserContextFactRow } from '@/lib/memory-store'
import { resolveExerciseTarget, resolveFoodTarget } from '@/lib/fact-compiler'
import { checkFactConflict, checkGoalConflict } from '@/lib/memory-reconcile'
import { classifyConfirmationReply } from '@/lib/confirmation-reply'
import { getPRCache } from '@/lib/pr-engine'
import { loadDashboardData, type DashboardData } from '@/lib/dashboard-data'
import { getAllItems as getAllGroceryItems, addItemLocal, setCheckedLocal, undoAddLocal, type GroceryItemRow, type GroceryCategory } from '@/lib/grocery-store'
import { logWater, undoLog as undoWaterLog } from '@/lib/water-store'
import { ProposalCard } from '@/components/chat/ProposalCard'
import { TypewriterMarkdown } from '@/components/chat/TypewriterMarkdown'
import { ReceiptCard } from '@/components/chat/ReceiptCard'
import { ClarificationCard } from '@/components/chat/ClarificationCard'
import type { ChatMessage, UserProfile, MacroTargets, WorkoutDay, MealPlanDay, MesocycleWeek, PlanAction, ChatPendingActionView, ChatReceiptView, ChatClarificationView } from '@/lib/types'
import { DEFAULT_REVEAL_SPEED, type RevealSpeed } from '@/lib/reveal-speed-store'
import { takeChatPrefill } from '@/lib/chat-prefill-store'

const ACTION_TAG_RE = /\[ACTION:\s*.*?\]/gi
const QUICK_REPLIES_RE = /\[QUICK_REPLIES:\s*(.*?)\]/gi
const TRAILING_BRACKET_RE = /\[(?:ACTION|QUICK_REPLIES|BREAK)[^\]]*$/i
const PAGE_SIZE = 20

// Chat round 2, item 2 — the model splits a reply into consecutive sent
// messages with a [BREAK] line. Collapsed here into a blank-line paragraph
// break so each beat renders as its own visually separated block. NOTE this
// is a paragraph split, not yet a genuinely separate chat bubble per part —
// see the round-2 report for the remaining piece.
const BREAK_TAG_RE = /^[ \t]*\[BREAK\][ \t]*$/gim

function applyMessageBreaks(text: string): string {
  return text.replace(BREAK_TAG_RE, '\n')
}

function stripTags(text: string): string {
  return applyMessageBreaks(text).replace(ACTION_TAG_RE, '').replace(QUICK_REPLIES_RE, '').trim()
}

function stripStreamingTags(text: string): string {
  let cleaned = applyMessageBreaks(text).replace(ACTION_TAG_RE, '').replace(QUICK_REPLIES_RE, '')
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

const CATEGORY_LABEL_FOR_RECEIPT: Record<GroceryCategory, string> = {
  produce: 'Produce', meat_fish: 'Meat & Fish', dairy: 'Dairy', dry_goods: 'Dry Goods', frozen: 'Frozen', other: 'Other',
}

interface FavoriteMeal {
  name: string
  meal_slot: string
  times_used: number
}

interface ChatAssistantProps {
  profile: UserProfile
  /** Living targets from computeTargets (M0) — the SAME numbers the Nutrition tab shows, respecting the user's selected macro mode. Null when a body metric is missing; already guarded internally (line ~355) before any use. */
  macros: MacroTargets | null
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
  /** Fired after a confirmed propose_injury_as_lasting/propose_injury_recovered writes fitness_profiles.injuries directly (executeLastingInjury/executeInjuryRecovered) — mirrors ProfileScreen's own onProfileChanged so App.tsx's profile state stays in sync with a write chat made outside its own setProfile calls. */
  onProfileChanged: (patch: Partial<UserProfile>) => void
  /** Fired after a confirmed propose_meal_swap executes — mirrors App.tsx's handleSwapMealSlot's setManualMealPicks, the ONLY thing that makes a swapped-in pool option actually render as today's pick. Without this the receipt would claim a swap the Nutrition tab never shows — exactly the incident this framework exists to prevent. */
  /** Returns whether the pick actually persisted — a receipt must never say "Swapped" for a write that didn't land. */
  onMealSwapApplied: (slot: MealSlotName, chosenName: string) => Promise<boolean>
  /** Confirmed propose_meal_pool_refresh — generates ADDITIONAL options for one slot and keeps the existing ones. Lives in App.tsx because that's where every generation input (disliked foods, timing rules, cuisines) already is. Returns the names added, or an error string. */
  onFindMoreMealOptions: (slot: MealSlotName) => Promise<{ added: string[]; error?: string }>
  /** Memory & goals (VISION-ARCHITECTURE.md §1) — active facts/goals/context, loaded by App.tsx alongside the profile. Read-only here: resolveAndSaveMemory writes through memory-store directly and calls onMemoryChanged so App.tsx re-fetches, the same "the client is the only writer, the caller reloads after" shape pending_actions uses. */
  memoryFacts: UserFactRow[]
  memoryGoals: UserGoalRow[]
  memoryContextFacts: UserContextFactRow[]
  onMemoryChanged: () => void | Promise<void>
  /** Deep-link target for a memory receipt's "View in profile" button — Memory merged into Profile, so this opens Profile scrolled to the relevant section. */
  onOpenProfile?: (section?: 'goals' | 'facts' | 'context') => void
  /** Grocery list (VISION-ARCHITECTURE.md §5.4) — current items, for the "what's on my list" context snapshot and duplicate-merge decisions. Same "client is the only writer, caller reloads after" shape as memory. */
  groceryItems: GroceryItemRow[]
  onGroceryChanged?: () => void | Promise<void>
  /** Deep-link target for a grocery receipt's "View list" button — navigates to the Tools tab. */
  onOpenGrocery?: () => void
  /** Fired after a chat water log so App.tsx/Dashboard can refresh their own local water state (same "caller reloads after" shape, though water-store's own local-first merge already reflects the write immediately for anything reading it fresh). */
  onWaterChanged?: () => void | Promise<void>
  /** Deep-link target for a water receipt's "View" button — navigates to the Dashboard tab. */
  onOpenDashboard?: () => void
  /** User's chat typewriter-reveal-speed preference (Settings → Profile). Defaults to 'normal' if omitted. */
  revealSpeed?: RevealSpeed
  /** Vision Step 6 — any pending "start heavier next block?" suggestions currently showing on the dashboard banner, so the coach can discuss one if asked directly. Confirming/declining still only happens via the banner's own buttons, not from here (see load-suggestions.ts's own doc comment on why chat-driven confirm is out of scope for this pass). */
  pendingLoadSuggestions?: string[]
}

export function ChatAssistant({ profile, macros, exercisePlan, mesocycle, planCreatedAt, mealPlan, exerciseExclusions, latestWeightKg, onPlanUpdate, onLogsUpdated, onWeightLogged, onMesocycleUpdated, onProfileChanged, onMealSwapApplied, onFindMoreMealOptions, memoryFacts, memoryGoals, memoryContextFacts, onMemoryChanged, onOpenProfile, groceryItems, onGroceryChanged, onOpenGrocery, onWaterChanged, onOpenDashboard, revealSpeed = DEFAULT_REVEAL_SPEED, pendingLoadSuggestions }: ChatAssistantProps) {
  // NL logging (§3) writes through the SAME frozen session identity +
  // logSet facade SetGrid.tsx uses — never saveSet directly (see
  // nl-logging-executor.ts's own doc comment).
  const activeSession = useActiveSession()
  // Turn 6 composer fix: `sticky bottom-0` was inert inside CardContent's
  // `overflow-hidden` (overflow:hidden ancestors don't give sticky anything
  // to stick within — only overflow:auto/scroll do), and the Card's own
  // fixed height never accounted for the independently-`fixed` tab bar. The
  // composer now rides above the tab bar via the exact same fixed-position
  // + keyboard-inset pattern BottomDock already uses.
  const { insetPx: composerInsetPx, isKeyboardOpen: composerKeyboardOpen } = useViewportInset()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerBoxRef = useRef<HTMLDivElement>(null)

  // Keyed by an in-memory resolverId, not persisted: holds the full
  // entries/groups for a log_workout turn that hit a BLOCKING ambiguity, so
  // answering one ClarificationCard can re-parse and continue rather than
  // losing everything already resolved in that message. Ephemeral by
  // design, same as pendingAction/receipt/clarification on ChatMessage.
  const parseSessionsRef = useRef<Record<string, { entries: WorkoutEntryInput[]; todaysPlanExerciseNames: string[] }>>({})

  // Chat round 2, item 4 — "at most one check-in per conversation" is
  // enforced HERE, not by asking the model to remember it said something.
  // The system prompt is rebuilt every turn, so a check-in left in context
  // would be repeated every turn; once a turn has carried it, this flips and
  // the field is omitted from every subsequent turn of this conversation.
  // Ref (not state) deliberately: flipping it must not re-render, and it
  // resets naturally on remount, which is the conversation boundary the
  // brief means.
  const checkInUsedRef = useRef(false)
  /**
   * Every meal option this conversation has actually shown the user, per slot.
   * A ref, not state: nothing renders from it, and it must be readable inside
   * the same async turn that writes it — a setState here would have the swap
   * builder reading the previous render's value and the "you've seen them all"
   * offer arriving one swap late.
   *
   * Deliberately per-conversation rather than persisted. "You've been through
   * your options" is a claim about this sitting; someone coming back a week
   * later should get their pool offered again before being asked to spend on
   * new ones.
   */
  const mealOptionsSeenRef = useRef<Partial<Record<MealSlotName, string[]>>>({})
  const noteMealOptionSeen = (slot: MealSlotName, name: string) => {
    if (!name) return
    const seen = mealOptionsSeenRef.current[slot] ?? []
    if (!seen.some(n => n.toLowerCase() === name.toLowerCase())) mealOptionsSeenRef.current[slot] = [...seen, name]
  }

  // Synchronous fallback opener — used as the initial message before any
  // data has loaded, and upgraded in place once real PR/trend data resolves
  // (see the greeting-upgrade effect below). Still concrete (today's actual
  // session, not a canned "Hi") rather than generic — the coach-persona
  // branching is gone; there's one voice now. `greetName` and `detail` are
  // exposed separately so the upgrade path can prepend a PR line without
  // string-surgery on the composed sentence.
  const greetName = (): string => {
    const name = profile.display_name || ''
    return name ? `Hey ${name}` : `Hey`
  }

  const initialGreetingDetail = (): string => {
    const now = new Date()
    const hour = now.getHours()
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
    const todaySession = exercisePlan.find(d => d.day === dayName)
    const trainingTime = profile.preferred_time || 'morning'
    const sessionPassedCutoff: Record<string, number> = {
      morning: 13,
      midday: 16,
      evening: 21,
      night: 23,
      varies: 22,
    }
    const cutoff = sessionPassedCutoff[trainingTime] || 22

    if (todaySession) {
      const movements = todaySession.exercises.map(e => e.name).slice(0, 3).join(', ')
      if (hour >= cutoff) {
        return `today was ${todaySession.focus} (${movements}). How'd it go?`
      }
      return `today's ${todaySession.focus}: ${movements}${todaySession.exercises.length > 3 ? '...' : ''}. Feeling good for it?`
    }
    return `it's a rest day on your plan. How's the recovery going?`
  }

  /**
   * When day one actually is, for the first-run opener.
   *
   * Separate from initialGreetingDetail because the two answer different
   * questions. That one greets a RETURNING user, for whom "it's a rest day —
   * how's the recovery going?" is a fair thing to say. For someone who
   * finished onboarding ninety seconds ago it is not: there is no recovery
   * yet, and the one thing they want to know is when they start. So a
   * brand-new user whose first training day is not today gets pointed at it
   * instead of asked about a rest they have not earned.
   */
  const firstRunSessionBrief = (): FirstRunSessionBrief | null => {
    const now = new Date()
    const nameOfDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' })
    const sessionOn = (d: Date) => exercisePlan.find(x => x.day === nameOfDay(d))
    const brief = (day: { focus: string; exercises: { name: string }[] }) => ({
      focus: day.focus,
      movements: day.exercises.map(e => e.name).slice(0, 3).join(', ')
        + (day.exercises.length > 3 ? '…' : ''),
    })

    const today = sessionOn(now)
    if (today) {
      // Same per-preference cutoff the returning-user greeting uses, for the
      // same reason: past the hour someone trains, "starts today" is a push
      // rather than a welcome.
      const cutoff: Record<string, number> = { morning: 13, midday: 16, evening: 21, night: 23, varies: 22 }
      const past = now.getHours() >= (cutoff[profile.preferred_time || 'morning'] || 22)
      return { ...brief(today), when: past ? 'whenever' : 'today' }
    }

    for (let ahead = 1; ahead <= 7; ahead++) {
      const d = new Date(now)
      d.setDate(d.getDate() + ahead)
      const day = sessionOn(d)
      if (day) return { ...brief(day), when: ahead === 1 ? 'tomorrow' : nameOfDay(d) }
    }
    return null
  }

  const buildInitialGreeting = (): string => `${greetName()} — ${initialGreetingDetail()}`

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
  // A question handed over from Home's coach chips. Read once on mount and
  // cleared by the store, so it fills the box but never re-appears later.
  // Filled, NOT sent: the user sees it before it becomes a message.
  const [input, setInput] = useState(() => takeChatPrefill())
  // Voice input — captures the input text at the moment listening starts so
  // a live transcript appends after whatever the user already typed, rather
  // than each recognition event (which reports the FULL transcript so far,
  // not a delta) overwriting it.
  const voiceBaseRef = useRef('')
  // TEMPORARY diagnostic — the previous fix for voice-input duplication
  // verified clean against a synthetic SpeechRecognition but the same
  // duplication still reproduces on a real Android device, meaning the
  // synthetic event sequence doesn't match reality. Opt in via
  // `localStorage.setItem('fitplan_voice_debug', '1')` (or the on-screen
  // toggle below) to see the ACTUAL per-event trace from the real engine
  // directly on the phone, no tethered devtools required. Remove once the
  // real failure mode is confirmed fixed.
  const [voiceDebugOn, setVoiceDebugOn] = useState(() => typeof localStorage !== 'undefined' && localStorage.getItem('fitplan_voice_debug') === '1')
  const [voiceDebugLines, setVoiceDebugLines] = useState<string[]>([])
  const speech = useSpeechToText({
    onTranscript: text => setInput(voiceBaseRef.current + (voiceBaseRef.current && text ? ' ' : '') + text),
    onDebugLine: voiceDebugOn
      ? (line: string) => setVoiceDebugLines(prev => [...prev.slice(-24), `${new Date().toLocaleTimeString()} ${line}`])
      : undefined,
  })
  const micLongPressTimerRef = useRef<number | null>(null)
  const micLongPressFiredRef = useRef(false)
  const handleMicClick = () => {
    // A completed long-press already toggled the debug overlay (see
    // onPointerDown above) — the click that follows pointerup must not ALSO
    // start/stop listening.
    if (micLongPressFiredRef.current) {
      micLongPressFiredRef.current = false
      return
    }
    if (speech.isListening) {
      speech.stop()
      return
    }
    voiceBaseRef.current = input.trim()
    speech.start()
  }
  const [isLoading, setIsLoading] = useState(false)
  const [isRecalibrating, setIsRecalibrating] = useState(false)
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

  // Proactive material for the coach — the same aggregator the Dashboard
  // tab uses (weight trend, recent PRs, streak, "what's left" adherence
  // note), reused rather than re-derived so the numbers the coach mentions
  // always match what the user sees on Dashboard. Feeds both buildContext
  // (so the model can volunteer the one relevant unasked thing) and the
  // one-time initial-greeting upgrade below.
  const [proactiveData, setProactiveData] = useState<DashboardData | null>(null)
  /** null = not yet known; set by loadChatHistory once the chat_messages count for this profile is confirmed. */
  const [isFirstEverChat, setIsFirstEverChat] = useState<boolean | null>(null)
  /** The one message currently mid-typewriter-reveal — set only for a reply that JUST arrived from sendMessage, never for restored history/cache (see TypewriterMarkdown.tsx). */
  const [animatingMessageId, setAnimatingMessageId] = useState<string | null>(null)
  useEffect(() => {
    if (!activeSession.ready || !profile.id || !macros) return
    let cancelled = false
    loadDashboardData({
      profile, macros, exercisePlan, mesocycle, planCreatedAt,
      todayLogs: activeSession.logs, liveWeek: activeSession.liveWeek,
      dayName: activeSession.dayName, todayStr: activeSession.date,
      now: getAppNow(profile.id),
    }).then(d => { if (!cancelled) setProactiveData(d) }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession.ready, activeSession.date, activeSession.logs.length, profile.id])

  // One-shot finalization of the synchronous fallback greeting once we know
  // (a) whether this is a genuinely first-ever conversation (no prior
  // chat_messages rows — see isFirstEverChat, set by loadChatHistory) and,
  // opportunistically, (b) any recent-PR data. Only fires when the
  // conversation is still exactly the untouched opener (a fresh chat,
  // nothing sent yet) so this never clobbers restored history or a reply
  // already in flight. historyLoaded typically resolves faster than
  // proactiveData (a single chat_messages fetch vs. loadDashboardData's
  // several), so finalizing the instant historyLoaded flips true would
  // usually miss the PR line entirely — wait a short beat for proactiveData
  // too, but don't hang forever if it's slow or fails (a missed bonus line
  // is fine; a stuck opener is not).
  const openerFinalizedRef = useRef(false)
  useEffect(() => {
    if (openerFinalizedRef.current || !historyLoaded || isFirstEverChat == null || messages.length !== 1) return
    if (messages[0].role !== 'assistant' || messages[0].content !== buildInitialGreeting()) return

    const finalize = () => {
      if (openerFinalizedRef.current) return
      openerFinalizedRef.current = true

      const recentPR = proactiveData?.recentPRs[0]
      const detail = initialGreetingDetail()
      const scheduleLine = recentPR
        ? `${greetName()} — nice PR on ${recentPR.exerciseName} at ${recentPR.weightKg}kg. ${detail.charAt(0).toUpperCase()}${detail.slice(1)}`
        : buildInitialGreeting()
      // Chat round 2, item 1 — a brand-new user meets someone, rather than
      // opening a tool. Several short messages instead of one block: who this
      // is, what it'll do for them (in plain language, NOT a feature list),
      // then one real opening question. Returning users (isFirstEverChat
      // false) skip the introduction entirely and get the specific-today
      // line on its own, exactly as before.
      //
      // ROUND 3 — Ashley: "clearly explain in the first few messages what it
      // does, how it can help and how the user can use it." The words and the
      // chips both live in first-run-intro.ts, with the reasoning for each;
      // this only turns them into ChatMsg rows. CHIPS SHOW RATHER THAN TELL,
      // which is what keeps the how-to-use-it half out of the prose.
      if (isFirstEverChat) {
        setMessages(buildFirstRunIntro(greetName(), firstRunSessionBrief()).map(m => ({
          role: 'assistant' as const,
          status: 'complete' as const,
          ...m,
        })))
        return
      }

      if (scheduleLine !== buildInitialGreeting()) {
        setMessages([{ role: 'assistant', content: scheduleLine, status: 'complete' }])
      }
    }

    if (proactiveData) { finalize(); return }
    const t = setTimeout(finalize, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded, isFirstEverChat, proactiveData, messages])

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
      setIsFirstEverChat((count ?? 0) === 0)
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
    // Split out from `.days` (not just `?.days || exercisePlan` inline) so
    // the week's own coach_note is still reachable below — that's where a
    // block-boundary hold (Step 4's load-hold, Step 5's volume-hold) and a
    // deload's own explanation already live, and until now neither ever
    // reached the chat: it could show the note in the plan/dashboard but
    // had no idea what to say if asked "why is my squat the same weight?"
    const activeMesoWeek = mesocycle.length > 0 ? mesocycle.find(w => w.week_number === activeWeek) : undefined
    const activeWeekData = activeMesoWeek?.days ?? exercisePlan

    // Every field the coach needs about the week lives in one place now
    // (chat-plan-context.ts) so a gate can call it. It used to be a template
    // literal right here, which is exactly how it went unnoticed that it
    // carried no prescribed weight while the Exercise tab showed that weight
    // on the next screen.
    const exerciseSummary = buildCoachExerciseSummary({
      days: activeWeekData,
      coachNote: activeMesoWeek?.coach_note,
      pendingLoadSuggestions,
    })

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
    // Null when a body metric is missing. The coach is then told the numbers
    // are unavailable rather than being handed a figure computed from a
    // guessed weight — it must not quote a calorie target it cannot stand
    // behind, and it must not invent one to fill the silence.
    const liveMetrics = resolveBodyMetrics({ ...profile, weight_kg: effectiveWeightKg })
    const liveBmr = liveMetrics ? computeBMR(liveMetrics) : null
    const liveTdee = liveBmr != null ? computeStaticTDEE(liveBmr, profile.activity_level) : null

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
      // Grocery list (VISION-ARCHITECTURE.md §5.4) — a snapshot for "what's
      // on my list" Q&A, not live-synced to Tools-tab edits mid-conversation
      // (same snapshot-per-mount shape as mealPlan/meal_summary above).
      grocery_list_summary: groceryItems
        .filter(i => !i.checked)
        .map(i => `${i.quantity}${i.unit === 'g' || i.unit === 'ml' ? i.unit : ` ${i.unit}`} ${i.display_name}`)
        .join('\n'),
      training_days_count: profile.training_days.filter(d => d.available).length,
      exercise_summary: exerciseSummary,
      meal_summary: mealSummary,
      favorites_summary: favoritesSummary,
      workout_log_history: workoutLogHistory,
      cardio_log_history: cardioLogHistory,
      // Proactive material (same Dashboard aggregator, see the
      // `proactiveData` effect above) — specific-or-silent by construction:
      // each field is only ever set when there's something real to report,
      // never a placeholder the model would have to paper over.
      streak_days: proactiveData?.streak ?? null,
      weight_trend_summary: proactiveData?.weightTrend && proactiveData.weightTrend.ratePerWeekKg != null
        ? `rolling average ${proactiveData.weightTrend.rollingAvgKg.toFixed(1)}kg, trending ${proactiveData.weightTrend.ratePerWeekKg >= 0 ? '+' : ''}${proactiveData.weightTrend.ratePerWeekKg.toFixed(2)}kg/week (${proactiveData.weightTrend.sampleCount} weigh-ins)${proactiveData.weightTrend.onTrackForGoal === false ? ', off track for their stated goal' : ''}`
        : null,
      recent_prs_summary: proactiveData && proactiveData.recentPRs.length > 0
        ? proactiveData.recentPRs.slice(0, 3).map(pr => `${pr.exerciseName} ${pr.weightKg}kg (${pr.date})`).join('; ')
        : null,
      adherence_note: proactiveData?.whatsLeftLine ?? null,
      // Chat round 2, item 4 — at most one, computed in code (never by the
      // model, which would invent one), and only on the first turn that can
      // carry it. accountability.ts returns null whenever the data doesn't
      // support something specific, which is what makes "specific-or-silent"
      // structural rather than an instruction.
      accountability_check_in: accountabilityCheckIn(),
    }
  }

  /**
   * Chat round 2, item 4. Returns the one check-in for this conversation, or
   * null. Marks it used the moment it's handed out, so the next turn of the
   * same conversation gets null and the coach doesn't repeat itself.
   */
  const accountabilityCheckIn = (): string | null => {
    if (checkInUsedRef.current || !proactiveData) return null
    const lastWeighIn = proactiveData.weightSeries.length > 0
      ? proactiveData.weightSeries[proactiveData.weightSeries.length - 1]
      : null
    const daysSinceWeighIn = lastWeighIn
      ? Math.floor((Date.now() - new Date(lastWeighIn.date).getTime()) / 86400000)
      : null
    const line = pickAccountabilityCheckIn({
      hour: new Date().getHours(),
      proteinEaten: proactiveData.proteinEaten,
      proteinTarget: proactiveData.proteinTarget,
      caloriesEaten: proactiveData.caloriesEaten,
      caloriesTarget: proactiveData.caloriesTarget,
      waterMl: proactiveData.waterMl,
      waterTargetMl: proactiveData.waterTargetMl,
      streak: proactiveData.streak,
      daysSinceWeighIn,
      sessionDueUnlogged: proactiveData.session.setsPlanned > 0 && proactiveData.session.setsLogged === 0,
      setsLoggedToday: proactiveData.session.setsLogged,
      setsPlannedToday: proactiveData.session.setsPlanned,
      onTrackForGoal: proactiveData.weightTrend?.onTrackForGoal ?? null,
    })
    if (line) checkInUsedRef.current = true
    return line
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

    if (action.type === 'swap_session_for_activity') {
      // The edge function already wrote workout_sessions.swapped_for_activity
      // — it only emits this action when its own write succeeded. So this is
      // a refresh, not a write, and the week strip picks up the ⇄ from the
      // session row on the next read.
      //
      // THE SAME BUG AS THE BRANCH BELOW, one action type later: this type was
      // missing from the PlanAction union, so applyPlanAction fell through to
      // `return false` and the user was told "Action failed — the change was
      // not applied" about a change that HAD been applied. Reported live, from
      // a phone, minutes after the migration that made the write possible.
      //
      // The lesson was already written down here and it still happened again,
      // so it is now a gate rather than a comment: test:chat-actions parses
      // every `action: { type: … }` the edge function can emit and fails if
      // any of them is unhandled here.
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
    logWorkout?: { date: string | null; corrects_previous?: boolean; entries: { raw_text: string; exercise_phrase: string; sets_phrase: string }[] }
    // Memory & goals (VISION-ARCHITECTURE.md §1 Part 2) — I1 holds: the
    // server never writes user_facts/user_goals/user_context_facts, it
    // forwards the validated tool args. resolveAndSaveMemory resolves
    // targets, checks a baseline, runs reconciliation, and only then writes.
    memoryIntent?: { tool: 'record_fact' | 'record_goal' | 'record_context_fact' | 'set_display_name'; rawArgs: Record<string, unknown> }
    // VISION-ARCHITECTURE.md §5.4 — the first IMMEDIATE-action chat door
    // with no confirmation card (append-only ⇒ execute + receipt + undo).
    // Same I1 shape as memoryIntent: the server never writes grocery_items.
    groceryIntent?: { tool: 'add_to_grocery_list' | 'check_off_grocery_item'; rawArgs: Record<string, unknown> }
    // Same I1/IMMEDIATE shape again, for water_logs.
    waterIntent?: { tool: 'log_water'; rawArgs: Record<string, unknown> }
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
    return {
      reply: data.reply, action: data.action, proposal: data.proposal, receipt: data.receipt, offer: data.offer, logWorkout: data.logWorkout,
      // Bug fix: memoryIntent was validated server-side (M1-M5) and read by
      // processResponse below, but never actually threaded through here —
      // every memory save silently fell through to the offer/action path
      // instead. groceryIntent follows the identical shape.
      memoryIntent: data.memoryIntent, groceryIntent: data.groceryIntent, waterIntent: data.waterIntent,
    }
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

  /** Client-authored copy for a proposal turn — D1 means the model's own text for this turn is never rendered, only this. */
  const describeProposalClientSide = (pendingAction: ChatPendingActionView): string => {
    const rows = pendingAction.diff.rows
    if (rows.length === 0) return "Here's a change I can make:"
    if (pendingAction.kind === 'propose_injury_recovered') return "Here's the injury update:"
    // Not "swap X for Y" — nothing is being replaced, and the default
    // headline below would read the slot name as the thing being lost.
    if (pendingAction.kind === 'propose_meal_addition') return `I can add **${rows[0].after}** to your ${rows[0].before}:`
    // The rationale IS the offer here ("that's all five I've got — want me to
    // find new ones?"), so repeating a headline above it would say it twice.
    if (pendingAction.kind === 'propose_meal_pool_refresh') return pendingAction.diff.rationale ?? 'Want me to find you some new options?'
    if (pendingAction.kind === 'propose_injury_adaptation' || pendingAction.kind === 'propose_injury_as_lasting' || pendingAction.kind === 'propose_equipment_adaptation') {
      const count = rows.length
      return `I can adjust ${count} exercise${count === 1 ? '' : 's'} across your plan:`
    }
    const intentVerb = INTENT_PROPOSAL_VERB[pendingAction.kind]
    if (intentVerb) return `Want me to ${intentVerb} **${rows[0].after}**?`
    const headline = rows[0]
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
   * Mirrors buildExerciseSwapProposal's shape exactly, for the injury
   * adaptation middle tier (§3a). Converts duration_days into a week-number
   * range starting at the live week (mesocycle weeks are the only
   * granularity slots actually have) and runs substituteForInjury client-
   * side to build the real diff — same I1 reasoning as the swap proposal:
   * the server never touches the plan.
   */
  const buildInjuryAdaptationProposal = async (rawArgs: Record<string, unknown>): Promise<{
    scopeKey: string
    preconditions: Record<string, unknown>
    payload: InjuryAdaptationPayload
    preImage: MesocycleWeek[]
    diff: import('@/lib/pending-actions-store').ProposalDiff
  } | null> => {
    const injuryCode = String(rawArgs.affected_area ?? '')
    const durationDays = Number(rawArgs.duration_days)
    if (!injuryCode || !durationDays || durationDays <= 0 || mesocycle.length === 0) return null

    const startWeek = activeSession.liveWeek
    const weekSpan = Math.max(1, Math.ceil(durationDays / 7))
    const weekNumbers = mesocycle
      .map(w => w.week_number)
      .filter(n => n >= startWeek && n < startWeek + weekSpan)
    if (weekNumbers.length === 0) return null

    const result = await substituteForInjury({
      mesocycle, profile, injuryCode, weekNumbers, exclusions: exerciseExclusions,
    })
    if (result.touchedSlots.length === 0) return null

    // Same substitute-vs-rebuild decision as the lasting-injury card. Being
    // time-bounded doesn't make a gutted plan acceptable — two weeks of a
    // hollow programme is still two weeks of not training.
    const verdict = assessAdaptation(result, countSlots(mesocycle))
    const mode: 'substitute' | 'rebuild' = verdict.shouldRebuild ? 'rebuild' : 'substitute'

    const rows = mode === 'rebuild'
      ? [{
          field: `Weeks ${weekNumbers[0]}–${weekNumbers[weekNumbers.length - 1]}`,
          before: `${verdict.dropped} exercises you can't train right now`,
          after: 'rebuilt around it, same number of sessions',
        }]
      : result.touchedSlots.map(slot => ({
          field: `${slot.dayName} (Week ${slot.weekNumber})`,
          before: slot.before,
          after: slot.after ?? '— removed (no safe alternative)',
        }))
    const implications: { severity: 'info' | 'warn'; text: string }[] = [
      { severity: 'info', text: `Applies for ${durationDays} day${durationDays === 1 ? '' : 's'}, then eases back in automatically.` },
    ]
    if (mode === 'rebuild') {
      implications.unshift({ severity: 'warn', text: `This rules out too much to patch exercise by exercise, so I'd rebuild these weeks around it rather than leave gaps — your original plan comes back automatically when it expires.` })
    } else if (result.droppedPatterns.length > 0) {
      implications.push({ severity: 'warn', text: `Some movements had no safe alternative this round and were dropped rather than faked.` })
    }

    return {
      scopeKey: `${profile.id}:propose_injury_adaptation:${injuryCode}:${startWeek}`,
      preconditions: { injuryCode, startWeek, weekNumbers },
      payload: { injuryCode, durationDays, weekNumbers, exclusions: exerciseExclusions, mode, reason: typeof rawArgs.reason === 'string' ? rawArgs.reason : undefined },
      preImage: mesocycle,
      diff: {
        rows,
        implications,
        rationale: typeof rawArgs.reason === 'string' ? rawArgs.reason : undefined,
        reversible: true,
      },
    }
  }

  /**
   * A lasting injury (Part 1/2 of the injury-persistence fix) — unlike
   * buildInjuryAdaptationProposal, weekNumbers runs from the current week
   * to the END of the mesocycle (no span cap: there's no duration to bound
   * it by), and the proposal still builds even when touchedSlots is empty
   * — the injuries write is valuable on its own (protects a future
   * regeneration) even on a week where nothing currently conflicts.
   */
  const buildLastingInjuryProposal = async (rawArgs: Record<string, unknown>): Promise<{
    scopeKey: string
    preconditions: Record<string, unknown>
    payload: LastingInjuryPayload
    preImage: MesocycleWeek[]
    diff: import('@/lib/pending-actions-store').ProposalDiff
  } | null> => {
    const injuryCode = String(rawArgs.affected_area ?? '')
    if (!injuryCode || mesocycle.length === 0) return null

    const startWeek = activeSession.liveWeek
    const weekNumbers = mesocycle.map(w => w.week_number).filter(n => n >= startWeek)
    if (weekNumbers.length === 0) return null

    const result = await substituteForInjury({
      mesocycle, profile, injuryCode, weekNumbers, exclusions: exerciseExclusions,
    })
    // Substituting slot by slot only works when the injury removes SOME
    // exercises. When it removes whole movement patterns there is nothing to
    // substitute into, and the "adjustment" is really a mass deletion — so
    // the card has to offer the rebuild, and say that's what it is.
    const verdict = assessAdaptation(result, countSlots(mesocycle))
    const mode: 'substitute' | 'rebuild' = verdict.shouldRebuild ? 'rebuild' : 'substitute'

    const rows = mode === 'rebuild'
      ? [{
          field: 'Your plan',
          before: `${verdict.dropped} of ${countSlots(mesocycle)} exercises can't be trained with this injury`,
          after: 'rebuilt around it, same number of sessions',
        }]
      : result.touchedSlots.map(slot => ({
          field: `${slot.dayName} (Week ${slot.weekNumber})`,
          before: slot.before,
          after: slot.after ?? '— removed (no safe alternative)',
        }))
    rows.push({
      field: 'Injuries',
      before: profile.injuries.includes(injuryCode) ? injuryCode.replace('_', ' ') : 'not listed',
      after: `${injuryCode.replace('_', ' ')} — added`,
    })
    const implications: { severity: 'info' | 'warn'; text: string }[] = mode === 'rebuild'
      ? [
          { severity: 'warn', text: `This injury rules out too much of your current plan to patch it exercise by exercise — I'd rebuild the whole programme around it instead, keeping the same number of sessions and adding work that helps the joint.` },
          { severity: 'info', text: `It also goes on your injuries list, so future plans avoid it too — this does not revert on its own.` },
        ]
      : [
          { severity: 'info', text: `Adjusts your plan for the rest of this program AND adds this to your injuries, so future plans avoid it too — this does not revert on its own.` },
        ]
    if (mode === 'substitute' && result.droppedPatterns.length > 0) {
      implications.push({ severity: 'warn', text: `Some movements had no safe alternative this round and were dropped rather than faked.` })
    }

    return {
      scopeKey: `${profile.id}:propose_injury_as_lasting:${injuryCode}:${startWeek}`,
      preconditions: { injuryCode, startWeek, weekNumbers },
      payload: { injuryCode, weekNumbers, exclusions: exerciseExclusions, mode, reason: typeof rawArgs.reason === 'string' ? rawArgs.reason : undefined },
      preImage: mesocycle,
      diff: {
        rows,
        implications,
        rationale: typeof rawArgs.reason === 'string' ? rawArgs.reason : undefined,
        reversible: false,
      },
    }
  }

  /**
   * The inverse of buildLastingInjuryProposal — removes a lasting injury.
   * Returns null when the area isn't actually in profile.injuries (falls
   * through to processResponse's generic "couldn't find that" fallback,
   * same as every other build*Proposal's null-return convention in this
   * file) rather than the model needing to already know the current list.
   */
  const buildInjuryRecoveredProposal = (rawArgs: Record<string, unknown>): {
    scopeKey: string
    preconditions: Record<string, unknown>
    payload: InjuryRecoveredPayload
    diff: import('@/lib/pending-actions-store').ProposalDiff
  } | null => {
    const injuryCode = String(rawArgs.affected_area ?? '')
    if (!injuryCode || !profile.injuries.includes(injuryCode)) return null

    return {
      scopeKey: `${profile.id}:propose_injury_recovered:${injuryCode}`,
      preconditions: { injuryCode },
      payload: { injuryCode },
      diff: {
        rows: [{ field: 'Injuries', before: injuryCode.replace('_', ' '), after: 'removed' }],
        implications: [
          { severity: 'info', text: `Future plans stop avoiding this area.` },
          { severity: 'warn', text: `This won't undo any exercise already swapped out for it — those stay as they are unless you swap them back yourself.` },
        ],
        reversible: false,
      },
    }
  }

  /** Mirrors buildInjuryAdaptationProposal exactly, for the equipment/travel adaptation (§3b). */
  const buildEquipmentAdaptationProposal = async (rawArgs: Record<string, unknown>): Promise<{
    scopeKey: string
    preconditions: Record<string, unknown>
    payload: EquipmentAdaptationPayload
    preImage: MesocycleWeek[]
    diff: import('@/lib/pending-actions-store').ProposalDiff
  } | null> => {
    const equipmentTier = String(rawArgs.equipment_tier ?? '') as UserProfile['equipment_access']
    const durationDays = Number(rawArgs.duration_days)
    if (!equipmentTier || !durationDays || durationDays <= 0 || mesocycle.length === 0) return null

    const startWeek = activeSession.liveWeek
    const weekSpan = Math.max(1, Math.ceil(durationDays / 7))
    const weekNumbers = mesocycle
      .map(w => w.week_number)
      .filter(n => n >= startWeek && n < startWeek + weekSpan)
    if (weekNumbers.length === 0) return null

    const result = await substituteForEquipment({
      mesocycle, profile, equipmentTier, weekNumbers, exclusions: exerciseExclusions,
    })
    if (result.touchedSlots.length === 0) return null

    const rows = result.touchedSlots.map(slot => ({
      field: `${slot.dayName} (Week ${slot.weekNumber})`,
      before: slot.before,
      after: slot.after ?? '— removed (not trainable with this equipment)',
    }))
    const implications: { severity: 'info' | 'warn'; text: string }[] = [
      { severity: 'info', text: `Applies for ${durationDays} day${durationDays === 1 ? '' : 's'}, then reverts to your normal plan automatically.` },
    ]
    if (result.droppedPatterns.length > 0) {
      implications.push({ severity: 'warn', text: `A pattern genuinely can't be trained with this equipment this round — skipped, not faked.` })
    }

    return {
      scopeKey: `${profile.id}:propose_equipment_adaptation:${equipmentTier}:${startWeek}`,
      preconditions: { equipmentTier, startWeek, weekNumbers },
      payload: { equipmentTier, durationDays, weekNumbers, exclusions: exerciseExclusions, reason: typeof rawArgs.reason === 'string' ? rawArgs.reason : undefined },
      preImage: mesocycle,
      diff: {
        rows,
        implications,
        rationale: typeof rawArgs.reason === 'string' ? rawArgs.reason : undefined,
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
  const resolveAndSaveMemory = async (intent: { tool: 'record_fact' | 'record_goal' | 'record_context_fact' | 'set_display_name'; rawArgs: Record<string, unknown> }): Promise<{ text: string; receipt?: ChatReceiptView }> => {
    const args = intent.rawArgs
    const profileId = profile.id
    if (!profileId) return { text: "I can't save that yet — your profile hasn't finished setting up." }

    if (intent.tool === 'set_display_name') {
      // A name is an observation about the person, not a plan mutation, so
      // it takes the same IMMEDIATE road as record_context_fact rather than
      // a confirmation card (Ashley's call). The receipt is what keeps
      // "no silent writes" true; correcting it is just saying another name,
      // which is why there is no undo token here.
      const name = String(args.display_name || '').trim().slice(0, 30)
      if (!name) return { text: '' }
      await updateProfileField(profileId, { display_name: name })
      // Keeps App.tsx's profile state in step with a write chat made
      // outside its own setProfile calls — same reason the injury path
      // calls this.
      onProfileChanged({ display_name: name })
      return {
        text: `${name} it is.`,
        receipt: {
          kind: 'display_name_saved',
          title: 'Name updated',
          rows: [{ label: "I'll call you", detail: name }],
          status: 'done',
          resolvedAt: new Date().toISOString(),
        },
      }
    }

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
        // Fix 1b — a hard food dislike used to claim "excluded from your
        // meals" immediately, which was false: exclusion only takes effect
        // on the next manual regenerate (dislikedFoods only reaches
        // verifyProposal's filter at generation time), so a meal containing
        // the disliked food already on today's plan stays there untouched.
        // Now: honest not-yet-applied wording, matching the hard_constraint/
        // timing_rule branches' own convention — and if today's plan
        // actually still has it, that's surfaced as its own row instead of
        // silently leaving the user to find out by eating it, mirroring the
        // same plain-substring match verifyProposal itself uses.
        const effect = kind === 'exercise_preference' && hardness === 'hard'
          ? `excludes ${resolution.resolvedRefs.length} exercise${resolution.resolvedRefs.length === 1 ? '' : 's'} from your plan`
          : hardness === 'hard' ? "recorded — excluded starting your next meal regenerate, doesn't touch today's plan" : 'recorded — biases suggestions, nothing removed'
        const rows: ChatReceiptView['rows'] = [{ label: displayText, detail: effect }]
        if (kind === 'food_preference' && hardness === 'hard' && polarity === 'dislike') {
          const needle = targetPhrase.trim().toLowerCase()
          const stillPresent = mealPlan.filter(m =>
            m.items.some(i => i.name.toLowerCase().includes(needle) || (i.ingredients ?? []).some(ing => ing.toLowerCase().includes(needle)))
          )
          if (needle && stillPresent.length > 0) {
            rows.push({
              label: `Today's ${stillPresent.map(m => m.meal).join(', ')}`,
              detail: 'still has it — swap from the Nutrition tab if you don\'t want it today',
            })
          }
        }
        return {
          text: `Saved: ${displayText}`,
          receipt: {
            kind: 'memory_fact_saved',
            title: 'Saved to memory',
            rows,
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

  /**
   * VISION-ARCHITECTURE.md §5.4 — the append-only IMMEDIATE chat door: no
   * ProposalCard, no pending_actions row, ever (Decision #1: append-only
   * writes execute + receipt + undo, never a confirm gate). I1 holds: this
   * is the ONE place the client writes grocery_items, mirroring
   * resolveAndSaveMemory exactly. `undoToken` packs `id`, `addedQuantity`
   * and `created` (JSON-encoded) since undo needs all three to reverse a
   * merge-onto-an-existing-line correctly, not just delete a row.
   */
  const resolveAndSaveGrocery = async (intent: { tool: 'add_to_grocery_list' | 'check_off_grocery_item'; rawArgs: Record<string, unknown> }): Promise<{ text: string; receipt?: ChatReceiptView }> => {
    const args = intent.rawArgs
    const profileId = profile.id
    if (!profileId) return { text: "I can't update that yet — your profile hasn't finished setting up." }

    if (intent.tool === 'check_off_grocery_item') {
      const phrase = String(args.item_phrase || '').trim().toLowerCase()
      if (!phrase) return { text: '' }
      const current = await getAllGroceryItems(profileId)
      const matches = current.filter(i => !i.checked && (i.display_name.toLowerCase().includes(phrase) || phrase.includes(i.display_name.toLowerCase())))
      if (matches.length === 0) return { text: `I don't see "${args.item_phrase}" on your list.` }
      if (matches.length > 1) return { text: `A few items match "${args.item_phrase}" — which one: ${matches.map(m => m.display_name).join(', ')}?` }
      const row = setCheckedLocal(matches[0], true)
      return {
        text: `Checked off ${row.display_name}.`,
        receipt: {
          kind: 'grocery_item_added',
          title: 'Checked off',
          rows: [{ label: row.display_name, detail: 'checked off your list' }],
          status: 'done',
          resolvedAt: new Date().toISOString(),
        },
      }
    }

    const items = Array.isArray(args.items) ? args.items as { name?: string; quantity?: number; unit?: string }[] : []
    const named = items.filter(i => i.name && String(i.name).trim())
    if (named.length === 0) return { text: '' }

    const currentItems = await getAllGroceryItems(profileId)
    const added: { name: string; row: GroceryItemRow; addedQuantity: number; created: boolean }[] = []
    let workingItems = currentItems
    for (const item of named) {
      const result = addItemLocal({
        profileId, name: String(item.name).trim(),
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : 'whole',
        source: 'chat', currentItems: workingItems,
      })
      added.push({ name: String(item.name).trim(), row: result.row, addedQuantity: result.addedQuantity, created: result.created })
      workingItems = workingItems.some(i => i.id === result.row.id) ? workingItems.map(i => (i.id === result.row.id ? result.row : i)) : [...workingItems, result.row]
    }
    await onGroceryChanged?.()

    // Undo needs (id, addedQuantity, created) per row to reverse either a
    // fresh insert or a merge-onto-existing-line correctly — packed as JSON
    // since ChatReceiptView.undoToken is a single opaque string.
    const undoToken = JSON.stringify(added.map(a => ({ id: a.row.id, addedQuantity: a.addedQuantity, created: a.created })))
    return {
      text: `Added to your list: ${added.map(a => a.row.display_name).join(', ')}.`,
      receipt: {
        kind: 'grocery_item_added',
        title: 'Added to your list',
        rows: added.map(a => ({ label: a.row.display_name, detail: CATEGORY_LABEL_FOR_RECEIPT[a.row.category] })),
        status: 'done',
        undoToken,
        resolvedAt: new Date().toISOString(),
      },
    }
  }

  /**
   * VISION-ARCHITECTURE.md §5.4 — the water-log chat door, same shape as
   * resolveAndSaveGrocery: IMMEDIATE, no ProposalCard, ever. amount_ml
   * defaults to 250 (one glass) when the model gave none, matching the
   * dashboard's own quick-add buttons rather than inventing a second
   * default. undoToken is just the row id — a fresh log has nothing to
   * merge onto (water-store doesn't coalesce logs by day the way grocery
   * coalesces by canonical_key), so undo is always a straight delete.
   */
  const resolveAndSaveWater = async (intent: { tool: 'log_water'; rawArgs: Record<string, unknown> }): Promise<{ text: string; receipt?: ChatReceiptView }> => {
    const args = intent.rawArgs
    const profileId = profile.id
    if (!profileId) return { text: "I can't log that yet — your profile hasn't finished setting up." }

    const amountMl = typeof args.amount_ml === 'number' && args.amount_ml > 0 ? Math.round(args.amount_ml) : 250
    const row = logWater({ profileId, date: activeSession.date, amountMl, source: 'chat' })
    await onWaterChanged?.()

    return {
      text: `Logged ${amountMl}ml of water.`,
      receipt: {
        kind: 'water_logged',
        title: 'Water logged',
        rows: [{ label: `${amountMl}ml`, detail: 'added to today' }],
        status: 'done',
        undoToken: row.id,
        resolvedAt: new Date().toISOString(),
      },
    }
  }

  /**
   * @param correctsPrevious  The user is FIXING what was just logged, not
   *   adding to it. Replaces the named exercises' sets for the day instead of
   *   appending. See the executor's comment: "No 3x10 deadlifts" previously
   *   produced 6 logged sets against 3 prescribed, and every future weight
   *   would have built on three sets that never happened.
   */
  const resolveAndMaybeLog = (entries: WorkoutEntryInput[], correctsPrevious = false): { text: string; receipt?: ChatReceiptView; clarification?: ChatClarificationView } => {
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
    const { rows, totalSets, loggedKeys, replacedSets } = executeLogWorkout(parsed.groups, {
      profileId: activeSession.profileId ?? '',
      date: activeSession.date,
      weekNumber: activeSession.liveWeek,
      dayName: activeSession.dayName,
      setsFor: activeSession.setsFor,
      logSet: activeSession.logSet,
      declareOffPlan: activeSession.declareOffPlan,
      todaysPlanSetCounts,
      todaysPlanLoads,
      replaceExisting: correctsPrevious,
      deleteSet: key => activeSession.deleteSet({
        userId: activeSession.profileId ?? '',
        date: activeSession.date,
        exerciseId: key.exerciseId,
        setNumber: key.setNumber,
      }),
    })
    onLogsUpdated?.()
    const exerciseCount = parsed.groups.filter((g: ParsedSetGroup) => !g.routesToCardio).length
    // SAY WHICH IT DID. A correction and an addition write the same rows, so
    // without this the receipt for "no, 3x10" is indistinguishable from the
    // receipt for "I did 3 more" — and the wrong one of those quietly doubles
    // the session. Naming the replaced count makes a mis-call visible on the
    // spot, while Undo is still one tap away.
    const summary = replacedSets > 0
      ? `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} · ${totalSets} set${totalSets === 1 ? '' : 's'} · replaced ${replacedSets}`
      : `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} · ${totalSets} set${totalSets === 1 ? '' : 's'}`
    const title = replacedSets > 0 ? `Corrected · ${activeSession.dayName}` : `Logged · ${activeSession.dayName}`
    return {
      text: title,
      receipt: {
        kind: 'log_workout',
        title,
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
      // A builder that refuses for a REASON puts it here, so the fallback
      // below says why instead of the generic "I couldn't find that on your
      // current plan" — which for a meal rejected on an allergen would be
      // both unhelpful and untrue.
      let refusal: string | null = null
      // The exhausted-pool case answers a propose_meal_swap call with a
      // DIFFERENT kind of card. Plain text would have been the trap the
      // record_fact fix already documented here: an offer with no
      // pending_actions row means a later "yes" has nothing to resolve and
      // goes back through the model, which can misclassify it again and loop.
      let kindOverride: string | null = null

      if (result.proposal.kind === 'propose_meal_swap' && result.proposal.rawArgs) {
        // The client chooses the target, not the server — see
        // meal-swap-proposal.ts. `mealOptionsSeen` is what makes "you've seen
        // the lot" a fact rather than a guess: it is every option this
        // conversation has actually put in front of them for this slot.
        const swap = await buildMealSwapProposal({
          rawArgs: result.proposal.rawArgs,
          profileId: profile.id,
          alreadySeen: mealOptionsSeenRef.current[result.proposal.rawArgs.meal_slot as MealSlotName] ?? [],
        })
        if (swap.ok) {
          built = { scopeKey: swap.scopeKey, preconditions: swap.preconditions, payload: swap.payload as unknown as Record<string, unknown>, diff: swap.diff }
          noteMealOptionSeen(swap.payload.slot, swap.payload.chooseName)
          noteMealOptionSeen(swap.payload.slot, swap.payload.currentName)
        } else if (swap.exhausted) {
          // Ashley's ruling: offer, never do it for them — generating costs
          // money. The card is the offer; Confirm is the only thing that
          // spends anything, and their existing options are kept either way.
          const { slot: exSlot, poolSize } = swap.exhausted
          kindOverride = 'propose_meal_pool_refresh'
          built = {
            scopeKey: `${profile.id}:propose_meal_pool_refresh:${exSlot}`,
            preconditions: { slot: exSlot, poolSizeAtOffer: poolSize },
            payload: { slot: exSlot },
            diff: {
              rows: [{ field: `${exSlot} options`, before: `${poolSize} saved`, after: `${poolSize} saved, plus new ones` }],
              implications: [
                { severity: 'info', text: 'Your current options are kept — these are added alongside them.' },
                { severity: 'info', text: 'Takes a few seconds while I put them together.' },
              ],
              rationale: swap.reason,
              reversible: false,
            },
          }
        } else {
          refusal = swap.reason
        }
      } else if (result.proposal.kind === 'propose_meal_addition' && result.proposal.rawArgs) {
        // The verification gate for a user-requested dish. buildMealAddition-
        // Proposal runs it through verifyProposal — the same function every
        // generated meal passes — so an allergen, an unmeasurable ingredient
        // or a dish that can't be portioned into the slot's budget is refused
        // HERE, before any pending_actions row exists to confirm.
        if (!macros) {
          refusal = "I need your height, weight, age and sex before I can fit a meal to your targets — you can add them in Profile."
        } else {
          const addition = buildMealAdditionProposal({
            rawArgs: result.proposal.rawArgs,
            profileId: profile.id,
            targets: macros,
            mealsPerDay: profile.meals_per_day,
            includeSnacks: profile.include_snacks,
            dietaryPreferences: profile.dietary_preferences ?? [],
            dislikedFoods: profile.disliked_foods ?? [],
            todayDate: getSessionDateContext(profile.id).date,
          })
          if (addition.ok) built = { scopeKey: addition.scopeKey, preconditions: addition.preconditions, payload: addition.payload as unknown as Record<string, unknown>, diff: addition.diff }
          else refusal = addition.reason
        }
      } else if (result.proposal.kind === 'propose_exercise_swap' && result.proposal.rawArgs) {
        const swap = buildExerciseSwapProposal(result.proposal.rawArgs)
        if (swap) built = { scopeKey: swap.scopeKey, preconditions: swap.preconditions, payload: swap.payload as unknown as Record<string, unknown>, preImage: swap.preImage, diff: swap.diff }
      } else if (result.proposal.kind === 'propose_injury_adaptation' && result.proposal.rawArgs) {
        const adaptation = await buildInjuryAdaptationProposal(result.proposal.rawArgs)
        if (adaptation) built = { scopeKey: adaptation.scopeKey, preconditions: adaptation.preconditions, payload: adaptation.payload as unknown as Record<string, unknown>, preImage: adaptation.preImage, diff: adaptation.diff }
      } else if (result.proposal.kind === 'propose_injury_as_lasting' && result.proposal.rawArgs) {
        const lasting = await buildLastingInjuryProposal(result.proposal.rawArgs)
        if (lasting) built = { scopeKey: lasting.scopeKey, preconditions: lasting.preconditions, payload: lasting.payload as unknown as Record<string, unknown>, preImage: lasting.preImage, diff: lasting.diff }
      } else if (result.proposal.kind === 'propose_injury_recovered' && result.proposal.rawArgs) {
        const recovered = buildInjuryRecoveredProposal(result.proposal.rawArgs)
        if (recovered) built = { scopeKey: recovered.scopeKey, preconditions: recovered.preconditions, payload: recovered.payload as unknown as Record<string, unknown>, diff: recovered.diff }
      } else if (result.proposal.kind === 'propose_equipment_adaptation' && result.proposal.rawArgs) {
        const adaptation = await buildEquipmentAdaptationProposal(result.proposal.rawArgs)
        if (adaptation) built = { scopeKey: adaptation.scopeKey, preconditions: adaptation.preconditions, payload: adaptation.payload as unknown as Record<string, unknown>, preImage: adaptation.preImage, diff: adaptation.diff }
      } else if (APPEND_PROPOSAL_KINDS.has(result.proposal.kind) && result.proposal.rawArgs) {
        // Structural fix: record_fact/record_goal/add_to_grocery_list/
        // check_off_grocery_item/log_water now arrive here too whenever
        // classifyImperative didn't confidently classify the request —
        // previously a bare offer with nothing to resolve on a later "yes".
        built = buildIntentProposal(result.proposal.kind, result.proposal.rawArgs, profile.id)
      } else if (result.proposal.diff && result.proposal.payload && result.proposal.scopeKey) {
        built = { scopeKey: result.proposal.scopeKey, preconditions: result.proposal.preconditions ?? {}, payload: result.proposal.payload, preImage: result.proposal.preImage, diff: result.proposal.diff }
      }

      if (!built) {
        return { text: refusal ?? "I couldn't find that on your current plan — it may have changed since you last looked." }
      }

      const proposalKind = kindOverride ?? result.proposal.kind
      const row = await createPendingAction({
        profileId: profile.id,
        actionClass: APPEND_PROPOSAL_KINDS.has(proposalKind) ? 'append' : 'plan_mutation',
        kind: proposalKind,
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
      return resolveAndMaybeLog(entries, result.logWorkout.corrects_previous === true)
    }
    if (result.memoryIntent) {
      return resolveAndSaveMemory(result.memoryIntent)
    }
    if (result.groceryIntent) {
      return resolveAndSaveGrocery(result.groceryIntent)
    }
    if (result.waterIntent) {
      return resolveAndSaveWater(result.waterIntent)
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
  /** Most recent message still awaiting a yes/no on its ProposalCard, or -1. */
  const findOpenPendingActionIndex = (): number => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].pendingAction?.status === 'pending') return i
    }
    return -1
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return
    if (navigator.vibrate) navigator.vibrate(10)

    const userText = input.trim()
    const now = new Date().toISOString()
    const userMessage: ChatMessage = { role: 'user', content: userText, status: 'complete', created_at: now }
    setMessages(prev => [...prev, userMessage])
    setInput('')

    // Fix — confirmation-card stuck loop: a clear free-text yes/no to a
    // still-open proposal resolves it directly through the SAME path
    // ProposalCard's own Confirm/Not now buttons use, never sent to the
    // model — the model has no tool that means "the user just confirmed,"
    // so a bare "Yes" would otherwise get re-classified as a failed
    // imperative and re-propose the identical question forever (only "No"
    // could escape by accident, since declining needs no tool call at all).
    const openPendingIdx = findOpenPendingActionIndex()
    if (openPendingIdx !== -1) {
      const verdict = classifyConfirmationReply(userText)
      if (verdict !== 'ambiguous') {
        persistUserMessage(userText)
        setIsLoading(true)
        try {
          if (verdict === 'confirm') await handleConfirmProposal(openPendingIdx)
          else await handleRejectProposal(openPendingIdx)
        } finally {
          setIsLoading(false)
        }
        return
      }
    }

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
      // Fix 0.13 (ux-sweep) — every failure path used to funnel through
      // here into one of two states, and only ONE of them was honest: a
      // server-classified error (`retryable`, set explicitly by callGemini
      // on a non-ok response) got the real "something went wrong, tap
      // Retry" treatment, but anything else — critically, a raw network
      // failure (offline, DNS, CORS — `fetch` itself rejecting with no
      // `.retryable` field) — fell into an `else` branch that silently
      // faked success: a local keyword-matched canned reply, persisted
      // with status 'complete', identical in every visible way to a real
      // answer. Offline is the single most common way this branch was hit,
      // and it was the one case where the user's message provably never
      // reached the coach at all. Every failure now gets the same honest
      // "didn't go through, tap Retry" treatment — there is no longer a
      // silent-success path.
      failed = true
      const error = err as { message?: string; retryable?: boolean }
      const isTimeout = err instanceof DOMException && err.name === 'AbortError'
      // error.retryable is only ever set by callGemini's own deliberate
      // throws, whose .message is written for display. Anything else (a
      // raw fetch rejection — offline, DNS, CORS) carries a message meant
      // for a console, not a user, so it's replaced with the same honest
      // copy rather than surfacing "Failed to fetch" verbatim.
      const displayMessage = error.retryable
        ? (error.message || 'Something went wrong with the AI service. Tap "Retry" to try again.')
        : 'Couldn\'t reach the coach — check your connection and tap "Retry".'
      responseText = isTimeout
        ? '_That request took too long to process. Tap "Retry" to try again._'
        : `_${displayMessage}_`
      setLastFailedInput(userText)
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
    // A just-arrived reply gets the typewriter reveal; restored history
    // never does (see TypewriterMarkdown.tsx / findOpenPendingActionIndex's
    // sibling render check below).
    if (placeholderId && cleanedText) setAnimatingMessageId(placeholderId)
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
      // On a phone this key is the IME's "Go" action, whose default is to put
      // the keyboard away. See composer-focus.ts — same defect the onboarding
      // composer was measured failing.
      refocusComposer(composerRef.current)
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
    // Set only by the append-kinds branch below — resolveAndSaveMemory/
    // Grocery/Water already build a complete, ready-to-render ChatReceiptView
    // (title/rows/status/undoToken/resolvedAt), richer than the generic
    // title/rows reconstruction every other branch does. When present, the
    // tail below uses this verbatim instead of rebuilding it.
    let richReceipt: ChatReceiptView | undefined

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
      let ok = receipt.failed.length === 0 && !!result.appliedName
      if (ok && result.appliedName) {
        // The step that actually makes the swap visible — without this the
        // receipt would claim a swap the Nutrition tab never shows.
        // Awaited and checked: a receipt must never say "Swapped" for a
        // pick that didn't actually persist (fire-and-forget here would
        // reintroduce the exact bug the pool-level swap fix just closed).
        const persisted = await onMealSwapApplied(payload.slot, result.appliedName)
        if (!persisted) {
          receipt = { ...receipt, failed: [...receipt.failed, { op: 'save', error: "The swap didn't save — try again" }] }
          ok = false
        }
      }
      title = ok ? 'Swapped' : "Couldn't apply the swap"
      rows = ok ? [{ label: payload.slot, detail: `→ ${result.appliedName}` }] : []
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
    } else if (row.kind === 'propose_meal_pool_refresh') {
      const slot = (row.payload as { slot: MealSlotName }).slot
      const result = await onFindMoreMealOptions(slot)
      const ok = result.added.length > 0
      if (ok) {
        // The new options join the pool, so "you've seen them all" is
        // genuinely over — clearing the record is what lets the next swap
        // propose one of them instead of re-offering the refresh forever.
        mealOptionsSeenRef.current[slot] = []
      }
      receipt = ok
        ? { landed: result.added.map(n => `${slot}: + ${n}`), failed: [] }
        : { landed: [], failed: [{ op: 'propose_meal_pool_refresh', error: result.error ?? `Couldn't find any new ${slot} options that fit your targets` }] }
      title = ok ? `${result.added.length} new option${result.added.length === 1 ? '' : 's'}` : "Couldn't find new options"
      rows = ok ? result.added.map(n => ({ label: slot, detail: n })) : []
      // No undo: generating already cost a model call, and undoing would only
      // delete options the user can ignore for free.
    } else if (row.kind === 'propose_meal_addition') {
      const payload = row.payload as unknown as MealAdditionPayload
      const result = await executeMealAddition(profile.id, payload)
      receipt = result.receipt
      let ok = receipt.failed.length === 0
      if (ok) {
        // The pool write landed; now make it the pick. Today goes through
        // onMealSwapApplied — the same path a confirmed swap uses, and the
        // only one that also updates what the Nutrition tab is rendering
        // right now. A future date has no on-screen state to update, so it
        // writes the pick directly.
        const todayDate = getSessionDateContext(profile.id).date
        let picked = true
        if (payload.date === todayDate) {
          picked = await onMealSwapApplied(payload.slot, payload.option.name)
        } else {
          try { await setMealPick(profile.id, payload.date, payload.slot, payload.option.name) } catch { picked = false }
        }
        if (!picked) {
          // Roll the pool write back rather than leaving a meal in the plan
          // that the receipt is about to say couldn't be added.
          await undoMealAddition(profile.id, payload)
          receipt = { landed: [], failed: [{ op: 'save', error: "The meal didn't save — try again" }] }
          ok = false
        }
      }
      title = ok ? 'Added' : "Couldn't add the meal"
      rows = ok ? [{ label: payload.slot, detail: `+ ${payload.option.name}` }] : []
      undoToken = ok ? row.id : undefined
    } else if (row.kind === 'propose_injury_adaptation') {
      const payload = row.payload as unknown as InjuryAdaptationPayload
      const result = await executeInjuryAdaptation(profile, mesocycle, payload)
      onMesocycleUpdated(result.mesocycle)
      receipt = result.receipt
      const ok = receipt.failed.length === 0
      title = ok ? 'Adjusted' : "Couldn't apply the adaptation"
      rows = ok ? receipt.landed.map(line => { const [label, detail] = line.split(': '); return { label, detail } }) : []
      if (ok && profile.id) {
        // No standard 10-minute Undo here — ending early is a separate,
        // longer-lived action (plan_adaptations.status='ended_early'), not
        // the receipt's own undo button.
        await createPlanAdaptation({
          profileId: profile.id,
          kind: 'injury',
          injuryCode: payload.injuryCode,
          reason: payload.reason,
          affectedWeekNumbers: payload.weekNumbers,
          preImage: result.preImage,
          pendingActionId: row.id,
          durationDays: payload.durationDays,
        })
      }
    } else if (row.kind === 'propose_injury_as_lasting') {
      const payload = row.payload as unknown as LastingInjuryPayload
      const result = await executeLastingInjury(profile, mesocycle, payload)
      onMesocycleUpdated(result.mesocycle)
      // executeLastingInjury already wrote fitness_profiles.injuries — keep
      // App.tsx's profile state in lockstep, same reasoning onMesocycleUpdated
      // exists for: the executor is pure and returns what changed rather than
      // mutating App.tsx's state directly.
      onProfileChanged({ injuries: profile.injuries.includes(payload.injuryCode) ? profile.injuries : [...profile.injuries, payload.injuryCode] })
      receipt = result.receipt
      const ok = receipt.failed.length === 0
      title = ok ? 'Injury saved' : "Couldn't save this"
      rows = ok ? receipt.landed.map(line => { const [label, detail] = line.split(': '); return { label, detail } }) : []
      // No plan_adaptations row — nothing time-bounded here to expire.
    } else if (row.kind === 'propose_injury_recovered') {
      const payload = row.payload as unknown as InjuryRecoveredPayload
      const result = await executeInjuryRecovered(profile, payload)
      onProfileChanged({ injuries: profile.injuries.filter(i => i !== payload.injuryCode) })
      receipt = result.receipt
      const ok = receipt.failed.length === 0
      title = ok ? 'Injury removed' : "Couldn't save this"
      rows = ok ? receipt.landed.map(line => { const [label, detail] = line.split(': '); return { label, detail } }) : []
    } else if (row.kind === 'propose_equipment_adaptation') {
      const payload = row.payload as unknown as EquipmentAdaptationPayload
      const result = await executeEquipmentAdaptation(profile, mesocycle, payload)
      onMesocycleUpdated(result.mesocycle)
      receipt = result.receipt
      const ok = receipt.failed.length === 0
      title = ok ? 'Adjusted' : "Couldn't apply the adaptation"
      rows = ok ? receipt.landed.map(line => { const [label, detail] = line.split(': '); return { label, detail } }) : []
      if (ok && profile.id) {
        await createPlanAdaptation({
          profileId: profile.id,
          kind: 'equipment',
          equipmentOverride: payload.equipmentTier,
          reason: payload.reason,
          affectedWeekNumbers: payload.weekNumbers,
          preImage: result.preImage,
          pendingActionId: row.id,
          durationDays: payload.durationDays,
        })
      }
    } else if (APPEND_PROPOSAL_KINDS.has(row.kind)) {
      // Structural fix: the confirm side of buildIntentProposal — reuses
      // the SAME resolveAndSaveMemory/Grocery/Water functions the direct
      // (successfully-classified) path already calls, so this is not a
      // second write path, just a deferred call to the existing one.
      const payload = row.payload as unknown as { tool: string; rawArgs: Record<string, unknown> }
      const intent = { tool: payload.tool, rawArgs: payload.rawArgs }
      const saveResult = row.kind === 'record_fact' || row.kind === 'record_goal'
        ? await resolveAndSaveMemory(intent as Parameters<typeof resolveAndSaveMemory>[0])
        : row.kind === 'add_to_grocery_list' || row.kind === 'check_off_grocery_item'
        ? await resolveAndSaveGrocery(intent as Parameters<typeof resolveAndSaveGrocery>[0])
        : await resolveAndSaveWater(intent as Parameters<typeof resolveAndSaveWater>[0])

      if (saveResult.receipt) {
        richReceipt = saveResult.receipt
        title = saveResult.receipt.title
        rows = saveResult.receipt.rows.map(r => ({ label: r.label, detail: r.detail }))
        undoToken = saveResult.receipt.undoToken
        receipt = { landed: [saveResult.receipt.title], failed: [] }
      } else {
        // resolveAndSaveMemory/Grocery/Water can still ask a clarifying
        // question (e.g. an unresolved exercise target) instead of writing
        // — the row is already claimed, so it resolves as a soft failure
        // with that question surfaced, rather than silently vanishing.
        receipt = { landed: [], failed: [{ op: row.kind, error: saveResult.text || 'Needs more detail' }] }
        title = 'Need more detail'
        rows = saveResult.text ? [{ label: 'Note', detail: saveResult.text }] : []
      }
    } else {
      receipt = { landed: [], failed: [{ op: row.kind, error: 'Not available yet' }] }
      title = "Couldn't apply that"
    }

    const status: 'done' | 'partial' | 'failed' = receipt.failed.length === 0 ? 'done' : (receipt.landed.length > 0 ? 'partial' : 'failed')
    await resolvePendingAction(row.id, status, receipt)

    setMessages(prev => prev.map((m, i) => i === msgIndex
      ? { ...m, pendingAction: undefined, receipt: richReceipt ?? { kind: row.kind as ChatReceiptView['kind'], title, rows, status, result: receipt, undoToken, resolvedAt: new Date().toISOString() } }
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
      // deleteSet is the raw store function (unlike logSet, which already
      // calls refresh() after writing) — without this, the Exercise tab's
      // dot ladder, TodayPanel progress, dock chip, and dashboard aggregate
      // (all read from activeSession.logs) keep showing the "undone" sets
      // until an unrelated reload, even though the DB row is really gone.
      activeSession.refresh()
      onLogsUpdated?.()
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
    } else if (receipt.kind === 'grocery_item_added') {
      // §5.4/§2.5 — undoToken is a JSON-encoded list of {id, addedQuantity,
      // created} (one per item added this turn), since undoing a merge onto
      // an existing line means subtracting back out, not deleting the row.
      if (!isWithinUndoWindow(receipt.resolvedAt ?? null)) return
      const entries: { id: string; addedQuantity: number; created: boolean }[] = JSON.parse(receipt.undoToken)
      const current = await getAllGroceryItems(profile.id)
      for (const entry of entries) {
        const row = current.find(i => i.id === entry.id)
        if (row) undoAddLocal(row, entry.addedQuantity, entry.created)
      }
      await onGroceryChanged?.()
    } else if (receipt.kind === 'water_logged') {
      // undoToken is just the row id — a fresh log has nothing to merge
      // onto (unlike grocery's canonical_key coalescing), so undo is
      // always a straight delete. undoLog only reads id/profile_id off
      // its argument, so a minimal object is safe here.
      if (!isWithinUndoWindow(receipt.resolvedAt ?? null)) return
      undoWaterLog({ id: receipt.undoToken, profile_id: profile.id } as Parameters<typeof undoWaterLog>[0])
      await onWaterChanged?.()
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
        const persisted = await onMealSwapApplied(payload.slot, payload.currentName)
        if (!persisted) return // leave the Undo button in place so the user can retry
      } else if (row.kind === 'propose_meal_addition') {
        // Removes the option from the pool AND clears the pick, both — an
        // undo that only dropped the pick would leave the meal sitting in
        // the slot's options forever, which is not what "undo" said.
        const payload = row.payload as unknown as MealAdditionPayload
        await undoMealAddition(profile.id, payload)
        // Nothing to restore as the on-screen pick: the slot had whatever
        // assembleDay chose before this, and clearing the pick is what makes
        // the Nutrition tab fall back to it. onMealSwapApplied can't express
        // "no pick", so the reload does it.
        await onMealSwapApplied(payload.slot, '')
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

  const { dockHeightPx } = useBottomDockHeight()

  // Ride above BottomDock when it's showing, not underneath it. The dock is
  // fixed to the same baseline as this composer and sits at z-50 against our
  // z-40, so a running rest timer used to cover the input completely and a
  // session chip clipped the placeholder — reported from a real gym session,
  // where "ask the coach something mid-set" is exactly when the dock is up.
  // dockHeightPx is measured by the dock itself (see useBottomDockHeight);
  // it's 0 whenever the dock is hidden, so this collapses to the old value.
  // The extra 12px matches the dock's own gap above the tab bar, keeping the
  // two apart rather than flush.
  const dockGapPx = dockHeightPx > 0 ? dockHeightPx + 12 : 0
  const composerBottomStyle = composerKeyboardOpen
    // Keyboard open: the tab bar hides and the dock rides the keyboard inset
    // too, so stack above it there as well.
    ? { bottom: composerInsetPx + 16 + dockGapPx }
    : { bottom: `calc(${TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom) + ${dockGapPx}px)` }

  // HOW MUCH OF THE THREAD THE COMPOSER IS SITTING ON, MEASURED.
  //
  // The Card is `h-[600px] max-h-[80dvh]` — a fixed box — while the composer
  // is `position: fixed` to the VIEWPORT. With the keyboard shut they don't
  // meet (measured at 390x844: card ends 648, composer starts 704). Open the
  // keyboard and the composer rides UP into the card: composer top 416
  // against a card bottom of 648, so it covers 232px of the message list and
  // the newest message — at 512-552 — is entirely behind it. The scroller
  // reserved a static `pb-24`, 96px, which never grew.
  //
  // That is the same defect reported on the onboarding composer, on the other
  // screen. Onboarding grows its padding by `insetPx + 112` because its
  // scroller ends at the viewport bottom; this one ends at the CARD's bottom,
  // which sits an unknown distance above that (it depends on App.tsx's own
  // page padding). So the overlap is measured rather than derived from a
  // constant that would silently go stale the moment that padding changes.
  //
  // No feedback loop: padding is inside the border box, so growing it does
  // not move the scroller's own getBoundingClientRect().bottom.
  const [composerClearancePx, setComposerClearancePx] = useState(0)
  useLayoutEffect(() => {
    const sc = scrollRef.current, box = composerBoxRef.current
    if (!sc || !box) return
    const overlap = sc.getBoundingClientRect().bottom - box.getBoundingClientRect().top
    setComposerClearancePx(overlap > 0 ? Math.round(overlap + 12) : 0)
  }, [composerKeyboardOpen, composerInsetPx, dockHeightPx])

  return (
    <>
    <Card className="flex flex-col h-[600px] max-h-[80dvh]">
      <CardContent className="relative flex-1 flex flex-col p-0 overflow-hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClearChat}
          aria-label="Clear chat"
          title="Clear chat"
          className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm"
        >
          <Trash2 className="size-3.5" />
        </Button>
        <div
          // min-h-0: a flex item defaults to min-height:auto and refuses to
          // shrink below its content, so `flex-1 overflow-y-auto` grows the box
          // instead of scrolling inside it. Measured doing exactly that on the
          // onboarding composer (875px of canvas in an 844px viewport,
          // scrollHeight === clientHeight, every scrollTo a no-op). Added here
          // by parity — this screen was NOT measured, because the tour
          // harness's chat tab is a stub rather than the real component.
          className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 overscroll-contain"
          // pb-24 stays as the floor for the keyboard-shut case; this only
          // ever ADDS the measured overlap on top of it.
          style={composerClearancePx > 0 ? { paddingBottom: composerClearancePx } : undefined}
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
                  className="rounded-full bg-[color:var(--surface-raised)] px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors min-h-[44px]"
                >
                  {isLoadingOlder ? 'Loading...' : 'Load Previous Messages'}
                </button>
              </div>
            )}
            {messages.map((msg, i) => {
              const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1
              // Fix — quick-reply buttons must wait for the typewriter reveal
              // to finish (buttons popping in mid-sentence read as broken).
              // A message is still revealing exactly when its id equals
              // animatingMessageId; restored/cached messages never carry
              // that id in the first place, so they're never held back.
              const stillRevealing = isLastAssistant && msg.id != null && msg.id === animatingMessageId
              const quickReplies = isLastAssistant && !stillRevealing ? getQuickRepliesForLastMessage() : []
              // Turn 6 ("Coach chat — borders out, input fixed"): the
              // assistant no longer speaks from a bordered/tinted bubble —
              // it's plain text on the canvas, identified by a small mint
              // avatar mark instead. Only the user's own messages get a
              // fill now (a tinted pill with a tail corner), matching the
              // design doc's own bubble shape. Everything below the bubble
              // (proposal/receipt/clarification/quick-replies) still
              // belongs to this turn, so it gets the same left offset as
              // the avatar column for assistant turns, keeping it aligned
              // under the text rather than the avatar.
              const bodyContent = msg.role === 'user' ? (
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
                    className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--role-warn)] hover:underline"
                    onClick={() => retryMessage(i)}
                    disabled={isLoading}
                  >
                    {msg.status === 'failed' ? <AlertCircle className="size-3" /> : <RotateCcw className="size-3" />}
                    {msg.status === 'failed' ? 'Response failed — tap to retry' : 'Response interrupted — tap to retry'}
                  </button>
                </div>
              ) : (
                <TypewriterMarkdown
                  text={stripStreamingTags(msg.content)}
                  active={msg.id != null && msg.id === animatingMessageId}
                  speed={revealSpeed}
                  components={markdownComponents}
                  onDone={() => setAnimatingMessageId(prev => (prev === msg.id ? null : prev))}
                />
              )
              return (
                <div
                  key={msg.id || `msg-${i}`}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="max-w-[80%]">
                    {msg.role === 'user' ? (
                      <div className="rounded-2xl rounded-br-md bg-[rgba(var(--glow-rgb),.14)] px-4 py-2.5 text-sm whitespace-pre-wrap text-foreground">
                        {bodyContent}
                      </div>
                    ) : (
                      <div className="flex items-start gap-2.5">
                        <span
                          className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[#08281F]"
                          style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))', boxShadow: '0 0 18px rgba(var(--glow-rgb),.45)' }}
                        >
                          <MessageCircle className="size-3.5" strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-foreground">
                          {bodyContent}
                        </div>
                      </div>
                    )}
                    <div className={msg.role === 'assistant' ? 'pl-9' : undefined}>
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
                        onViewProfile={
                          msg.receipt.kind === 'memory_goal_saved' ? () => onOpenProfile?.('goals')
                          : msg.receipt.kind === 'memory_fact_saved' ? () => onOpenProfile?.('facts')
                          : msg.receipt.kind === 'memory_context_fact_saved' ? () => onOpenProfile?.('context')
                          : undefined
                        }
                        onViewGrocery={msg.receipt.kind === 'grocery_item_added' ? onOpenGrocery : undefined}
                        onViewDashboard={msg.receipt.kind === 'water_logged' ? onOpenDashboard : undefined}
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
                        className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--role-warn)] hover:underline"
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
                            className="rounded-full bg-[color:var(--surface-raised)] px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/80 min-h-[44px]"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
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
      </CardContent>
    </Card>
    {/* Turn 6: composer as a fixed-height pill (not three separate bordered
        controls) — room for two lines before it grows past that, a visible
        mint send target. Fixed (not sticky) and positioned exactly like
        BottomDock rides above the tab bar / keyboard — see the comment by
        useViewportInset's call above for why sticky never worked here. */}
    <div
      ref={composerBoxRef}
      className="fixed left-0 right-0 z-40 mx-auto max-w-6xl px-4 bg-gradient-to-t from-[color:var(--background)] from-60% to-transparent pt-3 pb-3"
      style={composerBottomStyle}
    >
      <div className="flex items-end gap-2.5 rounded-[20px] bg-[color:var(--surface-raised)] py-1.5 pl-4 pr-1.5">
        <Textarea
          ref={composerRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={speech.isListening ? 'Listening…' : 'Ask about your plan or request changes...'}
          className="min-h-[40px] max-h-[88px] flex-1 resize-none border-0 bg-transparent px-0 py-2 shadow-none focus-visible:ring-0"
          rows={1}
        />
        {speech.isSupported && (
          <Button
            type="button"
            variant={speech.isListening ? 'destructive' : 'ghost'}
            size="icon"
            {...keepsComposerFocus}
            onClick={handleMicClick}
            onPointerDown={() => {
              // Long-press (700ms) toggles the on-screen voice-debug trace —
              // see the TEMPORARY diagnostic comment above voiceDebugOn.
              // A press-and-hold that doesn't need devtools is the whole
              // point: this has to be reachable on a phone in the field.
              micLongPressTimerRef.current = window.setTimeout(() => {
                micLongPressFiredRef.current = true
                setVoiceDebugOn(prev => {
                  const next = !prev
                  localStorage.setItem('fitplan_voice_debug', next ? '1' : '0')
                  if (!next) setVoiceDebugLines([])
                  return next
                })
              }, 700)
            }}
            onPointerUp={() => { if (micLongPressTimerRef.current) window.clearTimeout(micLongPressTimerRef.current) }}
            onPointerLeave={() => { if (micLongPressTimerRef.current) window.clearTimeout(micLongPressTimerRef.current) }}
            aria-label={speech.isListening ? 'Stop voice input' : 'Start voice input'}
            title={speech.isListening ? 'Stop voice input' : 'Start voice input (hold to toggle debug trace)'}
            className={cn('hit-slop-44 shrink-0 rounded-full', speech.isListening && 'animate-pulse')}
          >
            <Mic className="size-4" />
          </Button>
        )}
        {/* keepsComposerFocus: tapping send used to leave focus on <body> —
            measured on the onboarding composer, identical shape here — which
            is a phone putting the keyboard away between every message. */}
        <Button data-chat-send {...keepsComposerFocus} onClick={() => { sendMessage(); refocusComposer(composerRef.current) }} disabled={!input.trim() || isLoading} size="icon" className="hit-slop-44 shrink-0 rounded-full glow-mint-box">
          <Send className="size-4" />
        </Button>
      </div>
      {speech.permissionError && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{speech.permissionError}</p>
      )}
      {voiceDebugOn && (
        <div className="mt-2 rounded-xl bg-[color:var(--surface-deep)] p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Voice debug trace — hold mic to turn off
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-[10px] text-primary glow-mint"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(voiceDebugLines.join('\n')) } catch { /* clipboard unavailable — lines are still on screen to copy manually */ }
                }}
              >
                Copy
              </button>
              <button type="button" className="text-[10px] text-muted-foreground" onClick={() => setVoiceDebugLines([])}>Clear</button>
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto font-mono text-[10px] leading-[1.4] text-muted-foreground">
            {voiceDebugLines.length === 0
              ? <p className="italic">No events yet — tap the mic and speak.</p>
              : voiceDebugLines.map((l, i) => <p key={i} className="break-all">{l}</p>)}
          </div>
        </div>
      )}
    </div>
    </>
  )
}
