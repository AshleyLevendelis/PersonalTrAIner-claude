// ---------------------------------------------------------------------------
// HIS LIVE TEST, 14 NOV 2026 (evening). Eight things he found; each is held here by the function that now decides it,
// and the screen half by verify:live-test-nov14.
//   1. the sex question says "male or female", and a rephrased "calibrate your calorie targets" still brings buttons;
//   2. pregnant (tapped or said) answers it: Female, never asked;
//   3. a day before the plan began is not a session (set up on a Saturday, Mon/Wed/Fri of that week were drawn);
//   4. a session can be moved EARLIER to a free day still ahead, and a day it cannot use is never called "busy" falsely;
//   5. the coach's one-line change row gives the new half a real width;
//   6. a day on the shopping list whose meals changed since (a dinner marked as eating out) is out of date, not "on";
//   8. (his exam run of 14 Nov) a race named with no date is asked about, never carded; the coach never says "100% safe";
//   7. a how-to or video request naming an exercise gets the APP's video link; a bare address the coach typed opens.
// One exit, at the bottom.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { getSlotDef, saysPregnant, pregnancyAnswered } from '../src/lib/onboarding-slots'
import { questionAsksSlot, questionPartOf } from '../src/lib/onboarding-chip-match'
import { weekDayRow } from '../src/lib/exercise-week'
import { resolveMoveTarget } from '../src/lib/session-move'
import { dayListState, type GroceryItemRow } from '../src/lib/grocery-store'
import { formVideoFor, exerciseNamedIn, linkifyBareUrls, asksHowOrVideo, sessionVideosFor } from '../src/lib/exercise-video'
import { plainTyped } from '../src/lib/typed-text'
import { detectFoodExclusions } from '../src/lib/food-exclusions'
import { raceDateMissing, RACE_DATE_QUESTION } from '../src/lib/running'
import type { WorkoutDay } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

