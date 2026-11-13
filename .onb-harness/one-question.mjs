// ---------------------------------------------------------------------------
// verify:onboarding-one-question — HIS SETUP, 13 NOV 2026, replayed on the real setup screen at 390px, then a whole
// setup walked from the first question to Generate with a coach that talks the way the live one did.
//
// His words: "Asking me questions about my background in lifting which is vague and no multiple choice is confusing.
// It asked me working weights and I gave a number but it didn't clarify which exercise I meant. Then when I asked it
// which exercise I meant it moved to the next question. Then it started asking multiple questions at once which broke
// the process."
//
//   1. "how would you describe your overall background with lifting?" comes with the experience options.
//   2. A weight typed on the lifts ("110kg") is asked about by the app: which lift, how many reps, with the boxes.
//      The coach's "Got it." over a number nothing kept is not shown.
//   3. A yes/no card under words that ask for the numbers is put under the card's own question.
//   4. A turn carries ONE question: the app never adds its own under a coach question about setup (his screenshots
//      3, 4 and 5), and where it must step in over an off-setup question, its question replaces the coach's.
//   5. The whole of setup, start to finish, with a coach that sometimes forgets the buttons: every turn one question,
//      and it ends at the summary with a plan that can be made.
//
// The coach is scripted (scripted.tsx explains why); everything after its reply is the app's own code.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { createRequire } from 'module'
const require = createRequire(new URL('../package.json', import.meta.url).pathname)
const { chromium } = require('playwright')
const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  const f = join(DIST, p === '/' ? '/.onb-harness/scripted.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e.message)))
const wait = ms => new Promise(r => setTimeout(r, ms))
let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }
const shot = async name => { try { writeFileSync(new URL(`./one-question-${name}.png`, import.meta.url).pathname, await page.screenshot()) } catch { /* a missing picture is not a check */ } }
const INPUT = '.ob-composer-fade input'
let loads = 0
const open = async state => { await page.goto(`${origin}/?state=${state}&n=${++loads}`); await wait(1200) }
const queue = turn => page.evaluate(t => window.__onbQueue.push(t), turn)
const say = async t => { await page.fill(INPUT, t, { timeout: 5000 }).catch(() => {}); await wait(100); await page.locator('button:has(svg.lucide-send)').click({ timeout: 5000 }).catch(() => {}); await wait(1200) }
const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || 'null'))

/**
 * The last turn, read from what the app kept: every coach message after his last message, and how many of them ask
 * something. A card that is still live counts as a question; so does a sentence with a question mark. Ticks do not.
 */
async function lastTurn() {
  const d = await draft()
  const msgs = d?.messages ?? []
  let i = msgs.length - 1
  while (i >= 0 && msgs[i].role !== 'user') i--
  const turn = msgs.slice(i + 1).filter(m => m.role === 'assistant' && !m.isReceipt)
  const live = m => !!m.slotCard && !m.slotCardSuperseded && !m.slotCardResolved
  const asking = turn.filter(m => live(m) || m.asksSlot || m.content.includes('?'))
  return { turn, asking: asking.length, cards: turn.filter(live).map(m => m.slotCard), text: turn.map(m => m.content).join(' | '), values: d?.values ?? {}, confirmed: d?.confirmedSlots ?? [] }
}
const STEP_IN = /Let's lock this one in|Easiest if you just tap one here|Pick whichever is closest|leave that one for now|park that one|Skipping ahead a bit|That one can wait|One quick one before we move on|A word or two is plenty/

console.log('\nSETUP, ONE QUESTION AT A TIME (his setup, 13 Nov 2026)\n')

