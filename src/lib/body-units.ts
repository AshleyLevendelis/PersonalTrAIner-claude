/**
 * Feet, stone and pounds, into the cm and kg the app stores.
 *
 * WHY THIS IS ON THE LOAD PATH, not just a form nicety. `height_cm` and
 * `weight_kg` feed resolveBodyMetrics → computeBMR → computeStaticTDEE (every
 * macro target) AND the population standards table that produces starting
 * loads. A wrong height does not produce a wrong label; it produces a wrong
 * calorie target and a wrong weight on the bar, silently, for as long as it
 * stands. `load_source: 'assumed_body'` exists because the app already treats
 * a MISSING body metric as serious enough to hedge every load derived from it
 * — a MISREAD one is worse, because nothing hedges it.
 *
 * THE ONE RULE, and it is the same rule the lift-weight guard next door
 * enforces: A CONVERSION IS ONLY APPLIED WHEN THE INPUT SAYS WHICH UNIT IT
 * IS. A bare `70` for height could be 70cm or 70 inches and there is no way
 * to know; it is rejected rather than guessed into 178. This session began
 * with the app inferring something nobody stated. It must not repeat that one
 * field over.
 */

const CM_PER_INCH = 2.54
const INCHES_PER_FOOT = 12
const KG_PER_LB = 0.45359237
const LB_PER_STONE = 14

export interface ParsedMeasure {
  /** The value in the app's own unit — cm for height, kg for weight. */
  value: number
  /**
   * Set only when the input was in another unit, and worded for a receipt:
   * `from 5'10"`. Absent means the number was already in cm/kg and there is
   * nothing to read back — a receipt that said "(from 178cm)" would be noise.
   */
  from?: string
}

/** Numbers the app rounds to. Height to a whole cm, weight to a tenth of a kg — finer is false precision on a converted figure. */
const roundCm = (n: number) => Math.round(n)
const roundKg = (n: number) => Math.round(n * 10) / 10

/**
 * Height, in whatever they typed it in. Returns null when nothing recognisable
 * is there — null means "ask", never "assume".
 */