async function main() {
  console.log('\n1. The sex question')
  {
    const q = getSlotDef('gender')?.question ?? ''
    check('its own words say "male or female"', /male or female/i.test(q), q)
    check('...and never "calibrate" or "baseline"', !/calibrat|baseline/i.test(q), q)
    const asked = 'Steak and sushi excluded — noted! Which option should I use to calibrate your baseline calorie and nutrition targets?'
    check('his screen\'s rephrasing is read as the sex question, so its Male / Female card shows', questionAsksSlot('gender', questionPartOf(asked)))
    check('...and the cooking-time question is not', !questionAsksSlot('gender', 'How much time do you want to spend cooking?'))
    const ob = fs.readFileSync('supabase/functions/onboarding-chat/index.ts', 'utf8')
    check('the setup coach is told to say "male or female" and not to ask after a pregnancy', /THE gender SLOT IS ASKED IN PLAIN WORDS[^\n]*male or female[^\n]*pregnant[^\n]*never ask it/.test(ob))
  }

  console.log('\n2. Pregnant answers it')
  {
    for (const t of ["I'm pregnant", 'I am 12 weeks pregnant', "currently pregnant, is that ok?"]) check(`"${t}" says she is pregnant`, saysPregnant(t))
    for (const t of ["I'm not pregnant", 'is it safe to train when pregnant?', 'my wife is pregnant']) check(`"${t}" does not`, !saysPregnant(t))
    check('the Pregnant tap on the injuries card counts', pregnancyAnswered({ injuries: ['knees', 'pregnancy'] }) && !pregnancyAnswered({ injuries: ['knees'] }))
    const onb = strip(fs.readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
    const fill = onb.slice(onb.indexOf('function fillSexFromPregnancy'), onb.indexOf('function fillSexFromPregnancy') + 500)
    check('setup records Female from either, and leaves an answer already given alone',
      /if \(ws\.values\.gender != null\) return/.test(fill) && /pregnancyAnswered\(ws\.values\)/.test(fill) && /saysPregnant\(userText\)/.test(fill) && /gender: 'female'/.test(fill))
    check('...after every recorded answer and every message she sends',
      /fillSexFromPregnancy\(ws\)\s*return true/.test(onb) && /fillSexFromPregnancy\(ws, userText\)/.test(onb))
  }

  console.log('\n3. A day before the plan began')
  {
    const session = { day: 'Monday', focus: 'Full Body Power', exercises: [{ name: 'Deadlifts', sets: 3, reps: '5', rest: '120s' }] } as unknown as WorkoutDay
    const day = (state: string) => ({ date: '2026-11-09', dayName: 'Monday', state, session, workingLogs: [] } as never)
    const before = weekDayRow(day('before_plan'), () => null)
    check('is drawn as "before your plan began", never a session', before.kind === 'rest' && (before as { beforePlan?: boolean }).beforePlan === true, before)
    check('...while a due day with the same session is still a session (the fixture binds)', weekDayRow(day('due'), () => null).kind === 'session')
    const hook = strip(fs.readFileSync('src/hooks/useTrainingWeek.ts', 'utf8'))
    check('the training week hands no screen a session for it', /session: state === 'before_plan' \? undefined : resolved\.day/.test(hook))
    const view = strip(fs.readFileSync('src/components/exercise/ExerciseWeekView.tsx', 'utf8'))
    check('...and the week view says so', /row\.beforePlan \? 'Before your plan began' : 'Rest day'/.test(view))
  }

  console.log('\n4. Moving a session earlier')
  {
    // His week: set up Sat 14 Nov, week 1 runs Sat 14 - Fri 20, sessions Mon 16, Wed 18, Fri 20.
    const s = (day: string) => ({ day, focus: 'Full Body Power', exercises: [{ name: 'Deadlifts', sets: 3, reps: '5', rest: '120s' }] }) as unknown as WorkoutDay
    const rest = (day: string) => ({ day, focus: 'Rest', exercises: [] }) as unknown as WorkoutDay
    const plan = [s('Monday'), rest('Tuesday'), s('Wednesday'), rest('Thursday'), s('Friday'), rest('Saturday'), rest('Sunday')]
    const weekOf = (d: string) => (d >= '2026-11-14' && d <= '2026-11-20' ? 1 : d < '2026-11-14' ? 0 : 2)
    const base = { fromDate: '2026-11-16', todayDate: '2026-11-14', plan, weekOf, existing: [] }
    const sun = resolveMoveTarget({ ...base, requestedDate: '2026-11-15' })
    check('Monday\'s session to tomorrow (Sunday): yes, Sunday, as asked', sun.ok && sun.date === '2026-11-15' && sun.asWanted, sun)
    const fri13 = resolveMoveTarget({ ...base, requestedDate: '2026-11-13' })
    check('to a day that has gone: the next free day, and the reason is "gone", never "busy"', fri13.ok && !fri13.asWanted && (fri13 as { requestedWhyNot?: string }).requestedWhyNot === 'gone', fri13)
    const wed = resolveMoveTarget({ ...base, requestedDate: '2026-11-18' })
    check('to a day that has a session: the reason is "busy"', wed.ok && !wed.asWanted && (wed as { requestedWhyNot?: string }).requestedWhyNot === 'busy', wed)
    const later = resolveMoveTarget({ ...base, requestedDate: '2026-11-17' })
    check('a later free day still works as before', later.ok && later.date === '2026-11-17' && later.asWanted, later)
    const chat = strip(fs.readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
    check('the card says "has already gone" or "a different training week" when that is the reason',
      /requestedWhyNot === 'gone' \? `\$\{target\.requestedDayName\} has already gone`/.test(chat) && /requestedWhyNot === 'other_week'/.test(chat))
  }

  console.log('\n5. The change row on a coach offer')
  {
    const card = strip(fs.readFileSync('src/components/chat/ProposalCard.tsx', 'utf8'))
    const to = card.match(/<span data-offer-to className="([^"]+)"/)?.[1] ?? ''
    check('the new half has a real width to wrap at (a basis, never flex-1)', /flex-\[1_1_\d+rem\]/.test(to) && !/\bflex-1\b/.test(to), to)
  }

  console.log('\n6. A shopping-list day whose meals changed')
  {
    const row = (slot: string, mealName: string): GroceryItemRow => ({ id: `${slot}-${mealName}`, profile_id: 'p', name: 'x', source: 'generated', checked: false, meal_refs: [{ day: 0, slot, mealName, date: '2026-11-15' }] } as unknown as GroceryItemRow)
    const items = [row('breakfast', 'Soy milk protein oats'), row('dinner', "Hunter's chicken with potato wedges")]
    const served = { breakfast: 'Soy milk protein oats', dinner: 'Dinner out (Sunday)' }
    check('dinner marked as eating out: the day is out of date', dayListState(items, '2026-11-15', served, '2026-11-14') === 'stale')
    check('...the same day as built: on the list', dayListState(items, '2026-11-15', { ...served, dinner: "Hunter's chicken with potato wedges" }, '2026-11-14') === 'on')
    check('...a day never shopped for: off it', dayListState(items, '2026-11-16', served, '2026-11-14') === 'off')
    // Two days on the list: the dinner served on Sunday now is MONDAY's built dish, which must not count for Sunday.
    const twoDays = [...items, { ...row('dinner', 'Pasta bake'), meal_refs: [{ day: 1, slot: 'dinner', mealName: 'Pasta bake', date: '2026-11-16' }] } as GroceryItemRow]
    check('...a dish built for another day is not this day\'s', dayListState(twoDays, '2026-11-15', { ...served, dinner: 'Pasta bake' }, '2026-11-14') === 'stale')
    check('...a meal the list never covered is not evidence', dayListState([row('breakfast', 'Soy milk protein oats')], '2026-11-15', served, '2026-11-14') === 'on')
    const plan = strip(fs.readFileSync('src/components/MealPlan.tsx', 'utf8'))
    check('Nutrition says the day changed and offers "Update list"', /changed since your shopping list was made/.test(plan) && /data-testid="meal-day-grocery-refresh"/.test(plan))
  }

  console.log('\n7. Videos')
  {
    const first = formVideoFor('how do I do box jumps?', '1. Stand facing the box...')
    check('"how do I do box jumps?" gets a video, for Box Jumps', first?.exercise === 'Box Jumps', first)
    check('...its link is the app\'s: https, YouTube search, the exercise name', first?.url === 'https://www.youtube.com/results?search_query=Box%20Jumps%20exercise%20form%20tutorial', first?.url)
    const then = formVideoFor('show me a video', 'Here you go', 'how do I do box jumps?')
    check('"show me a video" after it: named from what he said before', then?.exercise === 'Box Jumps', then)
    check('"how do I do a barbell back squat" and "lunges" find the catalogue\'s own lift', !!exerciseNamedIn('how do I do a barbell back squat') && /lunge/i.test(exerciseNamedIn('show me lunges') ?? ''))
    for (const t of ['how do I brace my core', 'what should I eat for dinner', 'how do I stay motivated']) check(`"${t}": no video button`, formVideoFor(t, 'Some advice.') === null)
    check('"show me a video" with a reply holding only a web address: named from before, never from the address', formVideoFor('show me a video', 'Here is a great tutorial: www.youtube.com/watch?v=abc123', 'how do I do box jumps?')?.exercise === 'Box Jumps')
    // Each guard on a case where it alone decides (measured: a word search finds "Rear Delt Flyes" in "pressing on").
    // Re-anchored 16 Nov 2026 (a hit must now contain each word as a word of its own, so "pressing on" names nothing at
    // all): a reply that names a lift loosely, which a word search does find.
    const prose = "Great squat work, you're doing well"
    check('...the coach\'s prose is not searched word by word: a reply of encouragement names nothing', exerciseNamedIn(prose) !== null && exerciseNamedIn(prose, { wholeNameOnly: true }) === null
      && formVideoFor('show me a video', prose, 'how do I do box jumps?')?.exercise === 'Box Jumps')
    check('...and a web address is not words ("com" is not a Compound Chest Press)', exerciseNamedIn('see www.example.com') === null)
    check('a plain question is not a how-to', !asksHowOrVideo('did I train well this week?'))
    check('naming an exercise without asking how or for a video gets no button', formVideoFor('I did deadlifts today and felt strong', 'Nice work.') === null)
    // A GREETING IS NOT AN EXERCISE (his live test, 23 Nov 2026): "Good morning" found Good Mornings.
    check('"Good morning. How can I improve my cardio conditioning for muay thai?" gets no video button', formVideoFor('Good morning. How can I improve my cardio conditioning for muay thai?', 'Try doing this on an assault bike: 3 to 4 rounds of 3 minutes.') === null)
    check('...while "Good morning, how do I do good mornings?" still finds the exercise (the fixture binds)', formVideoFor('Good morning, how do I do good mornings?', 'Hinge at the hips.')?.exercise === 'Good Mornings')
    check('...and "Hey, good morning! how do I do a deadlift?" names the deadlift, not the greeting', formVideoFor('Hey, good morning! how do I do a deadlift?', 'Brace first.')?.exercise === 'Deadlifts')
    const linked = linkifyBareUrls('Here: www.youtube.com/results?search_query=Box+Jumps and [ok](https://x.com).')
    check('a bare address the coach typed becomes a link the chat can open', linked.includes('[www.youtube.com/results?search_query=Box+Jumps](www.youtube.com/results?search_query=Box+Jumps)'), linked)
    check('...and a link already written as one is left alone', linked.includes('[ok](https://x.com)') && !linked.includes('[[ok]'), linked)
    const chat = strip(fs.readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
    check('the chat draws the app\'s button from the reply and what he said', /videoForReply\(i, msg\.content\)/.test(chat) && /data-testid="form-video"/.test(chat) && /formVideoFor\(said\[0\], reply, said\[1\]\)/.test(chat) && /sessionVideosFor\(said\[0\], todayPlan/.test(chat))
    // HIS SCREENSHOT, 16 Nov 2026: "Show me videos of today's exercises" got ONE button, Scapular Pull-Ups, which is not in
    // the session: "today's" leaves a lone "s", and the exercise search found a name starting with it.
    const ask = "Show me videos of today's exercises"
    check('"today\'s" does not name an exercise (a lone letter is not a word)', exerciseNamedIn(ask) === null && formVideoFor(ask, 'Tap the button below for each of today\'s lifts!') === null, exerciseNamedIn(ask))
    const todays = ['Arm Circles', 'Barbell Bench Press', 'Push Press', 'Lateral Raises', 'Skull Crushers', 'Neutral-Grip Dumbbell Press']
    const buttons = sessionVideosFor(ask, todays)
    check('...it gets a button for EACH exercise of today\'s session, in order', JSON.stringify(buttons.map(b => b.exercise)) === JSON.stringify(todays), buttons.map(b => b.exercise))
    check('...each to a YouTube search built from its own name', buttons.every(b => b.url === `https://www.youtube.com/results?search_query=${encodeURIComponent(`${b.exercise} exercise form tutorial`)}`))
    check('...but never for a how-to, a named exercise, or a day with no session', sessionVideosFor('how do I brace my core', todays).length === 0 && sessionVideosFor('show me a video of today\'s bench press', todays).length === 0 && sessionVideosFor(ask, []).length === 0)
    // HIS SECOND SCREENSHOT, 16 Nov 2026: "Show me videos to todays workouts", and the coach's reply named the bench press.
    const ask2 = 'Show me videos to todays workouts'
    check('"todays workouts" (no apostrophe) is a request for the session too', sessionVideosFor(ask2, todays).length === todays.length, sessionVideosFor(ask2, todays).length)
    check('...and the session list comes BEFORE a lone exercise the coach\'s reply happened to name', chat.indexOf('sessionVideosFor(said[0], todayPlan') > 0 && chat.indexOf('sessionVideosFor(said[0], todayPlan') < chat.indexOf('formVideoFor(said[0], reply, said[1])'))
    check('...so with that reply a lone-exercise reading exists to be outranked', formVideoFor(ask2, 'guides for today\'s Push & Press session, like the Barbell Bench Press.')?.exercise === 'Barbell Bench Press')
    // HIS THIRD SCREENSHOT, 16 Nov 2026: "all" found "Bodyweight Hip Hinge to Wall", "lift" found Deadlifts.
    const ask3 = 'Actually, show me video for all todays lifts'
    check('"show me video for all todays lifts" names no exercise ("all" is not "Wall", "lift" is not "Deadlifts")', exerciseNamedIn(ask3) === null, exerciseNamedIn(ask3))
    check('...so it gets a button for each of today\'s exercises', sessionVideosFor(ask3, todays).length === todays.length, sessionVideosFor(ask3, todays).length)
    check('a word inside a name is not that exercise ("out" is not Ab Wheel Rollout, "caps" not Scapular Pull-Ups)', exerciseNamedIn('show me a video, I want to work out') === null && exerciseNamedIn('show me videos for my caps') === null, [exerciseNamedIn('show me a video, I want to work out'), exerciseNamedIn('show me videos for my caps')])
    check('...while "show me lunges" and "how do I do a barbell back squat" still find their lift', /lunge/i.test(exerciseNamedIn('show me lunges') ?? '') && /squat/i.test(exerciseNamedIn('how do I do a barbell back squat') ?? ''), [exerciseNamedIn('show me lunges'), exerciseNamedIn('how do I do a barbell back squat')])
    check('...and no more than eight buttons', sessionVideosFor(ask, Array.from({ length: 12 }, (_, i) => `Move ${i}`)).length === 8)
    const coach = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
    check('the coach is told never to type a link', /NEVER type a link or a web address/.test(coach) && !/youtube\.com\/results/.test(coach))
  }

  console.log('\n8. His coach exam run of 14 Nov: a race with no date is asked about; no "100% safe"')
  {
    check('"I\'ve signed up for a 10k and I want to train for it": asked when, no card', raceDateMissing("I've signed up for a 10k and I want to train for it", '10k', undefined))
    check('...the date given next turn: the card', !raceDateMissing("It's on the 11th of April next year", '10k', '2027-04-11') && !raceDateMissing("It's on the 11th of April next year", '10k', undefined))
    check('"I want to run a 5k" names a distance, not a race: the card', !raceDateMissing('I want to run a 5k', '5k', undefined))
    check('"I\'m doing a half in spring, no date yet": the card', !raceDateMissing("I'm doing a half in spring, no date yet", 'half', undefined))
    check('"run 20 minutes" and "take the running out" never ask', !raceDateMissing('my race got cancelled, take the running out', 'none', undefined) && !raceDateMissing('signed up for a race, want to run 20 minutes', 'run_20', undefined))
    check('...a race date given with the goal: the card', !raceDateMissing('signed up for a 10k on 12 April', '10k', '2027-04-12'))
    check('the question asks the date and allows "no date"', /When is it\?/.test(RACE_DATE_QUESTION) && /If there isn't one/.test(RACE_DATE_QUESTION))
    const chat = strip(fs.readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
    check('the chat asks it before building the running card', /raceDateMissing\(userSaid, result\.proposal\.rawArgs\.goal, result\.proposal\.rawArgs\.race_date\)\s*\?\s*\{ refusal: RACE_DATE_QUESTION \}\s*:\s*buildRunningGoalProposal/.test(chat))
    const coach = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
    check('the coach is told never to say "100% safe", even as a comparison', /NOT EVEN AS A COMPARISON/.test(coach) && /Never write "100% safe"/.test(coach))
  }

  console.log('\n9. Setup QA, 14 Nov: a phone\'s curly apostrophe, pregnancy said in words, the meals note')
  {
    check('a curly apostrophe is made plain', plainTyped('I can\u2019t do Monday') === "I can't do Monday" && plainTyped('\u201Cok\u201D') === '"ok"')
    check('"I\u2019m 20 weeks pregnant" (phone apostrophe) is read as pregnant', saysPregnant('I\u2019m 20 weeks pregnant and want to stay fit'))
    check('"Pregnant, 20 weeks" and "12 weeks into my pregnancy" are read', saysPregnant('Pregnant, 20 weeks') && saysPregnant("I'm 12 weeks into my pregnancy") && saysPregnant('about 20 weeks pregnant now'))
    check('"my wife is pregnant", "we\'re pregnant", "I was pregnant last year", "after my pregnancy" are not', !saysPregnant('my wife is pregnant') && !saysPregnant("we're pregnant!") && !saysPregnant('I was pregnant last year') && !saysPregnant("I'm 6 months after my pregnancy"))
    const ex = detectFoodExclusions(plainTyped('I don\u2019t eat pork'))
    check('"I don\u2019t eat pork" (phone apostrophe) reaches Foods to avoid once made plain', JSON.stringify(ex).includes('pork'), ex)
    const onb = strip(fs.readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
    check('setup makes what he types plain before any reader', /const trimmed = plainTyped\(text\.trim\(\)\)/.test(onb))
    check('pregnancy said in words is ticked on the injuries card, unless that card was answered', /saysPregnant\(userText\) && !pregnancyAnswered\(ws\.values\) && !ws\.confirmed\.has\('injuries'\)/.test(onb) && /injuries: \[\.\.\.\(\(ws\.values\.injuries as string\[\] \| null\) \?\? \[\]\), 'pregnancy'\]/.test(onb))
    check('...and a skipped injuries card keeps it', /const kept = key === 'injuries' && pregnancyAnswered\(ws\.values\) \? \['pregnancy'\] : null/.test(onb) && /\[key\]: kept \}/.test(onb))
    const chatSrc = strip(fs.readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
    check('the chat makes what he types plain too', /const userText = photo \? photoMessageText\(plainTyped\(input\.trim\(\)\)\) : plainTyped\(input\.trim\(\)\)/.test(chatSrc))
    const meal = strip(fs.readFileSync('src/components/MealPlan.tsx', 'utf8'))
    check('Nutrition never tells someone who just set up to "Complete onboarding"', !/Complete onboarding/.test(meal))
  }

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) { console.error('test:live-test-nov14 FAILED'); process.exit(1) }
  console.log('His 14 Nov live-test findings hold.')
}

main().catch(err => { console.error(err); process.exit(1) })