console.log('  1. "Your background with lifting" comes with its options')
await open('his-experience')
await queue({ reply: 'Fair enough! To help me tailor the workouts properly, how would you describe your overall background with lifting?', actions: [] })
await say('Yes')
let t = await lastTurn()
const expCard = await page.locator('[data-slot-card="trainingExperience"]').count()
check('1a. the experience options are under the question, though the coach asked for none', t.cards.length === 1 && t.cards[0] === 'trainingExperience' && expCard === 1, t)
const expBox = await page.locator('[data-slot-card="trainingExperience"]').boundingBox().catch(() => null)
check('1b. ...on screen where the question is', !!expBox && expBox.y >= 0 && expBox.y + 40 < 844, expBox)
check('1c. one question in the turn', t.asking === 1, t)
await shot('experience')

console.log('\n  2. A weight typed on the lifts is asked about: which lift, how many reps')
await open('his-lifts')
await queue({ reply: 'Got it. Since you know your way around those main barbell lifts, could you tell me your current working weights for the squat, bench press, and deadlift?', actions: [{ name: 'present_slot', args: { slot_key: 'knowsWorkingLifts' } }] })
await say('110kg')
t = await lastTurn()
check('2a. the app asks which lift 110 kg was, and the reps', /Which lift was 110 kg on, and how many reps did you get\?/.test(t.text), t.text)
check('2b. ...with the three lift boxes under it, and no yes/no card', JSON.stringify(t.cards) === JSON.stringify(['knownSquatKg']) && (await page.locator('#slot-knownSquatKg').count()) === 1 && (await page.locator('#slot-knownDeadliftKg').count()) === 1, t.cards)
check('2c. the coach\'s "Got it." over a number nothing kept is not shown', !/Got it/.test(t.text), t.text)
check('2d. one question in the turn', t.asking === 1, t)
check('2e. "I know my numbers" is taken as said (a number was given), and no lift is kept from a bare number', t.values.knowsWorkingLifts === true && !t.confirmed.some(k => /^known(Squat|Bench|Deadlift)Kg$/.test(k)), { knows: t.values.knowsWorkingLifts, confirmed: t.confirmed })
await shot('which-lift')
// Named but with no reps: the app names the lift back and asks the reps.
await open('his-lifts')
await queue({ reply: 'Nice, noted.', actions: [] })
await say('I squat 110')
t = await lastTurn()
check('2f. "I squat 110" is asked for its reps, on the squat', /How many reps did you get with 110 kg on the squat\?/.test(t.text) && t.cards[0] === 'knownSquatKg', t.text)
// "I know my numbers" typed: the boxes are the turn's one question, so the coach's own question goes.
await open('lifts')
await queue({ reply: 'Great. Which days can you actually train?', actions: [] })
await say('I know my numbers')
t = await lastTurn()
check('2g. "I know my numbers" typed: the boxes come next, and the coach\'s days question is not left beside them', JSON.stringify(t.cards) === JSON.stringify(['knownSquatKg']) && !/Which days/.test(t.text) && /^.*Great\./.test(t.text) && t.asking === 1, t)
// A set is a set: the app does not get in the way of one.
await open('his-lifts')
await queue({ reply: 'Thanks. Could you tell me your current working weights for the squat, bench press, and deadlift?', actions: [{ name: 'present_slot', args: { slot_key: 'knowsWorkingLifts' } }] })
await say('I know them, roughly')
t = await lastTurn()
check('3a. a yes/no card under words that ask for the numbers is put under its own question', /Do you know what you lift on the barbell back squat, bench press and deadlift\?/.test(t.text) && !/tell me your current working weights/.test(t.text) && t.cards[0] === 'knowsWorkingLifts', t.text)
check('3b. ...and the coach\'s reaction stays', /^Thanks\./.test(t.text), t.text)

