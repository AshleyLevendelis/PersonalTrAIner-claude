/**
 * ANOTHER SPORT, SAID IN SETUP, REACHES THE FIRST PLAN (7 Nov 2026).
 *
 * Ashley typed "I train mon, tue, thu, fri mornings and do muay thai tue and
 * thu evenings" in setup. The coach acknowledged the muay thai and nothing
 * kept it: setup had no place for another sport, so the plan was built as if
 * she did none, and Profile said "Other training: None yet". Her ruling the
 * same day, from three options: "Remember it when they say it" (A) — no new
 * setup question; a sport said with its days goes on the plan, the way the
 * kit list works.
 *
 * The plan already knows what to do with one (concurrent-activity.ts, her
 * rulings of 5-6 Sep 2026): lighter sessions on the class days, no prescribed
 * cardio on those nights, and one recovery notch down for a hard or twice-weekly
 * sport. This module only gets the sentence there: which sport, which days,
 * what time of day, read in code, and only when certain.
 *
 * What a sport asks of the body is the coach's estimate when it is said in
 * chat; here it is this table (CSCS delegation, basis in BACKLOG). Only two
 * things in it change a plan today: a striking or grappling sport counts as
 * load from one session a week, and so does an intensity of 0.7 or more
 * (concurrent-activity.ts activityCountsAsLoad). Two or more sessions count
 * whatever the table says.
 */
import type { ConcurrentActivity } from './types'
import { dayRunsIn, type DayRun } from './onboarding-capture'

type Demand = ConcurrentActivity['movement_demands'][number]
interface Sport { name: string; re: RegExp; demands: Demand[]; intensity: number }

/**
 * Named sports only: "class", "club" or "team" says nothing about the body, so
 * a sentence naming only those is left for the coach to ask about.
 */
const SPORTS: readonly Sport[] = [
  { name: 'Muay Thai', re: /\bmuay thai\b|\bthai boxing\b/i, demands: ['striking', 'knee_dominant', 'hip_hinge', 'conditioning'], intensity: 0.8 },
  { name: 'Kickboxing', re: /\bkick ?boxing\b/i, demands: ['striking', 'knee_dominant', 'conditioning'], intensity: 0.8 },
  { name: 'Boxing', re: /(?<!kick ?|thai )\bboxing\b/i, demands: ['striking', 'conditioning'], intensity: 0.8 },
  { name: 'MMA', re: /\bmma\b|\bmixed martial arts\b/i, demands: ['striking', 'grappling', 'conditioning'], intensity: 0.85 },
  { name: 'BJJ', re: /\bbjj\b|\bjiu[- ]?jitsu\b/i, demands: ['grappling', 'horizontal_pull', 'hip_hinge', 'conditioning'], intensity: 0.8 },
  { name: 'Judo', re: /\bjudo\b/i, demands: ['grappling', 'horizontal_pull', 'hip_hinge', 'conditioning'], intensity: 0.8 },
  { name: 'Wrestling', re: /\bwrestling\b/i, demands: ['grappling', 'horizontal_pull', 'hip_hinge', 'conditioning'], intensity: 0.85 },
  { name: 'Karate', re: /\bkarate\b|\btaekwondo\b|\bkung fu\b/i, demands: ['striking', 'knee_dominant', 'conditioning'], intensity: 0.7 },
  { name: 'Football', re: /\bfootball\b|\bsoccer\b|\bfive[- ]a[- ]side\b|\b5[- ]a[- ]side\b/i, demands: ['running', 'knee_dominant', 'conditioning'], intensity: 0.75 },
  { name: 'Rugby', re: /\brugby\b/i, demands: ['running', 'knee_dominant', 'grappling', 'conditioning'], intensity: 0.85 },
  { name: 'Netball', re: /\bnetball\b/i, demands: ['running', 'knee_dominant', 'conditioning'], intensity: 0.7 },
  { name: 'Basketball', re: /\bbasketball\b/i, demands: ['running', 'knee_dominant', 'conditioning'], intensity: 0.75 },
  { name: 'Hockey', re: /\bhockey\b/i, demands: ['running', 'knee_dominant', 'conditioning'], intensity: 0.75 },
  { name: 'Tennis', re: /\btennis\b/i, demands: ['running', 'conditioning'], intensity: 0.6 },
  { name: 'Squash', re: /\bsquash\b|\bpadel\b|\bbadminton\b/i, demands: ['running', 'conditioning'], intensity: 0.7 },
  { name: 'Running', re: /\brunning\b|\bi run\b|\bgo (?:for a )?runs?\b|\bparkrun\b|\bjogging\b/i, demands: ['running', 'knee_dominant', 'conditioning'], intensity: 0.6 },
  { name: 'Cycling', re: /\bcycling\b|\bspin(?: class(?:es)?)?\b|\bi cycle\b|\bbike rides?\b/i, demands: ['knee_dominant', 'conditioning'], intensity: 0.6 },
  { name: 'Swimming', re: /\bswimming\b|\bi swim\b/i, demands: ['horizontal_pull', 'vertical_pull', 'conditioning'], intensity: 0.6 },
  { name: 'Climbing', re: /\bclimbing\b|\bbouldering\b/i, demands: ['vertical_pull', 'horizontal_pull'], intensity: 0.6 },
  { name: 'CrossFit', re: /\bcrossfit\b|\bhyrox\b/i, demands: ['conditioning', 'knee_dominant', 'hip_hinge', 'vertical_push'], intensity: 0.85 },
  { name: 'Rowing', re: /\browing\b/i, demands: ['horizontal_pull', 'hip_hinge', 'conditioning'], intensity: 0.7 },
  { name: 'Dance', re: /\bdanc(?:e|ing)\b/i, demands: ['conditioning'], intensity: 0.5 },
  { name: 'Yoga', re: /\byoga\b/i, demands: [], intensity: 0.3 },
  { name: 'Pilates', re: /\bpilates\b/i, demands: [], intensity: 0.3 },
]