export function parseHeight(raw: string): ParsedMeasure | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null

  // 5'10", 5' 10, 5ft10in, 5 foot 10 — feet with optional inches.
  // NO \b AFTER THE UNIT WORD. "5ft10" has no word boundary between `t` and
  // `1` — both are word characters — so `ft\b` refused the single most likely
  // way someone types this. Longest alternatives first, so `feet`/`foot` are
  // never half-eaten by `ft`.
  const ftIn = /^(\d{1,2})\s*(?:'|’|feet|foot|ft)\s*(\d{1,2})?\s*(?:"|”|''|inches|inch|ins|in)?$/.exec(t)
  if (ftIn) {
    const feet = Number(ftIn[1])
    const inches = ftIn[2] === undefined ? 0 : Number(ftIn[2])
    if (inches >= INCHES_PER_FOOT) return null // 5'13" is not a height, it is a typo
    const cm = (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH
    const shown = ftIn[2] === undefined ? `${feet}'` : `${feet}'${inches}"`
    return { value: roundCm(cm), from: shown }
  }

  // 70in, 70 inches
  const inOnly = /^(\d{1,3}(?:\.\d+)?)\s*(?:"|”|in\b|ins\b|inch(?:es)?\b)$/.exec(t)
  if (inOnly) return { value: roundCm(Number(inOnly[1]) * CM_PER_INCH), from: `${inOnly[1]}"` }

  // 1.78m, 1.78 metres
  const metres = /^(\d(?:\.\d+)?)\s*(?:m\b|metres?\b|meters?\b)$/.exec(t)
  if (metres) return { value: roundCm(Number(metres[1]) * 100), from: `${metres[1]}m` }

  // 178, 178cm — already the app's unit, so no read-back.
  const cm = /^(\d{1,3}(?:\.\d+)?)\s*(?:cm\b|centimetres?\b|centimeters?\b)?$/.exec(t)
  if (cm) return { value: roundCm(Number(cm[1])) }

  return null
}

/**
 * Weight, in whatever they typed it in. Same contract: null means ask.
 */
export function parseWeight(raw: string): ParsedMeasure | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null

  // 13st, 13 st 2, 13 stone 2 lb — stones with optional pounds.
  const stone = /^(\d{1,2})\s*(?:st\b|stone[s]?\b)\s*(\d{1,2})?\s*(?:lb[s]?\b|pound[s]?\b)?$/.exec(t)
  if (stone) {
    const st = Number(stone[1])
    const lb = stone[2] === undefined ? 0 : Number(stone[2])
    if (lb >= LB_PER_STONE) return null // 13st 15lb is 14st 1lb, not a value to silently normalise
    const kg = (st * LB_PER_STONE + lb) * KG_PER_LB
    const shown = stone[2] === undefined ? `${st}st` : `${st}st ${lb}lb`
    return { value: roundKg(kg), from: shown }
  }

  // 180lb, 180 pounds
  const pounds = /^(\d{1,3}(?:\.\d+)?)\s*(?:lb[s]?\b|pound[s]?\b)$/.exec(t)
  if (pounds) return { value: roundKg(Number(pounds[1]) * KG_PER_LB), from: `${pounds[1]}lb` }

  // 87, 87kg — already the app's unit.
  const kg = /^(\d{1,3}(?:\.\d+)?)\s*(?:kg\b|kgs\b|kilo[s]?\b|kilogram[s]?\b)?$/.exec(t)
  if (kg) return { value: roundKg(Number(kg[1])) }

  return null
}

/**
 * A working weight on the bar — kg, or pounds when they SAY pounds (19 Oct
 * 2026: the lift boxes took kg only, and a lifter who thinks in pounds had no
 * way to answer). Narrower than parseWeight on purpose: nobody's squat is in
 * stone, so "13st" here is a typo and is refused rather than read as 82.6kg.
 * A bare number stays kg, as it always has, and the box's label says so.
 */
export function parseLiftWeight(raw: string): ParsedMeasure | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null
  const pounds = /^(\d{1,4}(?:\.\d+)?)\s*(?:lb[s]?\b|pound[s]?\b)$/.exec(t)
  if (pounds) return { value: roundKg(Number(pounds[1]) * KG_PER_LB), from: `${pounds[1]}lb` }
  const kg = /^(\d{1,3}(?:\.\d+)?)\s*(?:kg\b|kgs\b|kilo[s]?\b|kilogram[s]?\b)?$/.exec(t)
  if (kg) return { value: roundKg(Number(kg[1])) }
  return null
}

/** Which parser a slot needs, or none. Keyed on the slot itself so a caller cannot pair the wrong one. */
export function measureParserFor(slotKey: string): ((raw: string) => ParsedMeasure | null) | null {
  if (slotKey === 'heightCm') return parseHeight
  if (slotKey === 'weightKg') return parseWeight
  if (slotKey === 'knownSquatKg' || slotKey === 'knownBenchKg' || slotKey === 'knownDeadliftKg') return parseLiftWeight
  return null
}

// ---------------------------------------------------------------------------
// THE SETUP CARD'S OWN CONTROLS (Ashley, 9 Nov 2026): "ask for date of birth for the age, with a date picker. And
// weight an input field with a toggle for different units of measurement, and the same for height." The controls write
// the same text the parsers above already read ("5'10", "13st 2", "180lb", "34"), so what is stored, the receipts and
// the bounds are exactly what typing it gave.
// ---------------------------------------------------------------------------

export type WeightUnit = 'kg' | 'lb' | 'st'
export type HeightUnit = 'cm' | 'ft'

/** Today on this phone's own calendar, YYYY-MM-DD: a date of birth is a local date. */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * THE AGE TO USE TODAY (Ashley, 9 Nov 2026, option 1: keep the birthday so the age goes up on its own): worked out from
 * the date of birth when there is one, else the age as recorded. Every reader of the age gets it through the profile,
 * which is set from this at load, so the calorie maths moves on a birthday without anyone touching it.
 */
