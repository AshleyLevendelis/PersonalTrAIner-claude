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
import { parseHeight, parseWeight, parseLiftWeight, measureParserFor, ageOn, birthDateBounds, weightParts, heightParts, weightText, heightText, sayWeight, sayHeight } from '../src/lib/body-units'

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
  // 19 Oct 2026: the lift boxes take pounds too, when the pounds are SAID.
  for (const k of ['knownSquatKg', 'knownBenchKg', 'knownDeadliftKg']) {
    check(`${k} gets the lift parser`, measureParserFor(k) === parseLiftWeight)
  }
}

console.log('\n6. A lift weight: kg, or pounds when they say pounds — never stone, never a guess')
{
  const lb = parseLiftWeight('225 lb')
  check('"225 lb" is stored as 102.1 kg, with what she typed kept for the tick', lb?.value === 102.1 && lb?.from === '225lb', lb)
  check('"225lbs" and "225 pounds" read the same', parseLiftWeight('225lbs')?.value === 102.1 && parseLiftWeight('225 pounds')?.value === 102.1,
    [parseLiftWeight('225lbs'), parseLiftWeight('225 pounds')])
  check('a 4-digit pound figure still parses (it is the bounds that refuse it, not the reader)', parseLiftWeight('1000lb')?.value === 453.6, parseLiftWeight('1000lb'))
  check('a bare number stays kg, with nothing to read back', parseLiftWeight('100')?.value === 100 && parseLiftWeight('100')?.from === undefined, parseLiftWeight('100'))
  check('"100kg" is kg', parseLiftWeight('100kg')?.value === 100, parseLiftWeight('100kg'))
  for (const bad of ['13st', "5'10", 'heavy', '', '100 stone']) {
    check(`"${bad}" is refused, not read as a lift`, parseLiftWeight(bad) === null, parseLiftWeight(bad))
  }
}

console.log('\n7. The setup card\'s date of birth (Ashley, 9 Nov 2026: a date picker for the age)')
{
  check('the day before the birthday: still 33', ageOn('1990-06-15', '2024-06-14') === 33, ageOn('1990-06-15', '2024-06-14'))
  check('on the birthday: 34', ageOn('1990-06-15', '2024-06-15') === 34, ageOn('1990-06-15', '2024-06-15'))
  check('the month after: 34', ageOn('1990-06-15', '2024-07-01') === 34)
  check('born 29 February: not yet a year older on 28 February of a common year', ageOn('2000-02-29', '2025-02-28') === 24, ageOn('2000-02-29', '2025-02-28'))
  check('...and a year older on 1 March', ageOn('2000-02-29', '2025-03-01') === 25, ageOn('2000-02-29', '2025-03-01'))
  check('a date that does not exist is refused, not rolled over', ageOn('2000-02-30', '2025-01-01') === null)
  check('a date of birth after today is refused', ageOn('2030-01-01', '2026-11-09') === null)
  const b = birthDateBounds('2026-11-09', 13, 100)
  check('the latest date the picker allows makes them exactly 13', ageOn(b.max, '2026-11-09') === 13 && ageOn(b.max.replace(/\d{2}$/, d => String(Number(d) + 1).padStart(2, '0')), '2026-11-09') === 12, b)
  const dayBefore = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) - 1)).toISOString().slice(0, 10)
  check('the earliest makes them exactly 100, and the day before it 101 (so no 100-year-old is left out, and no 101)', ageOn(b.min, '2026-11-09') === 100 && ageOn(dayBefore(b.min), '2026-11-09') === 101, { min: b.min, before: dayBefore(b.min) })
}

console.log('\n8. The unit toggles write what the parsers read, and convert both ways')
{
  check('kg box: 82 -> 82 kg', parseWeight(weightText('kg', ['82', '']))?.value === 82)
  check('lb box: 181 -> 82.1 kg', parseWeight(weightText('lb', ['181', '']))?.value === 82.1, weightText('lb', ['181', '']))
  check('stone boxes: 13 and 2 -> 83.5 kg, said "from 13st 2lb"', parseWeight(weightText('st', ['13', '2']))?.value === 83.5 && parseWeight(weightText('st', ['13', '2']))?.from === '13st 2lb', parseWeight(weightText('st', ['13', '2'])))
  check('stone with the pounds left empty -> 13st', parseWeight(weightText('st', ['13', '']))?.value === 82.6, weightText('st', ['13', '']))
  check('feet boxes: 5 and 10 -> 178 cm, said "from 5\'10\""', parseHeight(heightText('ft', ['5', '10']))?.value === 178 && parseHeight(heightText('ft', ['5', '10']))?.from === `5'10"`, parseHeight(heightText('ft', ['5', '10'])))
  check('feet with the inches left empty -> 6\'0', parseHeight(heightText('ft', ['6', '']))?.value === 183, heightText('ft', ['6', '']))
  check('an empty first box is no answer, whatever the unit', weightText('st', ['', '4']) === '' && heightText('ft', ['', '3']) === '')
  check('82 kg shown in lb: 181', weightParts(82, 'lb')[0] === '181', weightParts(82, 'lb'))
  check('82 kg shown in stone: 12 st 13 lb', JSON.stringify(weightParts(82, 'st')) === JSON.stringify(['12', '13']), weightParts(82, 'st'))
  check('a pound total that rounds to 14 carries into the next stone', JSON.stringify(weightParts(13.98 * 14 * 0.45359237, 'st')) === JSON.stringify(['14', '0']), weightParts(13.98 * 14 * 0.45359237, 'st'))
  check('178 cm shown in feet: 5 ft 10', JSON.stringify(heightParts(178, 'ft')) === JSON.stringify(['5', '10']), heightParts(178, 'ft'))
  check('a round trip lands where it started: 178 cm -> 5\'10 -> 178 cm', parseHeight(heightText('ft', heightParts(178, 'ft')))?.value === 178)
  check('the limits are said in the unit picked', sayWeight(25, 'lb') === '55 lb' && sayHeight(250, 'ft') === `8'2"` && sayWeight(350, 'kg') === '350 kg' && sayHeight(100, 'cm') === '100 cm',
    [sayWeight(25, 'lb'), sayHeight(250, 'ft'), sayWeight(350, 'kg'), sayHeight(100, 'cm')])
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll body-unit checks passed.\n')
