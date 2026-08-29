/**
 * Gate: feet and stone reach the app as cm and kg, and a bare number is never
 * guessed at.
 *
 * WHY IT IS A GATE AND NOT A CLICK-THROUGH. `height_cm` and `weight_kg` feed
 * resolveBodyMetrics → computeBMR → computeStaticTDEE (every macro target) and
 * the standards table that sets starting loads. A misread height produces a
 * wrong calorie target and a wrong weight on the bar, silently, for as long as
 * it stands — and unlike a MISSING metric, which the app hedges via
 * load_source 'assumed_body', nothing hedges a wrong one.
 *
 * THE RULE THIS FILE EXISTS TO HOLD: a conversion is only applied when the
 * input says which unit it is. This session began with the app inferring a
 * mapping nobody stated ("100, 150" → squat and bench). Guessing whether a
 * bare 70 means centimetres or inches would be the same offence one field
 * over, so it is asserted as a REFUSAL, not left to judgement.
 */
import { parseHeight, parseWeight, measureParserFor } from '../src/lib/body-units'

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

console.log('\n1. Height, in whatever they typed it in')
{
  // [input, expected cm, expected read-back or null for "already metric"]
  const cases: [string, number, string | null][] = [
    ['178', 178, null],
    ['178cm', 178, null],
    ['178 cm', 178, null],
    ['1.78m', 178, '1.78m'],
    ["5'10", 178, `5'10"`],
    [`5'10"`, 178, `5'10"`],
    ["5' 10", 178, `5'10"`],
    ['5ft10', 178, `5'10"`],
    ['5 ft 10 in', 178, `5'10"`],
    ['5 foot 10', 178, `5'10"`],
    ["6'", 183, `6'`],
    ['6ft', 183, `6'`],
    ['70in', 178, '70"'],
    ['70 inches', 178, '70"'],
  ]
  for (const [raw, cm, from] of cases) {
    const got = parseHeight(raw)
    check(`${JSON.stringify(raw).padEnd(14)} -> ${cm}cm${from ? ` (from ${from})` : ''}`,
      !!got && got.value === cm && (got.from ?? null) === from, got)
  }
}

console.log('\n2. Weight, in whatever they typed it in')
{
  const cases: [string, number, string | null][] = [
    ['87', 87, null],
    ['87kg', 87, null],
    ['87 kg', 87, null],
    ['180lb', 81.6, '180lb'],
    ['180 lbs', 81.6, '180lb'],
    ['180 pounds', 81.6, '180lb'],
    ['13st', 82.6, '13st'],
    ['13 st 2', 83.5, '13st 2lb'],
    ['13 stone 2', 83.5, '13st 2lb'],
    ['13st 2lb', 83.5, '13st 2lb'],
  ]
  for (const [raw, kg, from] of cases) {
    const got = parseWeight(raw)
    check(`${JSON.stringify(raw).padEnd(14)} -> ${kg}kg${from ? ` (from ${from})` : ''}`,
      !!got && got.value === kg && (got.from ?? null) === from, got)
  }
}

console.log('\n3. A bare number is NEVER unit-guessed, and nonsense is refused')
{
  // A bare 70 could be 70cm or 70 inches. The app must ask, not pick. The
  // existing 100-250 bound then fails it the same way a typed 70 always did.
  const h70 = parseHeight('70')
  check('a bare 70 for height is read as 70cm, not silently promoted to inches',
    !!h70 && h70.value === 70 && h70.from === undefined, h70)
  const w13 = parseWeight('13')
  check('a bare 13 for weight is read as 13kg, not silently promoted to stone',
    !!w13 && w13.value === 13 && w13.from === undefined, w13)

  for (const bad of ['', '   ', 'about five ten', 'tall', "5'13\"", '13st 15lb', '5x10', 'abc']) {
    check(`${JSON.stringify(bad).padEnd(16)} is refused rather than guessed`,
      parseHeight(bad) === null || parseWeight(bad) === null, { h: parseHeight(bad), w: parseWeight(bad) })
  }
  // Specifically: an impossible inches/pounds remainder must not be normalised.
  check(`5'13" is refused, not rolled into 6'1"`, parseHeight(`5'13"`) === null, parseHeight(`5'13"`))
  check('13st 15lb is refused, not rolled into 14st 1lb', parseWeight('13st 15lb') === null, parseWeight('13st 15lb'))
}

console.log('\n4. Round-trip: what we store still reads back as what they said')
{
  const h = parseHeight(`5'10"`)!
  const backInches = h.value / 2.54
  check(`5'10" stores 178cm, which is ${backInches.toFixed(1)}in — within half an inch of 70`,
    Math.abs(backInches - 70) < 0.5, backInches)
  const w = parseWeight('13st 2')!
  const backLb = w.value / 0.45359237
  check(`13st 2lb stores ${w.value}kg, which is ${backLb.toFixed(1)}lb — within half a pound of 184`,
    Math.abs(backLb - 184) < 0.5, backLb)
}

console.log('\n5. A parser is only ever paired with the slot it belongs to')
{
  check('heightCm gets the height parser', measureParserFor('heightCm') === parseHeight)
  check('weightKg gets the weight parser', measureParserFor('weightKg') === parseWeight)
  // age must NOT get one: "37" is a count, and 37lb or 5'37 are not ages.
  check('age gets none', measureParserFor('age') === null)
  check('a lift weight gets none — that card is already labelled in kg', measureParserFor('knownSquatKg') === null)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll body-unit checks passed.\n')