export function currentAge(dateOfBirth: string | null | undefined, recordedAge: number | null | undefined, today: string = todayLocal()): number | undefined {
  const fromBirth = dateOfBirth ? ageOn(dateOfBirth, today) : null
  return fromBirth ?? (recordedAge ?? undefined)
}

/** Whole years old on `today` for someone born on `dob` (both YYYY-MM-DD); null when either is not a real date or dob is after today. */
export function ageOn(dob: string, today: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob), t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today)
  if (!d || !t) return null
  const [dy, dm, dd] = [Number(d[1]), Number(d[2]), Number(d[3])]
  const [ty, tm, td] = [Number(t[1]), Number(t[2]), Number(t[3])]
  // A real calendar date: 2000-02-30 is a typo, not 1 March.
  const real = new Date(Date.UTC(dy, dm - 1, dd))
  if (real.getUTCFullYear() !== dy || real.getUTCMonth() !== dm - 1 || real.getUTCDate() !== dd) return null
  if (dob > today) return null
  // Born on 29 February: in a year without one, the birthday is counted from 1 March.
  const hadBirthday = tm > dm || (tm === dm && td >= dd)
  return ty - dy - (hadBirthday ? 0 : 1)
}

/** The picker's earliest and latest dates of birth for an age between `minAge` and `maxAge` on `today` (YYYY-MM-DD). */
export function birthDateBounds(today: string, minAge: number, maxAge: number): { min: string; max: string } {
  const [y, m, d] = today.split('-').map(Number)
  const at = (years: number, plusDay: number) => {
    const dt = new Date(Date.UTC(y - years, m - 1, d + plusDay))
    return dt.toISOString().slice(0, 10)
  }
  // Latest: turned minAge today. Earliest: the day after turning maxAge + 1, so maxAge is still allowed.
  return { max: at(minAge, 0), min: at(maxAge + 1, 1) }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** A weight in kg as the boxes of `unit` show it: kg and lb in one box, stone in two (stone, pounds). */
export function weightParts(kg: number, unit: WeightUnit): [string, string] {
  if (unit === 'kg') return [String(round1(kg)), '']
  const lb = kg / KG_PER_LB
  if (unit === 'lb') return [String(Math.round(lb)), '']
  let st = Math.floor(lb / LB_PER_STONE)
  let rem = Math.round(lb - st * LB_PER_STONE)
  if (rem === LB_PER_STONE) { st += 1; rem = 0 }
  return [String(st), String(rem)]
}

/** A height in cm as the boxes of `unit` show it: cm in one box, feet and inches in two. */
export function heightParts(cm: number, unit: HeightUnit): [string, string] {
  if (unit === 'cm') return [String(Math.round(cm)), '']
  const inches = Math.round(cm / CM_PER_INCH)
  return [String(Math.floor(inches / INCHES_PER_FOOT)), String(inches % INCHES_PER_FOOT)]
}

/** The boxes' answer written the way parseWeight reads it; '' when nothing is in the first box. */
export function weightText(unit: WeightUnit, [a, b]: [string, string]): string {
  const x = a.trim(), y = b.trim()
  if (x === '') return ''
  if (unit === 'kg') return x
  if (unit === 'lb') return `${x}lb`
  return y === '' ? `${x}st` : `${x}st ${y}`
}

/** The boxes' answer written the way parseHeight reads it; '' when nothing is in the first box. */
export function heightText(unit: HeightUnit, [a, b]: [string, string]): string {
  const x = a.trim(), y = b.trim()
  if (x === '') return ''
  if (unit === 'cm') return x
  return `${x}'${y}`
}

/** A weight in kg said in `unit` ("82 kg", "181 lb", "12st 13lb"), for the card's limits. */
export function sayWeight(kg: number, unit: WeightUnit): string {
  const [a, b] = weightParts(kg, unit)
  return unit === 'st' ? `${a}st ${b}lb` : `${a} ${unit}`
}

/** A height in cm said in `unit` ("178 cm", "5'10\""), for the card's limits. */
export function sayHeight(cm: number, unit: HeightUnit): string {
  const [a, b] = heightParts(cm, unit)
  return unit === 'cm' ? `${a} cm` : `${a}'${b}"`
}