console.log('\n  4. A coach question about setup is never given a second question (his screenshots 3, 4, 5)')
await open('his-stalled')
await queue({ reply: "I don't want to guess and put the wrong weight on the wrong lift! Was that 110kg for your back squat, bench press, or deadlift?", actions: [] })
await say('Which exercise did I mean?')
t = await lastTurn()
check('4a. his "which exercise did I mean?" is answered by the coach, and the app does not move on under it', !STEP_IN.test(t.text) && t.asking === 1, t)
await shot('which-exercise')
await open('his-stalled')
await queue({ reply: "Fair enough — good to hear cardio isn't an issue. How's your overall recovery capacity holding up with work and life — sleep, stress, or a physical day-to-day?", actions: [{ name: 'present_slot', args: { slot_key: 'recoveryCapacity' } }] })
await say('45 to 60 minutes')
t = await lastTurn()
check('4b. recovery with its options, and NO male/female card added under it', JSON.stringify(t.cards) === JSON.stringify(['recoveryCapacity']) && !STEP_IN.test(t.text) && t.asking === 1, t)
await shot('recovery')
await open('his-stalled')
await queue({ reply: 'Keeping those sessions to 30 to 45 minutes keeps things sharp and punchy. When it comes to your time in the gym, what kind of training style do you usually prefer?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingStyle' } }] })
await say('30 to 45')
t = await lastTurn()
check('4c. training style with its options, and NO cardio card added under it', JSON.stringify(t.cards) === JSON.stringify(['trainingStyle']) && !STEP_IN.test(t.text) && t.asking === 1, t)
// "I don't know", and the coach moves on to another question WITH its options: the app does not add the options of
// the one he was stuck on as well.
// 'days': the days question was asked in words with no options, so "I don't know" there is what the app's rescue
// answers with the days options. The coach moved on with the style options: the rescue must not add the days as well.
await open('days')
await queue({ reply: 'No worries, we can set it later. What kind of training style do you usually prefer?', actions: [{ name: 'present_slot', args: { slot_key: 'trainingStyle' } }] })
await say("I don't know")
t = await lastTurn()
check('4h. "I don\'t know" and a coach question with options: one card, not two', JSON.stringify(t.cards) === JSON.stringify(['trainingStyle']) && t.asking === 1, t)
// The coach asked nothing at all: the app asks the next thing itself, alone (unchanged).
await open('his-stalled')
await queue({ reply: 'Sixty minutes gives us room.', actions: [] })
await say('an hour')
t = await lastTurn()
check('4d. a coach reply that asks nothing still gets the app\'s next question, one of it', t.asking === 1 && t.cards.length <= 1, t)
// His "Up to 3, then back": the FOURTH follow-up on something off setup gets the app's question INSTEAD of the coach's.
await open('days')
const followUp = (reply, note) => ({ reply, actions: note ? [{ name: 'record_context_fact', args: { display_text: note, raw_phrase: 'nights' } }] : [] })
await queue({ reply: 'Good to know. Which days can you actually train?', actions: [{ name: 'set_slot', args: { slot_key: 'recoveryCapacity', value: 'moderate' } }] })
await say('sleep is fine, stress is normal')
await queue(followUp('Nights are hard on a body. How many shifts a week, roughly?', 'Works night shifts')); await say('honestly my week is messy, I work nights')
await queue(followUp('Two is manageable. Do you sleep straight after a shift, or split it?', 'Two night shifts a week')); await say('two a week usually')
await queue(followUp('Good, a proper block of sleep helps. Do you train before or after a night shift, if at all?', 'Sleeps straight after a shift')); await say('straight after, about 7 hours')
t = await lastTurn()
check('4e. up to three follow-ups, the app stays out (his "Up to 3")', !STEP_IN.test(t.text) && t.asking === 1, t.text)
await queue(followUp('Makes sense. And what do you eat on a night shift, usually?', ''))
await say('never before, I am wrecked')
t = await lastTurn()
check('4f. the fourth: the app\'s setup question, ALONE (the coach\'s off-setup question is taken out)', STEP_IN.test(t.text) && !/what do you eat on a night shift/.test(t.text) && t.asking === 1, t.text)
check('4g. ...and the coach\'s reaction to what he said stays', /Makes sense\./.test(t.text), t.text)
await shot('fourth-follow-up')

