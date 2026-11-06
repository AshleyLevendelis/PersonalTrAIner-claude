/**
 * test:voice-pass — THE COACH DRAFTS, A SHORT EDIT MAKES IT A TEXT (Ashley's
 * ruling 6 Nov 2026, "Second pass + checks"). supabase/functions/chat-gemini/voice-pass.ts
 *
 *   1. The shape: what a text from a coach is, measured on the coach's REAL
 *      replies from the 6 Nov exam run (three paragraphs, a menu of options).
 *   2. The pass: a short right reply costs no call; a long one is edited; a bad
 *      edit is retried once, told why; two bad edits leave the draft.
 *   3. What an edit may never do: lose a marker, add a number or a food, make a
 *      claim the checks refuse.
 *   4. What is never edited: safety wording, the full guide.
 *   5. The coach's server uses it on every non-floor plain reply.
 */
import { readFileSync } from 'node:fs'
import { shapeProblem, voicePass, checkRewrite, voicePrompt, markersOf, mustNotRewrite, EDIT_OVER_CHARS } from '../supabase/functions/chat-gemini/voice-pass'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// THE COACH'S OWN WORDS, 6 Nov 2026 exam run on TEST (coach-exam/transcripts, branch exam-results-nov6).
const MENU = `I hear you, Ashley. When it's been a heavy few weeks, trying to force yourself through a full training block on top of life stress is usually a recipe for burning out completely.

We can adjust things so your plan actually fits where your energy is right now:
1. Pull back the volume for a bit — take a set or two off each exercise so sessions take less out of you while keeping the habit going.
2. Shift to a 3-day schedule — give yourself extra breathing room across the week.
3. Take a full deload week — drop the weight and work right down so your body and mind can actually catch up.

What feels like the right kind of relief for you right now?`
const ESSAY = `Barbell Back Squats come first because they're your primary, heavy compound lift for the session. They demand the most neural drive, stability, and raw energy from your whole body.

Putting them first lets you attack those heavy squats when your central nervous system and core are completely fresh. Romanian Deadlifts still ask a lot of your hamstrings and lower back, but doing them second means you can push your quads hard without fatigue compromising your squat setup.

Does that order make sense, or were you hoping to prioritize hamstring work today?`
const GOOD = "Squats come first because they're the heaviest, most technical lift, so they get your freshest legs.\n[BREAK]\nRDLs after still work your hamstrings hard; they just don't need you as fresh."