const FULL: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** Not yet, not any more, or not sure: not a standing week. Her 15 Sep "definite" rule, the same way round. */
const HEDGE = /\b(?:used to|stopped|quit|gave up|might|maybe|perhaps|thinking (?:of|about)|want to|wanna|hoping to|going to start|plan(?:ning)? to|would like|trying to get back|if i can|sometimes|occasionally)\b/i
const WHEN: readonly [RegExp, ConcurrentActivity['timeOfDay']][] = [
  [/\bmornings?\b|\bbefore work\b|\bearly\b/i, 'morning'],
  [/\bafternoons?\b|\blunch ?(?:time|times|break)?\b/i, 'afternoon'],
  [/\bevenings?\b|\bnights?\b|\bafter work\b|\btonight\b/i, 'evening'],
]
/** Her own gym training, which a run of days after a sport's name can belong to instead. */
const OWN = /\b(?:lift(?:ing)?|gym|train(?:ing)?|weights|work ?out|sessions?)\b/i
const whenIn = (s: string): ConcurrentActivity['timeOfDay'] | undefined => {
  let best: { at: number; when: ConcurrentActivity['timeOfDay'] } | undefined
  for (const [re, when] of WHEN) {
    const m = re.exec(s)
    if (m && (best === undefined || m.index < best.at)) best = { at: m.index, when }
  }
  return best?.when
}

/**
 * The other sports a typed message states, each with its days and, when said,
 * its time of day. Empty when nothing is certain: a hedge, a sport with no
 * days, or a run of days nothing ties to one sport.
 *
 * A run belongs to a sport when the sport is named in the words just before
 * it ("do muay thai tue and thu") or straight after it ("tue and thu muay
 * thai"), with no other run in between. The time of day is the first one said
 * between that run and the next; a sport named on two runs keeps every day,
 * and its time of day only when both say the same.
 */
