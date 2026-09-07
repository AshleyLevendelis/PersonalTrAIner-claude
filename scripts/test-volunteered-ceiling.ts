/**
 * A dumbbell ceiling the user VOLUNTEERED in onboarding — the parser gate.
 *
 * WHY THIS FILE EXISTS. load-ceiling-prompt.ts asks "what are your heaviest
 * dumbbells?" on the Exercise tab at first use, which is Ashley's ruling and
 * stands. What was wrong was asking someone who had already told us: measured
 * twice on 7 Sep 2026, "adjustable dumbbells up to 24kg each" in onboarding,
 * and the very first Exercise tab still opened with the question.
 *
 * The parser that closes that has to be MUCH more careful about false positives
 * than false negatives, and this file is where that asymmetry is written down:
 * a missed capture costs one question the user was going to be asked anyway,
 * while a wrong capture writes a silent ceiling that clamps every prescribed
 * weight for sixteen weeks and stops the app ever asking. So every "should not
 * capture" case below is the important half.
 */
import { parseVolunteeredDumbbellKg } from '../src/lib/onboarding-slots'

let failures = 0
function check(text: string, want: number | null) {
  const got = parseVolunteeredDumbbellKg(text)
  if (got === want) {
    console.log(`  ok: ${JSON.stringify(text)} -> ${got}`)
  } else {
    failures++
    console.error(`  FAIL: ${JSON.stringify(text)} -> ${got}, wanted ${want}`)
  }
}

console.log('[1] Captures a clearly stated per-hand dumbbell ceiling')
check("I've got adjustable dumbbells up to 24kg each, a pull-up bar and some resistance bands", 24)
check('dumbbells up to 24kg, a pull-up bar and bands', 24)
check('my dumbbells go up to 30 kg', 30)
check('24kg dumbbells and a bench', 24)
check('dumbbells, max of 20kg', 20)

console.log('\n[2] A barbell RULED OUT does not block the capture')
// The live regression: the sentence most likely to carry a dumbbell ceiling is
// also the one most likely to name a barbell, because the user is excluding it.
check('adjustable dumbbells up to 24kg each, a pull-up bar and bands. No barbell or bench.', 24)
check('dumbbells up to 22kg, no barbell', 22)
check("dumbbells that go to 18kg, I haven't got a barbell", 18)

console.log('\n[3] Refuses anything it cannot be sure of — the half that matters')
check('just some dumbbells at home', null)
check('I have a barbell and dumbbells up to 24kg', null)   // number could belong to either
check('a barbell, 100kg of plates, and some dumbbells', null)
check('bands and kettlebells only', null)
check('I train at a full gym', null)
check('dumbbells up to 200kg', null)                        // beyond any real pair
check('dumbbells, about 1kg', null)                         // below a working weight
check('I do 24kg kettlebell swings', null)                   // not dumbbells at all

console.log(failures === 0 ? '\nAll volunteered-ceiling checks passed.' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