async function main() {
  console.log('\n1. The shape of a text from a coach')
  check('the real menu reply is refused as a list of options', shapeProblem(MENU, 'honestly it has been a rough few weeks') === 'a list of options', shapeProblem(MENU, 'x'))
  check('...and as too many lines once it is not a list', shapeProblem(MENU.replace(/^\d\. /gm, ''), 'x') === 'too many lines', shapeProblem(MENU.replace(/^\d\. /gm, ''), 'x'))
  check('the real two-question reply is refused', shapeProblem("Sounds good? Ready to go?", 'x') === 'more than one question')
  check('a bulleted list is refused', shapeProblem('Try this:\n- rice\n- oats', 'x') === 'a bulleted list')
  check('a three-line text with a why passes', shapeProblem(GOOD, 'why squats first') === null, shapeProblem(GOOD, 'why squats first'))
  check('a how-to may be three numbered steps', shapeProblem('Three cues:\n1. Bar over mid-foot.\n2. Brace hard.\n3. Push the floor away.', 'how do I deadlift') === null)
  check('...but not four', shapeProblem('Cues:\n1. a.\n2. b.\n3. c.\n4. d.', 'how do I deadlift') === 'more than three steps')
  check('the several-things shape (one line per thing) passes', shapeProblem('Carbs — yes, add rice at lunch.\nTomorrow — a banana an hour before.\nStretching — skipping it once costs nothing.', 'x') === null)
  check('one line of four sentences is a paragraph', shapeProblem('One. Two. Three. Four.', 'x') === 'a paragraph')

  console.log('\n2. The pass')
  const calls: string[] = []
  const fake = (answers: (string | null | Error)[]) => async (p: string) => { calls.push(p); const a = answers.shift(); if (a instanceof Error) throw a; return a ?? null }
  calls.length = 0
  const short = await voicePass('Nice work, that is a new best.', 'squats done', fake([]))
  check('a short reply of the right shape costs no call and is kept', short.source === 'kept' && short.reply === 'Nice work, that is a new best.' && calls.length === 0, { short, calls: calls.length })
  calls.length = 0
  const edited = await voicePass(ESSAY, 'why are the romanian deadlifts after the squats', fake([GOOD]))
  check('a long draft is edited, and the edit is what she gets', edited.source === 'edited' && edited.reply === GOOD && calls.length === 1, edited)
  check('...the editor was shown her message and the draft', calls[0]?.includes('why are the romanian deadlifts after the squats') && calls[0]?.includes('Barbell Back Squats come first'))
  calls.length = 0
  const retried = await voicePass(ESSAY, 'why squats first', fake(["Squats first: 3 sets heavy, fresh legs.", GOOD]))
  check('an edit with a number not in the draft is retried once, told why', retried.source === 'edited' && retried.reply === GOOD && calls.length === 2 && /Your last version was a number not in the draft \(3\)/.test(calls[1] ?? ''), { retried, second: calls[1]?.slice(0, 200) })
  calls.length = 0
  const twiceBad = await voicePass(MENU, 'rough few weeks', fake(['1. a\n2. b', 'One. Two. Three. Four. Five.']))
  check('two refused edits leave the draft, never nothing', twiceBad.source === 'draft' && twiceBad.reply === MENU && calls.length === 2, { source: twiceBad.source, why: twiceBad.why })
  calls.length = 0
  const thrown = await voicePass(ESSAY, 'why squats first', fake([new Error('network'), new Error('network')]))
  check('an editor that fails leaves the draft', thrown.source === 'draft' && thrown.reply === ESSAY)
  const none = await voicePass(ESSAY, 'why squats first', null)
  check('no editor at all leaves the draft', none.source === 'draft' && none.reply === ESSAY)

  console.log('\n3. What an edit may never do')
  const withMarks = ESSAY + '\n[QUICK_REPLIES: "Makes sense" | "Swap them"]\n[LESSON: compound-first]'
  check('the markers are read in order', JSON.stringify(markersOf(withMarks)) === JSON.stringify(['[QUICK_REPLIES: "Makes sense" | "Swap them"]', '[LESSON: compound-first]']))
  check('an edit that drops a marker is refused', checkRewrite(GOOD, withMarks, 'why').ok === false && (checkRewrite(GOOD, withMarks, 'why') as { why: string }).why === 'changed the app markers')
  check('...one that keeps them exactly passes', checkRewrite(GOOD + '\n[QUICK_REPLIES: "Makes sense" | "Swap them"]\n[LESSON: compound-first]', withMarks, 'why').ok === true)
  check('an edit naming a food the draft did not is refused (allergies are not known here)',
    (checkRewrite('Squats first, then RDLs. Have some almonds after.', ESSAY, 'why') as { why?: string }).why === 'a food not in the draft (almonds)')
  check('...a food the draft named is fine', checkRewrite('Have the banana an hour before, it digests fast.', 'A banana about an hour before is ideal, because it digests quickly and gives you quick fuel for the session ahead.', 'what before the gym').ok === true)
  check('an edit the claim check refuses is refused', (checkRewrite('Done, I moved it to Thursday.', ESSAY, 'why', t => /moved it/.test(t) ? 'moved it' : null) as { why?: string }).why?.startsWith('a claim the checks refuse') === true)
  check('an edit still the wrong shape is refused', (checkRewrite(MENU, MENU, 'rough') as { why?: string }).why === 'a list of options')
  check('the brief carries the rules: few short lines, one option, one question at most, nothing new, markers kept',
    /Two to four short lines/.test(voicePrompt(ESSAY, 'x', null)) && /pick the one that suits them best/.test(voicePrompt(ESSAY, 'x', null))
      && /At most one question/.test(voicePrompt(ESSAY, 'x', null)) && /Add nothing new/.test(voicePrompt(ESSAY, 'x', null)) && /exactly as written/.test(voicePrompt(ESSAY, 'x', null)))

  console.log('\n4. What is never edited')
  calls.length = 0
  const allergy = await voicePass(MENU.replace('heavy few weeks', 'nut allergy'), 'is my lunch safe for my nut allergy', fake([GOOD]))
  check('allergy wording is never edited, and no call is made', allergy.source === 'skipped' && calls.length === 0, allergy)
  check('...nor a doctor or physio hand-off, medication, pain, or eating very little',
    ['see your physio first', 'ask your doctor', 'on beta blockers medication', 'it is a sharp pain', 'I only ate 600 calories a day'].every(t => mustNotRewrite(t, '')))
  check('...while an ordinary reply is not held back', !mustNotRewrite(ESSAY, 'why are rdls after squats'))
  calls.length = 0
  const guide = await voicePass('Full guide:\n1. a.\n2. b.\n3. c.\n4. d.\n5. e.', 'Full form guide', fake([GOOD]))
  check('the full form guide she asked for is never cut down', guide.source === 'skipped' && calls.length === 0, guide)
  check('the edit threshold is a measured figure, not zero (short replies cost nothing)', EDIT_OVER_CHARS >= 150 && EDIT_OVER_CHARS <= 300, EDIT_OVER_CHARS)

  console.log('\n5. The coach\'s server uses it')
  const idx = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
  check('every non-floor plain reply goes through the pass', /if \(plain\.source !== "floor"\) \{\s*const voiced = await voicePass\(\s*plain\.reply,\s*message,/.test(idx))
  check('...with the same claim checks the draft passed', /\(t\) => detectPlanClaim\(t\) \?\? detectTodayClaim\(t, todayFacts\)\?\.sentence \?\? null/.test(idx))
  check('...and what she gets is the pass\'s reply', /finalReply = voiced\.reply;/.test(idx) && /JSON\.stringify\(\{ reply: finalReply \}\)/.test(idx))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`voice pass: ${failures} check(s) failed`); process.exit(1) }
  console.log('voice pass: all checks passed')
}
main()
