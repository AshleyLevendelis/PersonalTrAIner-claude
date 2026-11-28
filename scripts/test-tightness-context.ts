// WHAT FEELS TIGHT TODAY, FOR THE COACH (28 Nov 2026, coach-awareness audit (a) 9). Held by behaviour, from the REAL
// warm-up function the Exercise screen calls: the coach is told the drills the screen added and nothing else, the
// screen's own "couldn't" line, that it is today only, and that tightness is not pain.
import { buildCoachTightness } from '../src/lib/tightness-context'
import { tightnessWarmup, uncoveredNote, areaLabel, TIGHT_AREAS } from '../src/lib/tightness'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

const values = TIGHT_AREAS.map(a => a.value)
check('the picker\'s areas are there to test with', values.length >= 4, values)

console.log('1. Nothing said today, nothing told')
check('no areas: empty', buildCoachTightness([], tightnessWarmup([])) === '')

console.log('2. The drills named are exactly the ones the screen added')
{
  // Find an area that gets a drill, by the property, never a guessed name.
  const withDrill = values.find(v => tightnessWarmup([v]).items.length > 0)
  check('some area gets a drill', !!withDrill)
  const w = tightnessWarmup(withDrill ? [withDrill] : [])
  const t = buildCoachTightness(withDrill ? [withDrill] : [], w)
  check('the area is named in the screen\'s words', !!withDrill && t.includes(`Said feels tight: ${areaLabel(withDrill)}`), t)
  check('every drill the screen added is named', w.items.length > 0 && w.items.every(i => t.includes(i.name)), { t, items: w.items.map(i => i.name) })
  check('it says today only and that nothing else changed', /today only, nothing else in the plan changed/.test(t), t)
  check('it says tightness is not pain and to ask the pain questions', /Tightness is not pain/.test(t) && /pain questions/.test(t), t)

  // A drill already in the day's warm-up is not added again; the coach is told it is already covered, not that it was added.
  // Every drill for the area, gathered until the warm-up would add nothing more.
  const held: string[] = []
  for (let i = 0; i < 20; i++) { const r = tightnessWarmup(withDrill ? [withDrill] : [], [], held); if (r.items.length === 0) break; held.push(...r.items.map(x => x.name)) }
  const already = tightnessWarmup(withDrill ? [withDrill] : [], [], held)
  const at = buildCoachTightness(withDrill ? [withDrill] : [], already)
  check('a drill the warm-up already holds: told as already prepared, not as added', already.items.length === 0 && /Already prepared by today's own warm-up/.test(at) && !/Added to the start/.test(at), { at, already })
}

console.log('3. The screen\'s own "couldn\'t" is passed on, and only then')
{
  const many = tightnessWarmup(values)
  const t = buildCoachTightness(values, many)
  const note = uncoveredNote(many)
  check('naming every area leaves something out (the case that binds)', note != null, many)
  check('the coach gets that exact sentence', note != null && t.includes(note), t)
  check('at most three drills are named as added, as the screen adds', many.items.length <= 3 && (t.match(/Added to the start/g) ?? []).length === 1, many.items.length)
  const one = values.find(v => { const r = tightnessWarmup([v]); return r.items.length > 0 && uncoveredNote(r) == null })
  const clean = buildCoachTightness(one ? [one] : [], tightnessWarmup(one ? [one] : []))
  check('nothing left out: no "could not" line', !!one && !/could not add/.test(clean), clean)
}

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')
