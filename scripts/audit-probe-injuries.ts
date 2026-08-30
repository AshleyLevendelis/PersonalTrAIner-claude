// Probe: the Profile screen's injury list is free text. What does the plan do with it?
import { getFlaggedJoints } from '../src/lib/exercise-plan'
import { INJURY_OPTIONS } from '../src/lib/onboarding-slots'

console.log('The eight injuries the app knows how to act on:')
console.log('  codes:  ' + INJURY_OPTIONS.map(o => o.value).join(', '))
console.log('  labels: ' + INJURY_OPTIONS.map(o => o.label).join(', '))

const typed = [
  'Lower back',            // <- exactly what the Profile field's own placeholder suggests
  'lower back',
  'knees', 'Knees',
  'shoulder', 'shoulders',
  'rotator cuff', 'hamstring', 'sciatica', 'tennis elbow', 'plantar fasciitis',
  'left knee', 'bad back', 'achilles',
]
console.log('\nWhat happens to each thing a user might type into Profile > Injuries:')
let ignored = 0
for (const t of typed) {
  const joints = [...getFlaggedJoints([t])]
  if (joints.length === 0) ignored++
  console.log(`  "${t}" -> ${joints.length ? `flags joints [${joints.join(', ')}]` : 'IGNORED — no joint flagged, plan is unchanged'}`)
}
console.log(`\n${ignored}/${typed.length} of these are stored, shown back to the user, and change nothing.`)

console.log('\nAnd the canonical codes, for contrast:')
for (const o of INJURY_OPTIONS) {
  console.log(`  "${o.value}" -> [${[...getFlaggedJoints([o.value])].join(', ')}]`)
}
