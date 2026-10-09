// ---------------------------------------------------------------------------
// "ANYTHING FEELING TIGHT?" — asked before a session, answered in taps.
//
// Gemini's suggestion, 15 Sep 2026, and the only one of its list that was both
// real coaching and already had the machinery: a warm-up in this app is not a
// generic five minutes of cardio, it has a MOBILITY block whose stated job is
// "prepare the specific joints this session is about to load". Tightness is
// the one thing a person knows that the plan cannot: the session knows which
// joints it will load, she knows which ones feel stiff this morning.
//
// TIGHT IS NOT HURT, AND THE DIFFERENCE IS THE WHOLE DESIGN. Ashley ruled on
// pain the same day: ask which kind, then act — a niggle eases the area off,
// something lasting goes on the injuries list, and sharp, one-sided or
// worsening names a professional and changes NOTHING. That ruling is about any
// surface where somebody says something hurts, so this screen must not become
// a second, softer pain path. It adds warm-up movements and does nothing else.
// Saying it actually hurts hands straight over to that triage.
//
// TODAY ONLY, AND IT NEVER TOUCHES THE PLAN. The drills are computed where
// they are rendered, from a list held against today's date. Tomorrow's warm-up
// is untouched because nothing was written to it; clearing the answer removes
// them; and no path here can alter a set, a weight or a session.
// ---------------------------------------------------------------------------

import { drillsPreparing } from './warmup'
import type { WarmupItem } from './warmup'
import { INJURY_OPTIONS } from './picker-options'

/**
 * The eight areas, borrowed WHOLE from the injury picker rather than written
 * again here.
 *
 * Deliberate: these are the eight the plan engine has joint-conflict data for,
 * and the eight the coach's own tools accept. A ninth invented here would be
 * an area a person could name and nothing in the app could act on — and the
 * "it actually hurts" branch below hands its answer to the injury path, which
 * only understands these eight.
 */
export const TIGHT_AREAS = INJURY_OPTIONS.map(o => ({ value: o.value, label: o.label }))

/**
 * Area (what a person says) to joint (what a drill prepares).
 *
 * Two vocabularies exist in the codebase and they do not match: the picker
 * says `lower_back`, `knees`, `shoulders`; the drills say `spine`, `knee`,
 * `shoulder`, `scapula`. This is the one place that knows both, so a rename on
 * either side breaks here loudly instead of silently returning nothing.
 */
export const AREA_JOINTS: Record<string, string[]> = {
  lower_back: ['spine', 'lower_back_axial'],
  hips: ['hip'],
  knees: ['knee'],
  ankles: ['ankle'],
  // A tight shoulder is usually a stiff upper back, so the scapula drills
  // count — which is why this maps to two joints and not one.
  shoulders: ['shoulder', 'scapula'],
  neck: ['neck'],
  elbows: ['elbow'],
  wrists: ['wrist'],
}

/** Every area maps somewhere, or the picker is offering a dead answer. */
export function jointsForAreas(areas: string[]): string[] {
  const out = new Set<string>()
  for (const a of areas) for (const j of AREA_JOINTS[a] ?? []) out.add(j)
  return [...out]
}

/** The label a person saw when they tapped it, for saying it back to them. */
export function areaLabel(area: string): string {
  return TIGHT_AREAS.find(a => a.value === area)?.label ?? area
}

/**
 * How many extra drills a tightness answer may add.
 *
 * THREE, NOT "ONE PER AREA". Somebody who taps five areas on a bad morning
 * does not want eight minutes of mobility before a forty-minute session — the
 * warm-up would eat the session, which is the shape of the time-cap defect the
 * plan engine already guards against. Ranked by how many named areas each
 * drill covers, so the first three are the ones doing the most work.
 */
export const MAX_TIGHTNESS_DRILLS = 3

/** The drills today's warm-up already holds, by block — the names as the plan prints them. */
export interface WarmupToday {
  general?: string[]
  mobility?: string[]
}

export interface TightnessWarmup {
  items: WarmupItem[]
  /**
   * Areas with NO drill in the catalogue at all, or whose only drill an injury
   * vetoed. Nothing the app can do about these today.
   */
  noDrill: string[]
  /**
   * Areas that DO have a drill, which lost the three-slot cut to a
   * higher-covering one.
   *
   * SPLIT FROM noDrill ON THE FIRST MEASUREMENT, and the reason is the point.
   * The first version had one list. Naming five areas produced three drills
   * and told her "I haven't got a warm-up movement for Shoulders yet" — which
   * is false: there are three of them, they just did not fit. An app that says
   * it cannot do something it can is the same defect class as one that says it
   * did something it did not.
   */
  notThisTime: string[]
  /**
   * Areas today's warm-up ALREADY prepares, with the drills that do it — the
   * fourth state (tester's M9, 9 Oct 2026). Named back to her rather than
   * added a second time.
   */
  already: { area: string; drills: string[] }[]
  /** One line for the screen, naming what she said and what it added. */
  note: string | null
}

