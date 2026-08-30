// ---------------------------------------------------------------------------
// Gate for the onboarding's tappable options — when they appear, what shape
// they take, and the opening two messages above them.
//
// WHY THIS EXISTS. Ashley ran the onboarding and said the options "sometimes
// come up and sometimes they don't". They were doing exactly what they were
// told: present_slot's description called them "a RESCUE… Never call it on the
// first asking", so whether you got help depended on the model deciding you
// were stuck. Unpredictable from the user's side, and unmeasurable from the
// codebase's — nothing asserted anything about it either way.
//
// Two rules now hold, and this file is what keeps them:
//
//   1. Options are offered on EVERY closed-set question, first asking
//      included. A revert to the rescue wording fails §3.
//   2. Their SHAPE is read off the slot's own data: a card when the options
//      carry a description, pills when they do not. Never a hand-list — the
//      description is exactly what a card exists to show, so the data already
//      knows the answer.
//
// The size numbers in §2 are measured, not asserted: at 390px the old
// all-cards rendering ran 213px (goal) to 771px (dietary, on an 844px
// screen). That measurement is what made the case; this file just stops the
// rule drifting back.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ONBOARDING_SLOTS, offeredOptionsFor } from '../src/lib/onboarding-slots'
import { buildOnboardingIntro, ONBOARDING_INTRO_THE_ASK } from '../src/lib/first-run-intro'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const withOptions = ONBOARDING_SLOTS
  .map(s => ({ slot: s, options: offeredOptionsFor(s) ?? [] }))
  .filter(x => x.options.length > 0)

// ---------------------------------------------------------------------------
console.log('\n1. Every question with a list has one to offer')
// ---------------------------------------------------------------------------
{
  check(`there are option questions to check (${withOptions.length})`, withOptions.length >= 15, withOptions.length)
  for (const { slot, options } of withOptions) {
    check(`${slot.key}: every option has a label`, options.every(o => String(o.label ?? '').trim().length > 0))
  }
  // A question with a list has to be tappable — control 'single' or 'multi'
  // is what SlotChipsCard renders on; anything else returns null and the
  // options exist for nobody.
  for (const { slot } of withOptions) {
    check(`${slot.key}: is a control that can render options`,
      slot.control === 'single' || slot.control === 'multi', slot.control)
  }
}

// ---------------------------------------------------------------------------
console.log('\n2. Shape is derived from the options, not hand-listed')
// ---------------------------------------------------------------------------
{
  const card = withOptions.filter(x => x.options.some(o => o.description)).map(x => x.slot.key)
  const pill = withOptions.filter(x => !x.options.some(o => o.description)).map(x => x.slot.key)
  console.log(`    cards: ${card.join(', ')}`)
  console.log(`    pills: ${pill.join(', ')}`)

  check('both shapes are in use', card.length > 0 && pill.length > 0, { card: card.length, pill: pill.length })

  // THE HEIGHT RULE, which is the whole reason for the split. A card is two
  // per row, so 4 options is two rows and anything more is three or more —
  // and it was five and six rows that produced the 771px dietary screen.
  for (const { slot, options } of withOptions) {
    if (!options.some(o => o.description)) continue
    check(`${slot.key}: card question stays at 4 options or fewer (${options.length})`,
      options.length <= 4, options.length)
  }

  // The reverse guard. A long list must not acquire descriptions and quietly
  // become a wall of cards again — that is precisely how this got to 771px.
  const LONG = 6
  for (const { slot, options } of withOptions) {
    if (options.length < LONG) continue
    check(`${slot.key}: ${options.length} options, so it stays pills (no descriptions)`,
      !options.some(o => o.description), options.filter(o => o.description).map(o => o.label))
  }

  // Pills carry no emoji, and the day options are why: all seven were 📅.
  // Asserted on the DATA rather than the markup so a decorative icon added
  // later is caught here rather than on someone's phone.
  const days = withOptions.find(x => x.slot.key === 'trainingDays')
  check('the training-day options are label-only, no icon doing work',
    !!days && new Set(days.options.map(o => o.icon)).size === 1,
    days ? [...new Set(days.options.map(o => o.icon))] : null)
}