console.log('\n  5. The whole of setup, start to finish, with a coach that talks like the live one')
// A stand-in for the live coach: reacts, then asks the next open question IN ITS OWN WORDS. It forgets the buttons on
// every other question (the live coach did on the lifting question), and asks the lifts the way it did that night.
// It records what he types when it plainly answers what it asked, as the live coach is told to.
await open('fresh')
await page.evaluate(() => {
  const OWN = {
    displayName: 'Hi, I\'m your coach. What should I call you?',
    fitnessGoal: 'What are you mainly after from your training?',
    trainingExperience: 'To help me tailor the workouts properly, how would you describe your overall background with lifting?',
    activityLevel: 'Outside of the gym, how active is your day-to-day?',
    equipment: 'Where will you be training, and what equipment do you have access to?',
    injuries: 'Anything bothering you, or any injuries I should work around?',
    knowsWorkingLifts: 'Since you know your way around the main barbell lifts, could you tell me your current working weights for the squat, bench press, and deadlift?',
    trainingDays: 'Which days can you actually train?',
    sessionDuration: 'How long have you got for each session?',
    trainingStyle: 'What kind of training style do you usually prefer?',
    conditioningPreference: 'How do you feel about cardio?',
    recoveryCapacity: 'How\'s your recovery holding up, sleep and stress?',
  }
  const REACT = ['Fair enough!', 'Got it.', 'Nice.', 'Good to know.']
  window.__coach = { turns: 0, asked: null }
  const prior = window.fetch
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (!url.includes('/functions/v1/onboarding-chat')) return prior(input, init)
    const body = JSON.parse(String(init?.body ?? '{}'))
    window.__onbRequests.push(body)
    const c = window.__coach
    c.turns++
    const cat = body.state?.slotCatalog ?? []
    let rem = body.state?.remaining ?? []
    const actions = []
    const last = cat.find(e => e.key === c.asked)
    if (last && rem.includes(last.key)) {
      if (last.control === 'text') { actions.push({ name: 'set_slot', args: { slot_key: last.key, value: body.message } }); rem = rem.filter(k => k !== last.key) }
      else {
        const opt = (last.values ?? []).find(o => o.label.toLowerCase() === String(body.message).trim().toLowerCase())
        if (opt) { actions.push({ name: 'set_slot', args: { slot_key: last.key, value: opt.value } }); rem = rem.filter(k => k !== last.key) }
      }
    }
    if (rem.length === 0) return new Response(JSON.stringify({ reply: 'That\'s everything I need.', actions: [...actions, { name: 'complete_onboarding', args: {} }] }), { status: 200 })
    const k = rem[0]
    const e = cat.find(x => x.key === k)
    c.asked = k
    const q = OWN[k] ?? e?.question ?? `Tell me about ${k}?`
    // Forget the buttons on every other choice question; always send the boxes for numbers (the live coach does).
    const present = e && (e.control === 'numeric' || k === 'knowsWorkingLifts' || c.turns % 2 === 0)
    if (present && e.control !== 'text') actions.push({ name: 'present_slot', args: { slot_key: k } })
    return new Response(JSON.stringify({ reply: `${REACT[c.turns % REACT.length]} ${q}`, actions }), { status: 200 })
  }
})
await say('Hi')
const perTurn = []
let typedLifts = false
for (let i = 0; i < 60; i++) {
  if (await page.locator('[data-review-row]').count()) break
  t = await lastTurn()
  perTurn.push({ asking: t.asking, cards: t.cards, text: t.text.slice(0, 140) })
  const card = t.cards[0]
  // A box or button that is not there is a FAILED check below, never a crash (a crash is not a catch).
  const fill = (sel, v) => page.fill(sel, v, { timeout: 3000 }).catch(() => {})
  const save = key => page.locator(`[data-slot-card="${key}"]`).last().getByRole('button', { name: 'Save' }).click({ timeout: 3000 }).catch(() => {})
  if (card === 'age') {
    await fill('#slot-age', '1990-05-17'); await fill('#slot-heightCm', '180'); await fill('#slot-weightKg', '82')
    await save('age'); await wait(1300); continue
  }
  if (card === 'knownSquatKg') {
    await fill('#slot-knownSquatKg', '110'); await fill('#slot-knownSquatKg-reps', '5')
    await fill('#slot-knownBenchKg', '85'); await fill('#slot-knownBenchKg-reps', '6')
    await save('knownSquatKg'); await wait(1300); continue
  }
  if (card === 'knowsWorkingLifts' && !typedLifts) { typedLifts = true; await say('110kg'); continue }
  if (card) {
    const c = page.locator(`[data-slot-card="${card}"]`).last()
    const opts = c.locator('[role="radio"], [aria-pressed]')
    // He is a gym lifter: these answers make the lifts question apply, as it did for him. Anything else: the first.
    const PICK = { fitnessGoal: /muscle/i, trainingExperience: /Intermediate/, equipment: /full gym|commercial/i, knowsWorkingLifts: /I know my numbers/, conditioningPreference: /fine/i }
    const want = PICK[card] ? c.getByText(PICK[card]) : null
    if (want && await want.count()) await want.first().click({ timeout: 3000 }).catch(() => {})
    else if (await opts.count()) await opts.first().click({ timeout: 3000 }).catch(() => {})
    await wait(300)
    const next = c.locator('[data-slot-next]')
    if (await next.count() && await next.isEnabled().catch(() => false)) await next.click({ timeout: 3000 }).catch(() => {})
    await wait(1300); continue
  }
  // No card: a typed answer.
  await say(/call you/i.test(t.text) ? 'Ashley' : 'none')
}
t = await lastTurn()
const reachedReview = (await page.locator('[data-review-row]').count()) > 0
const worst = perTurn.reduce((a, p) => Math.max(a, p.asking), 0)
check('5a. setup reached the summary', reachedReview, perTurn.slice(-4))
check('5b. EVERY turn on the way put one question in front of him, never two', perTurn.length >= 12 && worst === 1, perTurn.filter(p => p.asking !== 1))
check('5c. the lifting-background question came with its options', perTurn.some(p => /background with lifting/.test(p.text) && p.cards[0] === 'trainingExperience'), perTurn.filter(p => /lifting/.test(p.text)))
check('5d. his "110kg" was asked about (which lift, how many reps) and the lifts were then kept from the sets he gave', perTurn.some(p => /Which lift was 110 kg on/.test(p.text)) && !!t.values.knownSquatKg && !!t.values.knownBenchKg, { squat: t.values.knownSquatKg, bench: t.values.knownBenchKg })
check('5g. every choice question on the way came with its options (only typed questions had none)', perTurn.filter(p => p.cards.length === 0).every(p => /left out|usually eat|call you/i.test(p.text)), perTurn.filter(p => p.cards.length === 0))
check('5e. no turn on the way had the app stepping in over a question', !perTurn.some(p => STEP_IN.test(p.text)), perTurn.filter(p => STEP_IN.test(p.text)))
await shot('summary')
if (reachedReview) {
  await page.getByRole('button', { name: 'Generate My Plan' }).click().catch(() => {})
  await wait(800)
}
const profile = await page.evaluate(() => window.__onbCompleted ?? null)
check('5f. the plan can be made from it, with his squat and bench from the sets he typed', !!profile && Number(profile.known_squat_kg) > 0 && Number(profile.known_bench_kg) > 0, profile ? { squat: profile.known_squat_kg, bench: profile.known_bench_kg } : null)
check('harness: no page errors', pageErrors.length === 0, pageErrors)
console.log(`      (${perTurn.length} turns walked)`)
if (process.env.SHOW_TURNS) for (const p of perTurn) console.log("       ", p.asking, JSON.stringify(p.cards), p.text)

console.log(`\n${ran} checks ran. ${failures === 0 ? 'Setup asks one thing at a time, and asks which lift a number was.' : `${failures} check(s) FAILED.`}\n`)
await browser.close(); server.close()
process.exit(failures === 0 ? 0 : 1)
