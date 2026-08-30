// Probe: the Profile screen's injury list is free text. What does the plan do with it?
import { getFlaggedJoints } from '../src/lib/exercise-plan'
import { INJURY_OPTIONS } from '../src/lib/onboarding-slots'

console.log('The eight injuries the app knows how to act on:')
console.log('  codes:  ' + INJURY_OPTIONS.map(o => o.value).join(', '))
console.log('  labels: ' + INJURY_OPTIONS.map(o => o.label).join(', '))

// RE-POINTED AT THE CURRENT PRODUCT, 30 Aug 2026.
//
// This used to type fourteen realistic free-text injuries at getFlaggedJoints
// and count how many were silently ignored — twelve of them, which is what
// the audit reported. That measurement is now about a path a user cannot
// reach: the Profile screen's injuries field is a PICKER, so free text does
// not arrive any more. The fix removed the failure mode rather than teaching
// the app to guess at prose, which was deliberate — "sciatica" must not
// quietly become "lower back", because that is a clinical judgement the app
// is in no position to make.
//
// Left as it was, this probe reported a shipped fix as still broken. What it
// measures now is what a user can actually do: pick from the list, have
// stored variants of those codes still resolve, and have anything the app
// cannot map KEPT and shown rather than dropped.
import { normaliseInjuryCode, partitionInjuries } from '../src/lib/onboarding-slots'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

console.log('\n=== What the picker offers, every option reaches the plan ===')
for (const o of INJURY_OPTIONS) {
  const joints = [...getFlaggedJoints([o.value])]
  check(`"${o.label}" flags ${joints.join(', ') || 'NOTHING'}`, joints.length > 0)
}

console.log('\n=== Stored variants still resolve, without guessing ===')
const variants: [string, string | null][] = [
  ['Knees', 'knees'], ['KNEES', 'knees'], ['lower back', 'lower_back'],
  ['lower-back', 'lower_back'], ['shoulder', 'shoulders'], ['  hips  ', 'hips'],
  // Clinical prose is NOT guessed at, on purpose.
  ['sciatica', null], ['tennis elbow', null], ['rotator cuff', null],
]
for (const [input, expected] of variants) {
  const got = normaliseInjuryCode(input)
  check(`"${input}" -> ${expected ?? 'kept as written, not guessed'}`, got === expected, got)
}

console.log('\n=== Nothing the user typed is silently dropped ===')
{
  const { codes, unrecognised } = partitionInjuries(['Knees', 'sciatica', 'lower back'])
  check('recognised entries become codes', codes.includes('knees') && codes.includes('lower_back'), codes)
  check('unrecognised entries are KEPT, so the coach can still see them',
    unrecognised.includes('sciatica'), unrecognised)
  check('...and nothing appears in both lists',
    !codes.some(c => unrecognised.includes(c)), { codes, unrecognised })
}

console.log('\n=== And the canonical codes, for the record ===')
for (const o of INJURY_OPTIONS)
 {
  console.log(`  "${o.value}" -> [${[...getFlaggedJoints([o.value])].join(', ')}]`)
}

if (failures) { console.error(`\n${failures} check(s) failed — each failure is a finding.`); process.exit(1) }
console.log('\nEverything the picker can produce reaches the plan.')