// ---------------------------------------------------------------------------
console.log('\n3. Options are offered on the FIRST asking, not as a rescue')
// ---------------------------------------------------------------------------
{
  const fn = readFileSync(join(ROOT, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')

  // The exact wording that produced "sometimes they come up and sometimes
  // they don't". Named so a revert is a failure rather than a regression
  // nobody notices for a month.
  const RESCUE_WORDING = [
    /Never call it on the first asking/i,
    /Do NOT call present_slot on the first asking/i,
    /CHIPS ARE A RESCUE, and there are exactly three times/i,
  ]
  for (const re of RESCUE_WORDING) {
    check(`the rescue-only rule is gone: ${re.source.slice(0, 44)}…`, !re.test(fn))
  }
  check('present_slot is now asked for every closed-set question',
    /Call this EVERY time you ask a question that has a set list/i.test(fn))
  check('...including the first time', /including the first time you ask it/i.test(fn))

  // UNCHANGED ON PURPOSE, and the more important half: options under the
  // wrong question are worse than none, so the slot must match the sentence.
  check('the slot must still match the question just asked',
    /slot_key MUST be the exact question your sentence just asked/i.test(fn))
  check('one set of options per turn still holds', /One present_slot per turn at most/i.test(fn))

  // The client renders on SlotChipsCard, and only single/multi reach it.
  const card = readFileSync(join(ROOT, 'src/components/onboarding/SlotChipsCard.tsx'), 'utf8')
  check('the pill is the chat quick-reply shape', /rounded-full/.test(card) && /text-xs/.test(card))
  check('...and keeps a 44px tap target', /min-h-\[44px\]/.test(card))
  check('the shape switch reads the options, not a list of slot names',
    /options\.some\(o => o\.description\)/.test(card))
  // Comments are STRIPPED before this runs. The rule being asserted is that no
  // slot name appears in the shape LOGIC — naming them in prose as examples of
  // what the rule produces is the opposite of the failure, and the first
  // version of this check fired on exactly that.
  const cardCode = card
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  // THREE SHAPES NOW, not two: rows (the default), the 7-across day strip, and
  // wrapping pills for long label-only sets. `iconsCarryMeaning` is gone
  // because NO icon is rendered by the onboarding chips at all any more —
  // a stronger guarantee than "don't render a repeated one", asserted below.
  const SHAPE_LOGIC = /const (hasDescriptions|isDayStrip|shape)\b[^\n]*/g
  const decisions = cardCode.match(SHAPE_LOGIC) ?? []
  check(`the shape decisions are derived (${decisions.length} of them)`, decisions.length === 3, decisions)
  check('no slot is named in the shape decision',
    !decisions.some(d => ONBOARDING_SLOTS.some(s => d.includes(s.key))), decisions)
  check('all three shapes are reachable', /'rows'/.test(cardCode) && /'strip'/.test(cardCode) && /'pills'/.test(cardCode))
  // gender has two options and no descriptions. A "7 or fewer short labels"
  // strip rule would have put a two-answer question into a seven-across day
  // grid; testing for EXACTLY seven is what keeps it in rows.
  check('the day strip requires exactly seven options, not "seven or fewer"',
    /options\.length === 7/.test(cardCode), decisions)
}

// ---------------------------------------------------------------------------
console.log('\n4. The opening messages')
// ---------------------------------------------------------------------------
{
  const intro = buildOnboardingIntro()
  const words = intro.map(m => m.content.trim().split(/\s+/).length)
  const total = words.reduce((a, b) => a + b, 0)

  // WAS 88 WORDS IN THREE BUBBLES. Ashley read it as too long; the message
  // that went was the capability pitch, because the post-onboarding tour now
  // demonstrates those same four things on the real screens. A budget rather
  // than a frozen string, so the copy can be edited without a gate edit, but
  // cannot creep back to a wall of text.
  check(`the opener is two messages (${intro.length})`, intro.length === 2, intro.length)
  check(`under 60 words before the first question (${total}, was 88)`, total <= 60, { words, total })
  check('nothing is empty', intro.every(m => m.content.trim().length > 0))

  // The name is the last thing said, not the first. Opening with a field is
  // what the whole rewrite was against.
  check('it ends by asking the name', /call you\?$/.test(intro[intro.length - 1].content.trim()),
    intro[intro.length - 1].content)
  check('the promise survived the cut', /Nothing changes without your okay/.test(ONBOARDING_INTRO_THE_ASK))
  check('no quick replies on the opener — a coach waits for a reply',
    intro.every(m => !m.quickReplies))

  // Same honesty rule as first-run-intro's chips: the opener speaks in the
  // app's own voice with no model in the loop, so an overclaim has nothing
  // downstream to catch it.
  // Derived, not listed: the pair this used to name were both wired up in
  // §2.4, which would have left a hardcoded list asserting something the
  // source had stopped saying.
  const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const handlerAt = [...chat.matchAll(/if \(name === "([a-z_]+)"\)/g)]
  const decliningStubs = handlerAt.filter((m, i) => {
    const body = chat.slice(m.index!, handlerAt[i + 1]?.index ?? m.index! + 2000)
    return /coming in an update soon/.test(body)
  }).map(m => m[1])
  check('something still declines, so this check means something', decliningStubs.length > 0, decliningStubs)
  const OVERCLAIM: Array<[RegExp, string]> = [
    [/\bre-?schedul/i, 'propose_schedule_change'],
    [/\bchange your (training )?days?\b/i, 'propose_schedule_change'],
    [/\b(add|drop|cut)\s+(\w+\s+)?(sets?|reps?|volume)\b/i, 'propose_volume_change'],
    [/\b(ban|never give you|blacklist)\b/i, 'ban_exercise'],
  ]
  const text = intro.map(m => m.content).join(' ')
  const overclaims = OVERCLAIM.filter(([re, tool]) => re.test(text) && decliningStubs.includes(tool))
  check('the opener promises nothing that lands on a decliner',
    overclaims.length === 0, overclaims.map(([, tool]) => tool))
}

// ---------------------------------------------------------------------------
console.log('\n5. The injury question is asked while people are still answering')
// ---------------------------------------------------------------------------
{
  // Moved 16th -> 6th on Ashley's ruling. It is the only slot whose absence
  // can HURT someone rather than merely cost accuracy, and at 16th it sat
  // behind the four body-metric questions people most often abandon on.
  const index = (key: string) => ONBOARDING_SLOTS.findIndex(s => s.key === key)
  check(`injuries is in the opening block (position ${index('injuries') + 1} of ${ONBOARDING_SLOTS.length})`,
    index('injuries') <= 6, index('injuries') + 1)
  check('...after equipment, so the question follows what they train with',
    index('equipment') < index('injuries'), { equipment: index('equipment') + 1, injuries: index('injuries') + 1 })
  check('...and BEFORE the barbell numbers — a bad back gets mentioned first',
    index('injuries') < index('knowsWorkingLifts') && index('injuries') < index('knownSquatKg'),
    { injuries: index('injuries') + 1, knowsWorkingLifts: index('knowsWorkingLifts') + 1 })
  check('...and before the body metrics people abandon on',
    index('injuries') < index('age') && index('injuries') < index('weightKg'),
    { injuries: index('injuries') + 1, age: index('age') + 1 })
}

// ---------------------------------------------------------------------------
console.log('\n6. Nothing is asked twice, and nothing decorative costs height')
// ---------------------------------------------------------------------------
{
  // A composer placeholder that repeats the question adds nothing and takes a
  // line — conditioningPreference had "How do you feel about cardio?" under
  // "How do you feel about cardio?".
  for (const s of ONBOARDING_SLOTS) {
    if (!s.inputHint) continue
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z ]/g, '').trim()
    check(`${s.key}: the placeholder is not the question again`,
      norm(s.inputHint) !== norm(s.question), { q: s.question, hint: s.inputHint })
  }

  // A free-text slot with no placeholder is a blank box after a question that
  // has scrolled — dislikedExercises was the one without.
  for (const s of ONBOARDING_SLOTS) {
    if (s.control !== 'text') continue
    check(`${s.key}: free text has a placeholder`, !!s.inputHint?.trim(), s.inputHint)
  }

  // Two questions that read as the same question asked twice. These two sit
  // next to each other, so the follow-up has to announce that it is one.
  const dislikedFoods = ONBOARDING_SLOTS.find(s => s.key === 'dislikedFoods')!
  check('the second food question says it is an addition, not a repeat',
    /\b(else|other|besides|beyond)\b/i.test(dislikedFoods.question), dislikedFoods.question)

  // An icon repeated on every option carries no information. Asserted on the
  // DATA and paired with the render rule below, because either half alone is
  // half a fix.
  const card = readFileSync(join(ROOT, 'src/components/onboarding/SlotChipsCard.tsx'), 'utf8')
  // The rule got STRONGER, so the check did too. It used to be "an icon
  // repeated across every option is not rendered"; the redesign renders no
  // emoji at all, which cannot be got wrong by one question adding a second
  // distinct glyph. The `icon` fields stay in the data (harmless, and other
  // surfaces may want them) — what is asserted is that the chips never read
  // them.
  const rowSrc = readFileSync(join(ROOT, 'src/components/onboarding/OptionRow.tsx'), 'utf8')
  check('the onboarding chips render no emoji at all', !/\bopt\.icon\b/.test(card), card.match(/.*opt\.icon.*/)?.[0])
  check('...and the row component has no icon prop to pass one through',
    !/\bicon\b/.test(rowSrc.replace(/\/\*[\s\S]*?\*\//g, '')), rowSrc.match(/.*\bicon\b.*/)?.[0])

  // THE STRANDED-CARD RULE IS RETIRED, and its retirement is asserted rather
  // than just deleted. It existed because a two-column grid with an odd option
  // count left the last card beside a hole — six of the questions have exactly
  // three options. Rows are full width, so an odd count cannot strand
  // anything, and a leftover `col-span-2` would mean the grid came back.
  check('the two-column grid is gone, so nothing can be stranded',
    !/grid-cols-2/.test(card) && !/col-span-2/.test(card), card.match(/.*col-span-2.*|.*grid-cols-2.*/)?.[0])
  const oddCardQuestions = withOptions
    .filter(x => x.options.some(o => o.description) && x.options.length % 2 === 1)
    .map(x => x.slot.key)
  check(`...and there are still odd-count questions, which now simply stack (${oddCardQuestions.join(', ')})`,
    oddCardQuestions.length > 0, oddCardQuestions)

  // The footer still matches the options above it: a full-width bar under a
  // card that already spans the column, inline under a strip or pills so the
  // lightest question doesn't get the heaviest control hung under it.
  check('the footer button follows the option shape',
    /shape === 'rows'\s*\n?\s*\?\s*'w-full min-h-\[44px\]/.test(card))
  check('...and a multi-select footer reads the picks back in words',
    /\.map\(o => o\.label\)\.join\(' · '\)/.test(card))

  // Units belong on the field, not only in a sentence that has scrolled — and
  // the grouped cards put three fields under one question, so at most one of
  // them could ever have taken its unit from the question above it.
  const numeric = readFileSync(join(ROOT, 'src/components/onboarding/SlotNumericCard.tsx'), 'utf8')
  check('numeric fields carry their unit', /const UNIT: Record<string, string \| undefined>/.test(numeric))
  for (const key of ['heightCm', 'weightKg', 'knownSquatKg']) {
    check(`${key} has a unit`, new RegExp(`${key}: '`).test(numeric))
  }
}

// ---------------------------------------------------------------------------
console.log('\n7. The order lets someone stop early and still get a plan')
// ---------------------------------------------------------------------------
{
  const index = (key: string) => ONBOARDING_SLOTS.findIndex(s => s.key === key)
  const required = ONBOARDING_SLOTS.filter(s => s.required)
  const lastRequired = required[required.length - 1]
  const lastRequiredAt = ONBOARDING_SLOTS.indexOf(lastRequired)

  // The tallest screen in the onboarding used to sit between the user and the
  // final required question, so giving up there meant nineteen answers and no
  // plan. Everything after the last required question is now genuinely
  // optional — abandon any time from there and a full plan still generates.
  check(`the last required question is ${lastRequired.key} at #${lastRequiredAt + 1}`,
    lastRequiredAt < index('dietaryPreferences'),
    { lastRequired: lastRequired.key, at: lastRequiredAt + 1, dietary: index('dietaryPreferences') + 1 })
  check(`...leaving a genuinely optional tail (${ONBOARDING_SLOTS.length - lastRequiredAt - 1} questions)`,
    ONBOARDING_SLOTS.slice(lastRequiredAt + 1).every(s => !s.required),
    ONBOARDING_SLOTS.slice(lastRequiredAt + 1).filter(s => s.required).map(s => s.key))

  // The training half was split down the middle by the body-metric block:
  // training -> body -> training -> food. Style, cardio and recovery are
  // training questions and belong with the rest of them.
  const TRAINING = ['fitnessGoal', 'trainingExperience', 'equipment', 'injuries', 'trainingDays',
    'sessionDuration', 'trainingStyle', 'conditioningPreference', 'recoveryCapacity', 'dislikedExercises']
  const BODY = ['age', 'heightCm', 'weightKg', 'gender']
  const lastTraining = Math.max(...TRAINING.map(index))
  const firstBody = Math.min(...BODY.map(index))
  check('every training question comes before the body-metric block',
    lastTraining < firstBody, { lastTraining: lastTraining + 1, firstBody: firstBody + 1 })
  check('...and the body block is still contiguous',
    Math.max(...BODY.map(index)) - firstBody === BODY.length - 1,
    BODY.map(k => `${k}#${index(k) + 1}`))
}

// ---------------------------------------------------------------------------
console.log('\nEVERY QUESTION WITH A LIST OFFERS IT')
// ---------------------------------------------------------------------------
{
  // ASHLEY HAS RULED ON THIS THREE TIMES, and the history is the point —
  // without it a future session re-litigates settled ground:
  //
  //   1  "Always, pills or cards as fits."   Options had become invisible;
  //                                          the fix was to offer them every
  //                                          time and shrink the ones that
  //                                          were too big.
  //   2  "I dont think every question needs  Four slots were exempted
  //      a quick reply always. Some have     (knowsWorkingLifts, gender,
  //      obvious answers."                   mealsPerDay, includeSnacks).
  //   3  "Actually the quick replies on the  Back to always. The exemption
  //      onboarding are better for all       mechanism was REMOVED rather
  //      questions."                         than left tagging nothing —
  //                                          a flag no slot carries reads as
  //                                          meaningful and does nothing.
  //
  // So the property is simply: if a slot has a list, the user is offered it.
  const withOptions = ONBOARDING_SLOTS.filter(s => offeredOptionsFor(s))
  const suppressed = withOptions.filter(s => (s as Record<string, unknown>).obviousAnswer)
  check(`every slot with a list offers it (${withOptions.length} slots)`,
    suppressed.length === 0, suppressed.map(s => s.key))

  // The mechanism is gone, not merely unused. offeredOptionsFor is the single
  // choke point by design (see its own comment); a second place deciding
  // whether to show options is how the two come to disagree.
  const component = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
  check('the client has no per-slot suppression flag', !/obviousAnswer/.test(component))

  const fn = readFileSync(join(ROOT, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')
  check('the prompt does not exempt any slot from present_slot',
    !/NO CHIPS/.test(fn) && !/obviousAnswer/.test(fn))
  check('...and still says to call it every time, first asking included',
    /present_slot for that same slot, every time, first asking included/.test(fn))

  const slots = readFileSync(join(ROOT, 'src/lib/onboarding-slots.ts'), 'utf8')
  check('the slot catalogue carries no suppression flag', !/obviousAnswer/.test(slots))

  // THE TWO THAT COULD NEVER HAVE BEEN EXEMPTED ANYWAY, kept as the anchor:
  // both are enforced downstream, so a missed tap is a filtering miss or a
  // food the plan will serve them.
  for (const key of ['injuries', 'dietaryPreferences']) {
    check(`${key} offers its options — a missed tap there is a safety miss`,
      !!offeredOptionsFor(ONBOARDING_SLOTS.find(s => s.key === key)!))
  }
}

console.log('\n8. Every question the composer can describe actually has something to say')
{
  // THIRD TIME THE PLACEHOLDER SAID THE WRONG THING. The live report: the
  // coach asked "what are your current working weights for your squat, bench,
  // and deadlift?" and the box read "Which days?".
  //
  // Two independent faults. This is the first: SIX of 27 slots shipped with no
  // inputHint at all — all three lift questions, plus snacks, cuisines and
  // breakfast. Even when the app correctly worked out which slot was on
  // screen, there was nothing to show, so it fell through to the generic text
  // and, for an unmapped question, to a guess.
  const noHint = ONBOARDING_SLOTS.filter(s => !s.inputHint).map(s => s.key)
  check('every slot has an inputHint', noHint.length === 0, noHint)
  check('...and there are slots to check (sanity check on this gate)', ONBOARDING_SLOTS.length > 20, ONBOARDING_SLOTS.length)

  // A hint that restates the whole question is no better than none — it has to
  // read as something to type INTO a box, and it has to fit one.
  const tooLong = ONBOARDING_SLOTS.filter(s => (s.inputHint ?? '').length > 32).map(s => `${s.key}: ${s.inputHint}`)
  check('no hint is longer than the box can show', tooLong.length === 0, tooLong)

  // The second fault: the fallback is a GUESS at what was asked, and it used
  // to override a question the user could read directly above the box.
  const ui = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
  const hintBlock = ui.slice(ui.indexOf('const pendingHint'))
  check('an unmapped question falls back to the neutral hint, never a guess',
    /askedSomethingUnmapped/.test(ui) && /if \(askedSomethingUnmapped\) return 'Say anything…'/.test(ui))
  check('...and the resume banner cannot stand in for the question behind it',
    /m\.content !== RESUME_BANNER/.test(hintBlock))

  // asksSlot is what tells the composer about a question asked WITHOUT a card.
  // It was declared on DraftMessage and read by the hint logic, but dropped by
  // the draft mapper — so it survived exactly until the first reload.
  // COMMENTS STRIPPED. The first version of this check was satisfied by the
  // comment sitting beside the mapper, which mentions asksSlot by name — the
  // fourth time in this repo a check has passed on prose ABOUT the thing it
  // is looking for rather than the thing itself.
  const mapper = ui.slice(ui.indexOf('function toDraftMessages'), ui.indexOf('const COMPLETE_MESSAGE'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  check('asksSlot survives the draft round-trip', /asksSlot/.test(mapper), mapper.slice(0, 200))
}

console.log('\n9. A lift weight is never assigned to a lift the user did not name')
{
  // ROOT INCIDENT. The coach asked for "squat, bench, and deadlift" in one
  // sentence; Ashley typed "100, 150"; the app recorded Squat 100 and Bench
  // 150 — the mapping taken from the order the QUESTION listed them in.
  //
  // Why this is not cosmetic: those three slots set load_source
  // 'known_weight', the most-trusted basis in the app. It outranks the
  // population estimate and skips the "starting light" hedge, so a number on
  // the wrong lift becomes a CONFIDENT wrong weight for a whole block. The
  // never-invent rules already in both prompts govern VALUES; this is the
  // assignment of a value to a field, one level up, and nothing covered it.
  //
  // Ashley's ruling: show all three labelled boxes. That card already
  // existed — NUMERIC_GROUPS has had the lift trio all along — so the fix is
  // to route through it rather than to build it.
  const ui = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
  const fn = readFileSync(join(ROOT, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')

  check('the three lifts are still one grouped card',
    /\['knownSquatKg', 'knownBenchKg', 'knownDeadliftKg'\]/.test(
      readFileSync(join(ROOT, 'src/lib/onboarding-slots.ts'), 'utf8')))

  // The client guard. A prompt is advisory; this writes the load basis, so
  // the refusal lives where the model cannot talk it out of happening.
  check('the client refuses an unnamed multi-lift write', /isUnnamedLiftWrite/.test(ui))
  check('...and knows the words for each lift', /LIFT_SLOT_WORDS/.test(ui))
  check('...and shows the labelled group instead of recording',
    /slotCard: 'knownSquatKg'/.test(ui))
  check('...using what the USER typed, not what the question listed',
    /isUnnamedLiftWrite\(key, userText/.test(ui))

  // The prompt half — the actual cause.
  check('the prompt forbids guessing which lift a bare number is',
    /NEVER GUESS WHICH LIFT A BARE NUMBER BELONGS TO/.test(fn))
  check('...and says a NAMED lift is stated, not inferred',
    /that is stated, not inferred/.test(fn))
  check('...and points at the grouped card by name',
    /present_slot with slot_key "knownSquatKg"/.test(fn))
}

console.log(failures === 0 ? '\nAll onboarding-chip checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