export function sportsIn(text: string): ConcurrentActivity[] {
  if (HEDGE.test(text)) return []
  const runs = dayRunsIn(text)
  if (runs.length === 0) return []
  const out: ConcurrentActivity[] = []
  for (const sport of SPORTS) {
    const named = [...text.matchAll(new RegExp(sport.re.source, 'gi'))]
    if (named.length === 0) continue
    const mine: DayRun[] = []
    for (let i = 0; i < runs.length; i++) {
      const before = text.slice(i === 0 ? 0 : runs[i - 1].end, runs[i].start)
      const after = text.slice(runs[i].end, i + 1 < runs.length ? runs[i + 1].start : text.length)
      // The words after the sport's LAST mention, up to this run: another sport
      // or her own training there means the run is not this sport's.
      const lastAt = [...before.matchAll(new RegExp(sport.re.source, 'gi'))].pop()
      const between = lastAt ? before.slice((lastAt.index ?? 0) + lastAt[0].length) : ''
      const leadsIn = !!lastAt && !OWN.test(between) && !SPORTS.some(o => o !== sport && o.re.test(between))
      const follows = new RegExp(`^\\W*(?:(?:mornings?|afternoons?|evenings?|nights?)\\W+)?(?:i (?:do|have|go to)\\W+)?(?:${sport.re.source})`, 'i').test(after)
      if (leadsIn || follows) mine.push(runs[i])
    }
    if (mine.length === 0) continue
    // Named twice ("muay thai tuesday evenings and muay thai saturday
    // mornings"): every day is kept; a time of day only when they all agree.
    const times = mine.map(run => {
      const i = runs.indexOf(run)
      const after = text.slice(run.end, i + 1 < runs.length ? runs[i + 1].start : text.length)
      const sentenceEnd = after.search(/[.!?;]/)
      return whenIn(sentenceEnd >= 0 ? after.slice(0, sentenceEnd) : after)
    })
    const when = times.every(t => t === times[0]) ? times[0] : undefined
    const days = ORDER.filter(d => mine.some(run => run.days.some(x => FULL[x] === d)))
    out.push({
      name: sport.name,
      intensity: sport.intensity,
      days,
      movement_demands: [...sport.demands],
      ...(when ? { timeOfDay: when } : {}),
    })
  }
  return out
}

/** The slot's stored form: the activities as JSON, '' for none. */
export function formatSportsSlot(list: readonly ConcurrentActivity[]): string {
  return list.length === 0 ? '' : JSON.stringify(list)
}

/** The activities a stored slot value holds, or null when it is not one (the slot's validator). */
export function parseSportsSlot(v: unknown): ConcurrentActivity[] | null {
  if (typeof v !== 'string' || v === '') return null
  try {
    const list = JSON.parse(v) as unknown
    if (!Array.isArray(list) || list.length === 0) return null
    const ok = list.every(a => a && typeof a === 'object'
      && typeof (a as ConcurrentActivity).name === 'string' && (a as ConcurrentActivity).name.trim() !== ''
      && Array.isArray((a as ConcurrentActivity).days) && (a as ConcurrentActivity).days.length > 0
      && (a as ConcurrentActivity).days.every(d => ORDER.includes(d))
      && typeof (a as ConcurrentActivity).intensity === 'number'
      && Array.isArray((a as ConcurrentActivity).movement_demands))
    return ok ? list as ConcurrentActivity[] : null
  } catch { return null }
}

/** Said again with different days, a sport is corrected, never doubled (the coach's card does the same). */
export function mergeSports(existing: readonly ConcurrentActivity[], incoming: readonly ConcurrentActivity[]): ConcurrentActivity[] {
  const names = new Set(incoming.map(a => a.name.toLowerCase()))
  return [...existing.filter(a => !names.has(a.name.toLowerCase())), ...incoming]
}