/** "Hips, Knees and Ankles" — not "Hips and Knees and Ankles". */
function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * How many NEW drills an area gets when today's warm-up already prepares it.
 *
 * ONE — decided as a CSCS coach, 9 Oct 2026. She has told the app something
 * the plan could not know, so the answer is not "nothing"; but a leg day's
 * warm-up that already opens the hips twice does not need three more hip
 * drills (the tester's warm-up went from 6 minutes to 10 on duplicates). One
 * different drill for the area, the next best the catalogue holds, and the
 * ones already there named back to her.
 */
const NEW_DRILLS_FOR_AN_AREA_ALREADY_PREPARED = 1

/**
 * The extra mobility for what she said is tight, plus the honest account of
 * anything it could not help with.
 *
 * `injuries` is the profile's existing list: an injury still vetoes a drill
 * even when tightness asked for it.
 *
 * `today` is the warm-up these are being added to. NEVER THE SAME DRILL TWICE
 * IN ONE WARM-UP (tester's M9): "Hips" on a leg day added World's Greatest
 * Stretch and Bodyweight Squat to Stand, both already in that day's warm-up,
 * because this function picked from the whole catalogue with no knowledge of
 * the day. A drill already there is skipped and the next best for the area is
 * taken instead; what is already there is reported in `already`.
 */
export function tightnessWarmup(areas: string[], injuries: string[] = [], today: WarmupToday = {}): TightnessWarmup {
  const named = areas.filter(a => AREA_JOINTS[a])
  if (named.length === 0) return { items: [], noDrill: [], notThisTime: [], already: [], note: null }

  const inWarmup = new Set([...(today.general ?? []), ...(today.mobility ?? [])].map(n => n.trim().toLowerCase()))
  const isThere = (d: WarmupItem) => inWarmup.has(d.name.trim().toLowerCase())

  // Each area asked on its own, once: every drill it has, and which of those
  // today's warm-up already holds.
  const own = new Map(named.map(a => [a, drillsPreparing(AREA_JOINTS[a], injuries)] as const))
  const there = new Map(named.map(a => [a, (own.get(a) ?? []).filter(isThere).map(d => d.name)] as const))

  // Best-covering first, as before — but a drill already in the warm-up is
  // never a candidate, and an area the warm-up already prepares stops asking
  // once it has its one new drill.
  const items: WarmupItem[] = []
  const given = new Map<string, number>()
  for (const d of drillsPreparing(jointsForAreas(named), injuries)) {
    if (items.length >= MAX_TIGHTNESS_DRILLS) break
    if (isThere(d)) continue
    const serves = named.filter(a => (own.get(a) ?? []).some(o => o.name === d.name))
    const stillWants = serves.some(a =>
      (there.get(a) ?? []).length === 0 || (given.get(a) ?? 0) < NEW_DRILLS_FOR_AN_AREA_ALREADY_PREPARED)
    if (!stillWants) continue
    items.push(d)
    for (const a of serves) given.set(a, (given.get(a) ?? 0) + 1)
  }

  // FOUR STATES PER AREA: it got a drill, the warm-up already has one for it,
  // it has one that did not fit, or the app has nothing for it. Each area is
  // asked on its own so the answer is about that area and not about the set
  // she happened to tap.
  const chosen = new Set(items.map(i => i.name))
  const covered: string[] = []
  const notThisTime: string[] = []
  const noDrill: string[] = []
  const already: { area: string; drills: string[] }[] = []
  for (const a of named) {
    const mine = own.get(a) ?? []
    const has = there.get(a) ?? []
    if (has.length > 0) already.push({ area: a, drills: has })
    if (mine.length === 0) noDrill.push(a)
    else if (mine.some(d => chosen.has(d.name))) covered.push(a)
    else if (has.length === 0) notThisTime.push(a)
  }

  // THE SENTENCE SAYS WHERE THEY ARE LISTED (M9: it said "do these first" and
  // the screen listed them last). Decided as a CSCS coach: raise the pulse
  // first, then mobilise what is tight, then the session's own mobility — a
  // joint moves through more range once it is warm. So they sit straight after
  // the general block, and only lead the warm-up when it has none.
  const where = (today.general ?? []).length > 0 ? 'straight after the general warm-up' : 'first'
  const note = covered.length > 0
    ? `Added for the ${listOf(covered.map(areaLabel)).toLowerCase()} you said felt tight — do ${items.length === 1 ? 'this' : 'these'} ${where}.`
    : null

  return { items, noDrill, notThisTime, already, note }
}

/**
 * What to say when an area has nothing to give.
 *
 * SAYING SO IS THE POINT. "Nothing is offered that is not built" is a standing
 * rule here, and an area that silently produces no drill looks identical on
 * screen to one that worked.
 */
export function uncoveredNote(r: Pick<TightnessWarmup, 'noDrill' | 'notThisTime'> & Partial<Pick<TightnessWarmup, 'already'>>): string | null {
  const parts: string[] = []
  // WHAT IS ALREADY THERE, said first: it is the good news, and without it an
  // answer that added nothing would look exactly like an answer that was lost.
  for (const a of r.already ?? []) {
    parts.push(`Your warm-up already has ${listOf(a.drills)} for your ${areaLabel(a.area).toLowerCase()}.`)
  }
  if (r.notThisTime.length > 0) {
    // TRUE, AND DIFFERENT FROM THE OTHER ONE. She named more than the warm-up
    // has room for; the drills exist and the session still has to fit.
    parts.push(`Your ${listOf(r.notThisTime.map(areaLabel)).toLowerCase()} will have to wait — that would have made the warm-up longer than the session can spare.`)
  }
  if (r.noDrill.length > 0) {
    parts.push(`I haven't got a warm-up movement for your ${listOf(r.noDrill.map(areaLabel)).toLowerCase()} — move it gently on your own first, and tell me if it turns into pain.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}
