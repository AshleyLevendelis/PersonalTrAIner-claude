// ---------------------------------------------------------------------------
// THE SHOPPING LIST — design 3a/3b, 27 Sep 2026 (Ashley's brief).
//
// Presentation and interaction only. Every write still goes through the
// grocery store (addItemLocal, editItemLocal, setCheckedLocal, deleteItemLocal,
// clearCheckedLocal, generateGroceryList); how the list is built, merged and
// stored is untouched.
//
// The list is the page: a hero that says how much is left, aisle chips that
// stick under the top bar and follow the aisle you are in, rows that open one
// at a time into a stepper, and an add bar docked on the tab bar. A tick
// leaves its aisle after a beat, with Undo on a toast above the add bar,
// because a mis-tap in a shop is the commonest mistake there is.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ShoppingCart, Loader2, RefreshCw, Plus, Minus, Trash2, Check, ChevronDown, ChevronUp, CheckCircle2,
} from 'lucide-react'
import {
  getAllItems, addItemLocal, editItemLocal, setCheckedLocal, deleteItemLocal, clearCheckedLocal, generateGroceryList,
  DEFAULT_HORIZON_DAYS, type GroceryItemRow, type GroceryCategory,
} from '@/lib/grocery-store'
import {
  MAX_GROCERY_QUANTITY, formatShoppingQuantity, stepperReadout, exactLabel, stepQuantity, purposeLine, mealRefLines,
  coverageSentence, readGroceryBuildMemo, writeGroceryBuildMemo, type GroceryBuildMemo,
} from '@/lib/grocery-display'
import { parseIngredientLine } from '@/lib/portion-scaler'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import type { MacroTargets } from '@/lib/types'
import { getSessionDateContext } from '@/lib/dev-clock'
import type { MealShape } from '@/lib/meal-rotation'

interface GroceryListProps {
  profileId?: string
  mealPools: Partial<Record<MealSlotName, PoolOption[]>>
  /** Soft food likes — must be the SAME value App.tsx passes to assembleDay, or the list is built from days the app never serves. */
  softLikedFoods: string[]
  /** Today's actual picks, swaps included (audit §5.1) — without these the list shops for the meal the user replaced. */
  todaysPicks?: Partial<Record<MealSlotName, PoolOption>>
  /** Swaps made on the strip's upcoming days, by date — the same reason as todaysPicks, one day along. */
  pinsByDate?: Record<string, Partial<Record<MealSlotName, PoolOption>>>
  targets: MacroTargets | null
  /** Same object App gives the meal rotation — see GenerateGroceryListInput. */
  mealShape: MealShape
  /** Bumped externally (e.g. after a chat-added item) to force a reload without remounting. */
  refreshToken?: number
  /**
   * The screen's top bar, drawn by GroceryScreen. It is handed how many items
   * are left and whether the hero has scrolled away, because the compact
   * title ("Grocery · 11 left") only appears once the big one is gone.
   */
  header?: (state: { left: number; compact: boolean }) => ReactNode
}

const CATEGORY_ORDER: GroceryCategory[] = ['produce', 'meat_fish', 'dairy', 'dry_goods', 'frozen', 'other']
const CATEGORY_LABEL: Record<GroceryCategory, string> = {
  produce: 'Produce',
  meat_fish: 'Meat & Fish',
  dairy: 'Dairy',
  dry_goods: 'Dry Goods',
  frozen: 'Frozen',
  other: 'Other',
}
const DAY_PRESETS = [3, 7, 14]
/** How long a ticked row stays in its aisle, struck through, before it leaves. */
const LEAVE_AFTER_MS = 600
/** How long "is in the trolley · Undo" stays up. */
const TOAST_MS = 5000
/** Breathing room between the sticky chips and an aisle a chip has scrolled to. */
const AISLE_GAP_PX = 12

