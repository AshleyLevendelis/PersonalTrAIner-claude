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

/** Which parser a slot needs, or none. Keyed on the slot itself so a caller cannot pair the wrong one. */
export function measureParserFor(slotKey: string): ((raw: string) => ParsedMeasure | null) | null {
  if (slotKey === 'heightCm') return parseHeight
  if (slotKey === 'weightKg') return parseWeight
  return null
}
