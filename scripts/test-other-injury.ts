// "Hips & pelvis" and "Other (describe)" on the injuries list (his ruling 15 Nov 2026). One exit: the count of failures.
import { readFileSync } from 'node:fs'
import { otherInjuryOutcome, areaNamedIn, PELVIC_PREGNANCY_LINE } from '../src/lib/other-injury'
import { RED_FLAG_ADVICE } from '../src/lib/edit-reason'
import { INJURY_OPTIONS } from '../src/lib/picker-options'
import { normaliseInjuryCode } from '../src/lib/onboarding-slots'
import { buildCoachInjuriesSummary } from '../src/lib/injuries-context'
import { getFlaggedJoints } from '../src/lib/exercise-plan'

let ran = 0, failed = 0
const ok = (c: boolean, m: string) => { ran++; if (c) console.log(`  ok: ${m}`); else { failed++; console.log(`  FAIL: ${m}`) } }
const label = (code: string) => INJURY_OPTIONS.find(o => o.value === code)?.label ?? code
const opts = (pregnant: boolean) => ({ pregnant, areaLabel: label })

console.log('§1 Hips & pelvis is the hip option, same rules')
ok(INJURY_OPTIONS.find(o => o.value === 'hips')?.label === 'Hips & pelvis', 'the hip chip reads "Hips & pelvis"')
ok(INJURY_OPTIONS.length === 8, 'still eight areas (no new code without rules)')
ok(normaliseInjuryCode('pelvis') === 'hips' && normaliseInjuryCode('Hips') === 'hips', 'a stored "pelvis" or "Hips" is the hip area')
ok(getFlaggedJoints(['hips']).has('hip'), 'the hip area still flags the hip joint')

console.log('§2 Other: sharp names a professional and saves nothing')
const red = otherInjuryOutcome('my big toe', 'red_flag', opts(false))
ok(red.action === 'none' && red.message.startsWith(RED_FLAG_ADVICE), 'sharp: the red-flag advice, nothing saved')
const redKnown = otherInjuryOutcome('my knee', 'red_flag', opts(false))
ok(redKnown.action === 'none', 'sharp in a KNOWN area still ticks nothing')

console.log('§3 Other: a named area is ticked, not saved as words')
const knee = otherInjuryOutcome('right knee after surgery', 'lasting', opts(false))
ok(knee.action === 'tick' && knee.action === 'tick' && (knee as { code: string }).code === 'knees', 'lasting "right knee..." ticks Knees')
const pel = otherInjuryOutcome('pelvic girdle pain', 'lasting', opts(false))
ok(pel.action === 'tick' && (pel as { code: string }).code === 'hips', 'lasting pelvic pain ticks Hips & pelvis')
ok(areaNamedIn('a sore wrist') === 'wrists' && areaNamedIn('my big toe') === null, 'areas found by whole word; a toe is none of them')

const groin = otherInjuryOutcome('groin pain', 'lasting', opts(true))
ok(groin.action === 'save' && groin.message.includes(PELVIC_PREGNANCY_LINE), 'groin is not guessed as an area, but pregnant still gets the midwife line')

console.log('§4 Other: a niggle changes nothing; lasting words are kept')
const nig = otherInjuryOutcome('my big toe', 'niggle', opts(false))
ok(nig.action === 'none' && /Nothing on your plan changes/.test(nig.message), 'niggle: nothing saved, said plainly')
const save = otherInjuryOutcome('  my big toe ', 'lasting', opts(false))
ok(save.action === 'save' && (save as { text: string }).text === 'my big toe', 'lasting unknown: saved trimmed, in his words')
ok(/doesn't change which exercises/.test(save.message), 'and says it changes no exercise')

console.log('§5 Pelvic pain while pregnant names a physio or midwife')
ok(otherInjuryOutcome('pelvis', 'red_flag', opts(true)).message.includes(PELVIC_PREGNANCY_LINE), 'sharp pelvic, pregnant: the midwife line')
ok(otherInjuryOutcome('pelvis', 'lasting', opts(true)).message.includes(PELVIC_PREGNANCY_LINE), 'lasting pelvic, pregnant: the midwife line')
ok(!otherInjuryOutcome('pelvis', 'lasting', opts(false)).message.includes(PELVIC_PREGNANCY_LINE), 'not pregnant: no midwife line')
ok(!otherInjuryOutcome('my toe', 'lasting', opts(true)).message.includes(PELVIC_PREGNANCY_LINE), 'pregnant, not pelvic: no midwife line')

console.log('§6 The coach is told the words (the screen says it will be)')
const sum = buildCoachInjuriesSummary({ injuries: ['knees', 'my big toe'] })
ok(sum.includes('"my big toe"') && /does NOT adjust/.test(sum), 'with an area: the words are in the coach summary')
ok(buildCoachInjuriesSummary({ injuries: ['my big toe'] }).includes('"my big toe"'), 'without an area: the words too')
ok(buildCoachInjuriesSummary({ injuries: [] }) === 'No injuries or sore areas currently on file.', 'nothing on file reads as before')

console.log('§7 Profile draws it')
const src = readFileSync('src/components/ProfileScreen.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
ok(/<OtherInjury\b/.test(src) && /otherInjuryOutcome\(/.test(src), 'Profile renders OtherInjury and asks other-injury.ts')
ok(/isPregnant\(profile\) && injuryCodes\.includes\('hips'\)/.test(src), 'Profile shows the pelvic line when pregnant with hips ticked')

console.log(`${ran} checks ran, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