export function GroceryList({ profileId, mealPools, targets, softLikedFoods, todaysPicks, pinsByDate, refreshToken, mealShape, header }: GroceryListProps) {
  const [items, setItems] = useState<GroceryItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [built, setBuilt] = useState<GroceryBuildMemo | null>(() => readGroceryBuildMemo(profileId))
  const [horizonDays, setHorizonDays] = useState(() => readGroceryBuildMemo(profileId)?.days ?? DEFAULT_HORIZON_DAYS)
  const [quickAdd, setQuickAdd] = useState('')
  // ONE ROW OPEN AT A TIME, replacing the old separate edit mode and "from N
  // meals" expander: the open row IS the editor.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [qtyDraft, setQtyDraft] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [allRefs, setAllRefs] = useState(false)
  const [trolleyOpen, setTrolleyOpen] = useState(false)
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ id: string; name: string; key: number } | null>(null)
  const [heroHidden, setHeroHidden] = useState(false)
  const [activeAisle, setActiveAisle] = useState<GroceryCategory | null>(null)
  const [addBarH, setAddBarH] = useState(0)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLElement>(null)
  const chipBarRef = useRef<HTMLDivElement>(null)
  const addBarRef = useRef<HTMLDivElement>(null)
  const headingRefs = useRef<Partial<Record<GroceryCategory, HTMLHeadingElement | null>>>({})
  const leaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A tapped chip holds the highlight until she scrolls by hand: a short last
  // aisle can never reach the top, and the chip she tapped must not go dark.
  const pinnedAisle = useRef<GroceryCategory | null>(null)
  // Where the tapped chip's scroll came to rest. Any scroll away from there —
  // a finger, a wheel, a keyboard, a focus jump — hands the chips back to the
  // list, so a stale highlight can never outlive the tap that set it.
  const pinnedTop = useRef<number | null>(null)
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = async () => {
    if (!profileId) return
    setLoading(true)
    try {
      setItems(await getAllItems(profileId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [profileId, refreshToken])
  useEffect(() => () => {
    leaveTimers.current.forEach(clearTimeout)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (pinTimer.current) clearTimeout(pinTimer.current)
  }, [])

  const datedCoverage = profileId
    ? coverageSentence(items.filter(r => r.source === 'generated').flatMap(r => (r.meal_refs ?? []).map(ref => ref.date).filter((d): d is string => !!d)), getSessionDateContext(profileId).date)
    : null

  const handleGenerate = async () => {
    if (!profileId || !targets) return
    setGenerating(true)
    try {
      // generateGroceryList reads the current merged view then enqueues local
      // writes (it doesn't await the network) — reload picks up the merged
      // pending state immediately, no round-trip wait.
      const input = { profileId, mealPools, targets, softLikedFoods, days: horizonDays, todaysPicks, pinsByDate, mealShape, startDate: getSessionDateContext(profileId).date }
      await generateGroceryList(input)
      const memo = { startDate: input.startDate, days: horizonDays }
      writeGroceryBuildMemo(profileId, memo)
      setBuilt(memo)
      await reload()
    } finally {
      setGenerating(false)
    }
  }

  const handleQuickAdd = () => {
    if (!profileId || !quickAdd.trim()) return
    const parsed = parseIngredientLine(quickAdd.trim())
    const { row } = addItemLocal({ profileId, name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, source: 'manual', currentItems: items })
    setItems(prev => (prev.some(i => i.id === row.id) ? prev.map(i => (i.id === row.id ? row : i)) : [...prev, row]))
    setQuickAdd('')
  }

  const collapse = () => { setExpandedId(null); setNameDraft(null); setQtyDraft(null); setEditError(null); setAllRefs(false) }
  const expand = (id: string) => { collapse(); setExpandedId(id) }

  /**
   * A shopping quantity has to be a positive number.
   *
   * `Number.isFinite` was the only check once, so 0 and -200 both passed: a
   * line reading "-200 g chicken" is not a thing anyone can buy, and 0 is an
   * item on your list you are meant to purchase none of. The ceiling is the
   * same kind of typo guard as the step and cardio ones: a line item is
   * grams, and 100 kg of one ingredient is a slipped decimal point.
   */
  const commitQuantity = (id: string, quantity: number): boolean => {
    const current = items.find(i => i.id === id)
    if (!current) return false
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_GROCERY_QUANTITY) {
      // The typed value stays in the box, which is what says "not that
      // number" without also throwing away the edit.
      setEditError(`Quantity must be between 0 and ${MAX_GROCERY_QUANTITY.toLocaleString()}.`)
      return false
    }
    setEditError(null)
    const row = editItemLocal(current, { quantity })
    setItems(prev => prev.map(i => (i.id === id ? row : i)))
    return true
  }

  const commitName = (id: string) => {
    const current = items.find(i => i.id === id)
    const next = nameDraft?.trim()
    setNameDraft(null)
    if (!current || !next || next === current.display_name) return
    const row = editItemLocal(current, { displayName: next })
    setItems(prev => prev.map(i => (i.id === id ? row : i)))
  }

  const toggleChecked = (item: GroceryItemRow) => {
    const row = setCheckedLocal(item, !item.checked)
    setItems(prev => prev.map(i => (i.id === item.id ? row : i)))
    if (!row.checked) return
    // A TICK STAYS PUT FOR A BEAT, struck through, so the eye sees it land
    // before it leaves the aisle for the trolley.
    if (expandedId === item.id) collapse()
    setLeaving(prev => new Set(prev).add(item.id))
    const prior = leaveTimers.current.get(item.id)
    if (prior) clearTimeout(prior)
    leaveTimers.current.set(item.id, setTimeout(() => {
      leaveTimers.current.delete(item.id)
      setLeaving(prev => { const next = new Set(prev); next.delete(item.id); return next })
    }, LEAVE_AFTER_MS))
    // A NEWER TICK REPLACES THE TOAST, and restarts its clock.
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ id: item.id, name: item.display_name, key: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  const undoTick = () => {
    if (!toast) return
    const current = items.find(i => i.id === toast.id)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(null)
    if (!current || !current.checked) return
    const row = setCheckedLocal(current, false)
    setItems(prev => prev.map(i => (i.id === current.id ? row : i)))
    const timer = leaveTimers.current.get(current.id)
    if (timer) { clearTimeout(timer); leaveTimers.current.delete(current.id) }
    setLeaving(prev => { const next = new Set(prev); next.delete(current.id); return next })
  }

  const remove = (item: GroceryItemRow) => {
    deleteItemLocal(item)
    setItems(prev => prev.filter(i => i.id !== item.id))
    if (expandedId === item.id) collapse()
  }

  const handleClearChecked = () => {
    clearCheckedLocal(items)
    setItems(prev => prev.filter(i => !i.checked))
    setToast(null)
  }

  // CHECKED ITEMS LEAVE THE AISLES — design handoff 2b ›, kept. A list you are
  // shopping from should shorten as you go. They collect in one block at the
  // bottom instead, which is also where you go to undo a mis-tap later.
  const total = items.length
  const inTrolleyCount = items.filter(i => i.checked).length
  const left = total - inTrolleyCount
  const grouped = CATEGORY_ORDER
    .map(cat => ({
      category: cat,
      items: items.filter(i => i.category === cat && (!i.checked || leaving.has(i.id))),
      count: items.filter(i => i.category === cat && !i.checked).length,
    }))
    .filter(g => g.items.length > 0)
  const chipAisles = grouped.filter(g => g.count > 0)
  const trolley = items.filter(i => i.checked && !leaving.has(i.id))
  const chipKey = chipAisles.map(g => g.category).join()

  // THE COMPACT TITLE appears once the hero has scrolled out of view.
  useEffect(() => {
    const hero = heroRef.current, root = scrollerRef.current
    if (!hero || !root || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setHeroHidden(!e.isIntersecting), { root, threshold: 0 })
    io.observe(hero)
    return () => io.disconnect()
  }, [])

  // THE ACTIVE CHIP FOLLOWS THE AISLE AT THE TOP of the scroller: the last
  // heading that has reached the line under the sticky chips. Worked from the
  // same offsets the chip tap scrolls to, so the two always agree.
  useEffect(() => {
    const s = scrollerRef.current
    if (!s) return
    const cats = chipKey ? (chipKey.split(',') as GroceryCategory[]) : []
    let raf = 0
    const update = () => {
      raf = 0
      if (pinnedAisle.current && pinnedTop.current !== null && Math.abs(s.scrollTop - pinnedTop.current) > 2) {
        pinnedAisle.current = null
        pinnedTop.current = null
      }
      if (pinnedAisle.current && cats.includes(pinnedAisle.current)) { setActiveAisle(pinnedAisle.current); return }
      const line = s.scrollTop + (chipBarRef.current?.offsetHeight ?? 0) + AISLE_GAP_PX + 4
      let current: GroceryCategory | null = cats[0] ?? null
      for (const cat of cats) {
        const h = headingRefs.current[cat]
        if (h && h.offsetTop <= line) current = cat
      }
      // AT THE VERY BOTTOM the last aisles are too short to reach the top, so
      // the one lit is the last aisle whose heading is on screen — otherwise
      // the chip would sit on an aisle she has scrolled well past.
      if (s.scrollTop > 0 && s.scrollTop + s.clientHeight >= s.scrollHeight - 2) {
        for (const cat of cats) {
          const h = headingRefs.current[cat]
          if (h && h.offsetTop < s.scrollTop + s.clientHeight) current = cat
        }
      }
      setActiveAisle(current)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    const unpin = () => { pinnedAisle.current = null; pinnedTop.current = null }
    update()
    s.addEventListener('scroll', onScroll, { passive: true })
    s.addEventListener('touchstart', unpin, { passive: true })
    s.addEventListener('wheel', unpin, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      s.removeEventListener('scroll', onScroll)
      s.removeEventListener('touchstart', unpin)
      s.removeEventListener('wheel', unpin)
    }
  }, [chipKey])

  // THE TOAST SITS 12px ABOVE THE ADD BAR, whatever height the bar is.
  useEffect(() => {
    const bar = addBarRef.current
    if (!bar) return
    const measure = () => setAddBarH(bar.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  const jumpTo = (cat: GroceryCategory) => {
    const s = scrollerRef.current, h = headingRefs.current[cat]
    if (!s || !h) return
    pinnedAisle.current = cat
    pinnedTop.current = null
    setActiveAisle(cat)
    s.scrollTo({ top: h.offsetTop - (chipBarRef.current?.offsetHeight ?? 0) - AISLE_GAP_PX, behavior: 'smooth' })
    // A smooth scroll settles well inside a second; wherever it came to rest
    // (a short last aisle stops early) is the position the pin belongs to.
    if (pinTimer.current) clearTimeout(pinTimer.current)
    pinTimer.current = setTimeout(() => { if (pinnedAisle.current === cat) pinnedTop.current = s.scrollTop }, 1000)
  }

  return (
    <>
      {header?.({ left, compact: heroHidden })}

      <div
        ref={scrollerRef}
        data-testid="grocery-scroller"
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <section ref={heroRef} data-testid="grocery-hero" className="flex flex-col gap-3.5 px-[22px] pt-1 pb-[18px]">
          <h1 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-.03em]">Grocery</h1>
          <div className="flex items-center gap-5">
            <TrolleyRing checked={inTrolleyCount} total={total} />
            <div className="flex min-w-0 flex-col">
              <p
                data-testid="grocery-left"
                className="tabular-nums text-[2.875rem] font-bold leading-none tracking-[-.04em] text-num-hero"
                style={{ textShadow: '0 0 26px rgba(var(--glow-rgb),.35)' }}
              >
                {left}
              </p>
              <p className="mt-1.5 text-[0.65625rem] uppercase tracking-[.16em] text-muted-foreground">Items left</p>
              <div className="mt-1 flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="grocery-horizon"
                      aria-label={`Build from the next ${horizonDays} days`}
                      className="hit-slop-44 flex h-[30px] items-center gap-1 rounded-full bg-surface-raised px-2.5 text-xs font-medium"
                    >
                      {horizonDays} days
                      <ChevronDown className="size-[13px]" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {DAY_PRESETS.map(d => (
                      <DropdownMenuItem key={d} data-days={d} onSelect={() => setHorizonDays(d)}>
                        {d} days
                        {d === horizonDays && <Check className="ml-auto size-3.5" aria-hidden />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  data-testid="grocery-rebuild"
                  onClick={handleGenerate}
                  disabled={generating || !targets}
                  className="hit-slop-44 flex items-center gap-1.5 text-xs font-medium text-primary-text disabled:opacity-50"
                >
                  {generating
                    ? <Loader2 className="size-[13px] animate-spin" aria-hidden />
                    : <RefreshCw className="size-[13px]" aria-hidden />}
                  Rebuild
                </button>
              </div>
            </div>
          </div>
        </section>

        {chipAisles.length > 0 && (
          <div
            ref={chipBarRef}
            data-testid="grocery-chips"
            className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-hairline bg-background pt-2 pb-2.5 pl-[22px] pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {chipAisles.map(g => {
              const on = activeAisle === g.category
              return (
                <button
                  key={g.category}
                  type="button"
                  data-testid="grocery-chip"
                  data-aisle={g.category}
                  aria-pressed={on}
                  onClick={() => jumpTo(g.category)}
                  className={`hit-slop-44 flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${
                    on
                      ? 'border-[rgba(var(--glow-rgb),.4)] bg-[rgba(var(--glow-rgb),.14)] font-semibold text-primary-text'
                      : 'border-transparent bg-surface-raised text-text-tertiary'
                  }`}
                >
                  {CATEGORY_LABEL[g.category]}
                  <span className={`tabular-mono ${on ? '' : 'text-muted-foreground'}`}>{g.count}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-col gap-[22px] px-[22px] pt-[18px] pb-7">
          {loading && items.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center" data-testid="grocery-empty">
              <ShoppingCart className="size-7 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Your list is empty.</p>
              <p className="max-w-[26ch] text-xs text-muted-foreground/70">It fills from your meal plan — tap Rebuild above, or add an item by hand.</p>
            </div>
          )}

          {grouped.map(({ category, items: aisleItems, count }) => (
            <section key={category} data-testid="grocery-aisle" data-aisle={category} className="flex flex-col">
              {/* THE AISLE, AND HOW MUCH OF IT IS LEFT. The count is what makes
                  a heading worth its line in a shop: it says whether this is a
                  detour worth making. */}
              <h3
                ref={el => { headingRefs.current[category] = el }}
                data-testid="grocery-aisle-heading"
                className="ds-label flex items-baseline justify-between pb-1"
              >
                <span>{CATEGORY_LABEL[category]}</span>
                <span className="tabular-mono opacity-70">{count}</span>
              </h3>
              {aisleItems.map(item => (
                <GroceryRow
                  key={item.id}
                  item={item}
                  leaving={leaving.has(item.id)}
                  expanded={expandedId === item.id}
                  builtOn={built?.startDate ?? null}
                  nameDraft={expandedId === item.id ? nameDraft : null}
                  qtyDraft={expandedId === item.id ? qtyDraft : null}
                  editError={expandedId === item.id ? editError : null}
                  allRefs={expandedId === item.id && allRefs}
                  onToggleChecked={() => toggleChecked(item)}
                  onExpand={() => expand(item.id)}
                  onCollapse={collapse}
                  onStep={dir => { const next = stepQuantity(item, dir); if (next !== null) commitQuantity(item.id, next) }}
                  onStartQty={() => { setQtyDraft(String(item.quantity)); setEditError(null) }}
                  onQtyDraft={setQtyDraft}
                  onCommitQty={() => { if (qtyDraft !== null && commitQuantity(item.id, Number(qtyDraft))) setQtyDraft(null) }}
                  onCancelQty={() => { setQtyDraft(null); setEditError(null) }}
                  onStartName={() => setNameDraft(item.display_name)}
                  onNameDraft={setNameDraft}
                  onCommitName={() => commitName(item.id)}
                  onCancelName={() => setNameDraft(null)}
                  onShowAllRefs={() => setAllRefs(true)}
                  onRemove={() => remove(item)}
                />
              ))}
            </section>
          ))}

          {trolley.length > 0 && (
            <div data-trolley data-testid="grocery-trolley" className="rounded-[14px] bg-surface-raised px-3.5 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTrolleyOpen(v => !v)}
                  aria-expanded={trolleyOpen}
                  className="min-h-11 min-w-0 flex-1 text-left"
                >
                  <span className="block text-[0.6875rem] text-muted-foreground">In the trolley</span>
                  <span className="block truncate text-[0.84375rem] font-medium" data-testid="grocery-trolley-summary">
                    {trolley.length} item{trolley.length === 1 ? '' : 's'} · {trolley.map(i => i.display_name).join(', ')}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="grocery-clear"
                  onClick={handleClearChecked}
                  aria-label="Clear the trolley — remove ticked items from the list"
                  className="hit-slop-44 shrink-0 px-1 text-[0.6875rem] font-semibold text-primary-text"
                >
                  Clear
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={() => setTrolleyOpen(v => !v)}
                  className="hit-slop-44 flex size-6 shrink-0 items-center justify-center text-muted-foreground"
                >
                  {trolleyOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              </div>
              {trolleyOpen && (
                <ul className="pt-1">
                  {trolley.map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate text-[0.8125rem] line-through opacity-60">{item.display_name}</span>
                      <button
                        type="button"
                        onClick={() => toggleChecked(item)}
                        className="hit-slop-44 shrink-0 text-[0.6875rem] font-semibold text-primary-text"
                        aria-label={`Put ${item.display_name} back on the list`}
                      >
                        Put back
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {items.length > 0 && (
            // WHERE THE LIST CAME FROM, and what it cannot promise. The number
            // of days is the one the list was BUILT with, not the one the pill
            // is set to for the next rebuild.
            <p className="text-[0.6875rem] leading-[1.45] text-muted-foreground" data-testid="grocery-note">
              {/* THE ROWS' OWN DATES FIRST. A day added from the strip makes
                  "your next N days" false, so a list whose rows carry dates
                  names them; the memo is for lists built before they did. */}
              {datedCoverage
                ? `${datedCoverage} `
                : built
                  ? `Built from your next ${built.days} days of meals. `
                  : 'Built from the meals on your Nutrition tab. '}
              Ingredients are filtered, not verified. Check labels if you have an allergy.
            </p>
          )}
        </div>
      </div>

      <div ref={addBarRef} data-testid="grocery-addbar" className="shrink-0 border-t border-hairline bg-surface-deep px-2.5 py-2">
        <div className="flex items-center gap-2.5 rounded-[22px] bg-surface-raised py-0.5 pl-4 pr-1.5 focus-within:ring-1 focus-within:ring-primary/40">
          {/* h-11 is 44px, the comfortable tap minimum. A text field cannot
              carry the invisible hit-slop the buttons use — there is no
              ::after on an <input> — so the only honest fix is real height.
              Ashley's ruling, 9 Sep 2026. */}
          <Input
            value={quickAdd}
            onChange={e => setQuickAdd(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleQuickAdd() }}
            placeholder="Add an item, e.g. 2 eggs"
            aria-label="Add an item to the list"
            className="h-11 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <button
            type="button"
            aria-label="Add item to list"
            data-testid="grocery-add"
            onClick={handleQuickAdd}
            disabled={!quickAdd.trim()}
            className="hit-slop-44 glow-mint-box flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Plus className="size-[18px]" aria-hidden />
          </button>
        </div>
      </div>

      {toast && (
        <div
          key={toast.key}
          role="status"
          data-testid="grocery-toast"
          className="absolute inset-x-3 z-20 flex h-12 items-center gap-2.5 rounded-[14px] bg-secondary pl-3.5 pr-1.5 shadow-[0_10px_30px_rgba(0,0,0,.4)]"
          style={{ bottom: addBarH + 12 }}
        >
          <CheckCircle2 className="size-4 shrink-0 text-primary-text" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{toast.name} is in the trolley</span>
          <button
            type="button"
            data-testid="grocery-undo"
            onClick={undoTick}
            className="hit-slop-44 h-9 shrink-0 px-3 text-[0.8125rem] font-semibold text-primary-text"
          >
            Undo
          </button>
        </div>
      )}
    </>
  )
}

/** Ticked ÷ total, as a ring. The arc and its glow are the theme's own accent. */
function TrolleyRing({ checked, total }: { checked: number; total: number }) {
  // r=42 with an 8px stroke fits the 92px box exactly (42 + 4 = 46).
  const r = 42
  const c = 2 * Math.PI * r
  const frac = total > 0 ? Math.min(1, checked / total) : 0
  return (
    <div className="relative size-[92px] shrink-0" data-testid="grocery-ring">
      <svg
        viewBox="0 0 92 92"
        className="size-full -rotate-90"
        style={{ filter: 'drop-shadow(0 0 8px rgba(var(--glow-rgb),.45))' }}
        aria-hidden
      >
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--hairline)" strokeWidth="8" />
        {frac > 0 && (
          <circle
            data-testid="grocery-ring-arc"
            cx="46" cy="46" r={r} fill="none"
            stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
            className="transition-[stroke-dashoffset] duration-500"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular-mono text-[1.0625rem] font-bold leading-none" data-testid="grocery-ring-count">{checked}/{total}</span>
        <span className="mt-1 text-[0.5625rem] uppercase tracking-[.14em] text-muted-foreground">In trolley</span>
      </div>
    </div>
  )
}

function CheckCircle({ checked, name, onToggle }: { checked: boolean; name: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-testid="grocery-check"
      onClick={e => { e.stopPropagation(); onToggle() }}
      aria-label={checked ? `Put ${name} back on the list` : `Tick off ${name}`}
      aria-pressed={checked}
      className="hit-slop-44 flex size-6 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow]"
      style={checked
        ? { background: 'var(--primary)', border: '1.5px solid var(--primary)', boxShadow: '0 0 12px rgba(var(--glow-rgb),.5)' }
        : { border: '1.5px solid var(--border)' }}
    >
      {checked && <Check className="size-3.5 text-primary-foreground" strokeWidth={3} aria-hidden />}
    </button>
  )
}

function GroceryRow(props: {
  item: GroceryItemRow
  leaving: boolean
  expanded: boolean
  builtOn: string | null
  nameDraft: string | null
  qtyDraft: string | null
  editError: string | null
  allRefs: boolean
  onToggleChecked: () => void
  onExpand: () => void
  onCollapse: () => void
  onStep: (direction: 1 | -1) => void
  onStartQty: () => void
  onQtyDraft: (v: string) => void
  onCommitQty: () => void
  onCancelQty: () => void
  onStartName: () => void
  onNameDraft: (v: string) => void
  onCommitName: () => void
  onCancelName: () => void
  onShowAllRefs: () => void
  onRemove: () => void
}) {
  const { item, leaving, expanded } = props
  const name = item.display_name
  // A ROUGH ESTIMATE SAYS SO, in the place the purpose line would be — the
  // old "unmatched" badge told a shopper nothing about what to do about it.
  const purpose = item.needs_review
    ? <span className="text-[color:var(--role-warn-text)]">Rough estimate · tap to set the amount</span>
    : purposeLine(item.meal_refs)

  if (!expanded) {
    return (
      <div
        data-testid="grocery-row"
        data-item={name}
        data-expanded="false"
        className={`flex min-h-14 items-center gap-3 border-b border-hairline py-2 transition-opacity ${leaving ? 'opacity-[.55]' : ''}`}
      >
        <CheckCircle checked={item.checked} name={name} onToggle={props.onToggleChecked} />
        <button
          type="button"
          onClick={props.onExpand}
          aria-expanded={false}
          disabled={leaving}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[0.9375rem] ${leaving ? 'line-through' : ''}`}>{name}</span>
            {purpose && <span className="block truncate text-[0.6875rem] text-muted-foreground" data-testid="grocery-purpose">{purpose}</span>}
          </span>
          <span className={`shrink-0 tabular-mono text-[0.8125rem] text-text-tertiary ${leaving ? 'line-through' : ''}`} data-testid="grocery-qty">
            {formatShoppingQuantity(item).primary}
          </span>
        </button>
      </div>
    )
  }

  const minus = stepQuantity(item, -1)
  const plus = stepQuantity(item, 1)
  const lines = mealRefLines(item.meal_refs, props.builtOn)
  const shown = props.allRefs ? lines : lines.slice(0, 3)

  return (
    <div
      data-testid="grocery-row"
      data-item={name}
      data-expanded="true"
      className="-mx-3 flex flex-col gap-3 rounded-[14px] bg-surface-raised p-3"
    >
      <div className="flex items-center gap-3">
        <CheckCircle checked={item.checked} name={name} onToggle={props.onToggleChecked} />
        <div className="min-w-0 flex-1">
          {props.nameDraft !== null ? (
            <input
              autoFocus
              value={props.nameDraft}
              aria-label={`Rename ${name}`}
              data-field="grocery-name"
              onChange={e => props.onNameDraft(e.target.value)}
              onBlur={props.onCommitName}
              onKeyDown={e => {
                if (e.key === 'Enter') props.onCommitName()
                if (e.key === 'Escape') props.onCancelName()
              }}
              className="-my-1 h-11 w-full rounded-md bg-background px-2 text-[0.9375rem] outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
            />
          ) : (
            <button
              type="button"
              onClick={props.onStartName}
              aria-label={`Rename ${name}`}
              className="hit-slop-44 block min-h-6 max-w-full truncate text-left text-[0.9375rem]"
            >
              {name}
            </button>
          )}
          {purpose && <span className="block truncate text-[0.6875rem] text-muted-foreground" data-testid="grocery-purpose">{purpose}</span>}
        </div>
        <button
          type="button"
          onClick={props.onCollapse}
          aria-expanded
          aria-label={`Close ${name}`}
          className="hit-slop-44 flex size-8 shrink-0 items-center justify-center text-muted-foreground"
        >
          <ChevronUp className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-3 pl-9">
        <div role="group" aria-label={`Amount of ${name}`} className="flex h-10 items-center rounded-full bg-background" data-testid="grocery-stepper">
          <button
            type="button"
            aria-label={`Less ${name}`}
            data-testid="grocery-minus"
            disabled={minus === null}
            onClick={() => props.onStep(-1)}
            className="hit-slop-44 flex size-10 items-center justify-center rounded-full disabled:opacity-35"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          {props.qtyDraft !== null ? (
            <span className="flex items-center gap-1 px-1">
              <input
                autoFocus
                inputMode="decimal"
                value={props.qtyDraft}
                aria-label={`Exact amount of ${name}, in ${item.unit}`}
                data-field="grocery-qty"
                onChange={e => props.onQtyDraft(e.target.value)}
                onBlur={props.onCommitQty}
                onKeyDown={e => {
                  if (e.key === 'Enter') props.onCommitQty()
                  if (e.key === 'Escape') props.onCancelQty()
                }}
                className={`-my-0.5 h-11 w-16 bg-transparent text-center tabular-mono text-[0.9375rem] font-bold text-num-hero outline-none ${props.editError ? 'rounded-md ring-1 ring-destructive' : ''}`}
              />
              <span className="text-[0.6875rem] text-muted-foreground">{item.unit}</span>
            </span>
          ) : (
            <button
              type="button"
              data-testid="grocery-readout"
              onClick={props.onStartQty}
              aria-label={`${stepperReadout(item)} — type an exact amount of ${name}`}
              className="hit-slop-44 min-w-16 text-center tabular-mono text-[0.9375rem] font-bold text-num-hero"
            >
              {stepperReadout(item)}
            </button>
          )}
          <button
            type="button"
            aria-label={`More ${name}`}
            data-testid="grocery-plus"
            disabled={plus === null}
            onClick={() => props.onStep(1)}
            className="hit-slop-44 flex size-10 items-center justify-center rounded-full disabled:opacity-35"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <span className="tabular-mono text-[0.6875rem] text-muted-foreground" data-testid="grocery-exact">{exactLabel(item)}</span>
      </div>
      {props.editError && (
        <p className="pl-9 text-[0.6875rem] leading-[1.4] text-[color:var(--role-warn-text)]" data-testid="grocery-edit-error">{props.editError}</p>
      )}

      {lines.length > 0 && (
        <ul className="flex flex-col gap-[3px] pl-9 text-[0.71875rem] text-text-tertiary" data-testid="grocery-meals">
          {shown.map((l, i) => <li key={i}>{l}</li>)}
          {lines.length > 3 && !props.allRefs && (
            <li>
              <button type="button" onClick={props.onShowAllRefs} className="hit-slop-44 text-muted-foreground">
                +{lines.length - 3} more
              </button>
            </li>
          )}
        </ul>
      )}

      <div className="flex items-center justify-between pl-9">
        <button
          type="button"
          data-testid="grocery-remove"
          onClick={props.onRemove}
          aria-label={`Remove ${name} from the list`}
          className="hit-slop-44 flex items-center gap-1.5 text-[0.78125rem] font-medium text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Remove
        </button>
        <button
          type="button"
          data-testid="grocery-done"
          onClick={props.onCollapse}
          className="hit-slop-44 h-9 rounded-full bg-primary px-4 text-[0.8125rem] font-semibold text-primary-foreground"
        >
          Done
        </button>
      </div>
    </div>
  )
}
