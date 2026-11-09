// ---------------------------------------------------------------------------
// test:setup-card-question — QA round 3 (setup finding 11, 9 Nov 2026): the line above a card says what the card asks.
//
// A number card asks every unanswered number of its group at once (age, height and weight), and the app's own line
// above it read only the first ("How old are you?", or "Next: How old are you?" after a failed connection).
//   1. Several still to give: the line names them all. One left: its own question. Any other card: its own question.
//   2. Every place the app itself puts a card's question on screen goes through cardQuestion.
// Every check runs every time.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

async function main() {
  const slots = await import('../src/lib/onboarding-slots')
  const { cardQuestion, getSlotDef, initialSlotValues } = slots
  const values = { ...initialSlotValues(), fitnessGoal: 'fat_loss', equipment: 'full_gym' } as never

  console.log('\n1. The line names what the card asks')
  const all3 = cardQuestion('age', values, new Set())
  // 9 Nov 2026 (Ashley): the age is asked as a date of birth, with a date picker.
  check('age, height and weight all to give: "What\'s your date of birth, height and weight?"', all3 === "What's your date of birth, height and weight?", all3)
  check('...and the age alone is asked as a date of birth too', getSlotDef('age')!.question === "What's your date of birth?", getSlotDef('age')!.question)
  const two = cardQuestion('heightCm', values, new Set(['age']))
  check('age given: "What\'s your height and weight?"', two === "What's your height and weight?", two)
  const one = cardQuestion('weightKg', values, new Set(['age', 'heightCm']))
  check('only weight left: the slot\'s own question', one === getSlotDef('weightKg')!.question, one)
  const chips = cardQuestion('gender', values, new Set())
  check('a card that is not a number card: its own question', chips === getSlotDef('gender')!.question, chips)

  console.log('\n2. Every place the app asks a card uses it')
  const src = strip(readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
  const uses = (src.match(/cardQuestion\(/g) ?? []).length
  check('the setup screen calls cardQuestion in its four places (the silent turn, the next card, a stepped-in ask, "Next:")', uses >= 5, uses)
  check('...and no card is put on screen with a bare slot question beside it', !/content:\s*(getSlotDef\([^)]*\)!?\.question|nextDef\.question|`\$\{saved\} Next: \$\{def\.question\}`)/.test(src),
    (src.match(/content:\s*[^,\n]*\.question[^,\n]*/g) ?? []).slice(0, 4))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('The line above a card says what the card asks.')
}
main().catch(e => { console.error(e); process.exit(1) })
