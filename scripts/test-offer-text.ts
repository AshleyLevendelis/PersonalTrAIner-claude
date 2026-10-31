/**
 * test:offer-text — Ashley's ruling, 20 Oct 2026, "Text + small buttons always."
 *
 * The coach's offers stopped being cards: the question and its facts are the coach's own bubble, small buttons under
 * it. The rows a builder writes are the same rows; `offer-text.ts` says them as lines. Held here:
 *   §1 every line reads as a sentence: "Mon: A → B", a dash said in words, a note kept;
 *   §2 one change repeated over many days is said ONCE, naming the days, in the order they first appear; past four
 *      days the line counts the rest instead of dropping them;
 *   §3 NOTHING A ROW SAID IS LOST: over every real-shaped row set below, each row's before, after and note reaches
 *      the text, and each label is named or counted;
 *   §4 the offer component draws the old card's chrome nowhere, and puts the facts INSIDE the coach's bubble.
 * Whether it LOOKS like a text on a phone — one bubble, small buttons with a 44px tap, facts before the tap — is
 * verify:offer-text's, in a real browser; §4 here only pins what a source read can.
 */
import { readFileSync } from 'node:fs'
import { offerChanges, offerChangeText, OFFER_LABELS_NAMED } from '../src/lib/offer-text'
import type { DiffRow } from '../src/lib/pending-actions-store'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const lines = (rows: DiffRow[]) => offerChanges(rows).map(offerChangeText)
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

console.log('\n§1 Each row is a sentence')
{
  check('a swap: "Exercise: Band Hip Abduction → Glute Bridge"',
    JSON.stringify(lines([{ field: 'Exercise', before: 'Band Hip Abduction', after: 'Glute Bridge' }])) === JSON.stringify(['Exercise: Band Hip Abduction → Glute Bridge']),
    lines([{ field: 'Exercise', before: 'Band Hip Abduction', after: 'Glute Bridge' }]))
  check('a note is kept, in brackets', lines([{ field: 'Protein', before: '64g', after: '9g', note: '-55g' }])[0] === 'Protein: 64g → 9g (-55g)', lines([{ field: 'Protein', before: '64g', after: '9g', note: '-55g' }]))
  check('a food taken out ("—" after) lets the label say it: "Taking out: 200g salmon"', lines([{ field: 'Taking out', before: '200g salmon', after: '—' }])[0] === 'Taking out: 200g salmon', lines([{ field: 'Taking out', before: '200g salmon', after: '—' }]))
  check('a day that only gains ("—" before) says what it adds', lines([{ field: 'Fri 25 Sep', before: '—', after: 'Leg Press' }])[0] === 'Fri 25 Sep: adds Leg Press', lines([{ field: 'Fri 25 Sep', before: '—', after: 'Leg Press' }]))
  check('"— left out" loses its dash, keeps its words', lines([{ field: 'Sun 11 Oct', before: 'Band Dislocates', after: '— left out' }])[0] === 'Sun 11 Oct: Band Dislocates → left out', lines([{ field: 'Sun 11 Oct', before: 'Band Dislocates', after: '— left out' }]))
  check('the same thing either side is said once', lines([{ field: 'On this plan', before: 'not scheduled', after: 'not scheduled' }])[0] === 'On this plan: not scheduled', lines([{ field: 'On this plan', before: 'not scheduled', after: 'not scheduled' }]))
}

console.log('\n§2 One change over many days is said once')
{
  const kit: DiffRow[] = [
    { field: 'Fri 18 Sep', before: 'Barbell Squats', after: 'Smith Machine Squat' },
    { field: 'Sun 20 Sep', before: 'Barbell Bench Press', after: 'Dumbbell Bench Press' },
    { field: 'Mon 21 Sep', before: 'Barbell Squats', after: 'Smith Machine Squat' },
    { field: 'Wed 23 Sep', before: 'T-Bar Rows', after: 'Seated Cable Row' },
    { field: 'Fri 25 Sep', before: 'Barbell Squats', after: 'Leg Press' },
    { field: 'Sun 27 Sep', before: 'Barbell Bench Press', after: 'Dumbbell Bench Press' },
  ]
  const got = lines(kit)
  check('six rows, four changes, in the order they first appear', JSON.stringify(got) === JSON.stringify([
    'Fri 18 Sep and Mon 21 Sep: Barbell Squats → Smith Machine Squat',
    'Sun 20 Sep and Sun 27 Sep: Barbell Bench Press → Dumbbell Bench Press',
    'Wed 23 Sep: T-Bar Rows → Seated Cable Row',
    'Fri 25 Sep: Barbell Squats → Leg Press',
  ]), got)
  check('the same swap with DIFFERENT notes stays two lines (a note is part of what the row said)',
    lines([{ field: 'Mon', before: 'A', after: 'B', note: 'week 3' }, { field: 'Tue', before: 'A', after: 'B', note: 'week 4' }]).length === 2)
  const days = (n: number): DiffRow[] => Array.from({ length: n }, (_, i) => ({ field: `Mon (Week ${i + 1})`, before: 'Back Squat', after: 'Goblet Squat' }))
  check('four days are all named', lines(days(4))[0] === 'Mon (Week 1), Mon (Week 2), Mon (Week 3) and Mon (Week 4): Back Squat → Goblet Squat', lines(days(4)))
  // A literal on one side (CLAUDE.md: a check compared against the constant that drives it can only agree with itself).
  // A LIST IS NOT A REPEATED CHANGE (found 20 Oct by verify:chat-session-kind): today's cardio session read "Rowing
  // Machine and Cycling Intervals: 6 rounds…" then Elliptical — two blocks merged and the order lost.
  const session: DiffRow[] = [
    { field: 'Rowing Machine', before: '', after: '6 rounds, 45s on, 40s off' },
    { field: 'Elliptical', before: '', after: '20 min steady' },
    { field: 'Cycling Intervals', before: '', after: '6 rounds, 45s on, 40s off' },
  ]
  check('a list of items (nothing before them) keeps every item on its own line, in its order, whatever the doses',
    JSON.stringify(lines(session)) === JSON.stringify(['Rowing Machine: 6 rounds, 45s on, 40s off', 'Elliptical: 20 min steady', 'Cycling Intervals: 6 rounds, 45s on, 40s off']), lines(session))
  check('five days: three named and the rest COUNTED, never dropped', OFFER_LABELS_NAMED === 3 && lines(days(5))[0] === 'Mon (Week 1), Mon (Week 2), Mon (Week 3) and 2 more: Back Squat → Goblet Squat', lines(days(5)))
}

console.log('\n§3 Nothing a row said is lost')
{
  // Shapes copied from the builders that write them (ChatAssistant, meal-food-edit, the kit and injury offers).
  const sets: DiffRow[][] = [
    [{ field: 'Exercise', before: 'Seated Cable Row', after: 'Leg Press' }],
    [{ field: 'Taking out', before: '200g salmon', after: '—' }, { field: 'Calories', before: '1216 kcal', after: '260 kcal', note: '-956 kcal' }, { field: 'Protein', before: '64g', after: '9g', note: '-55g' }],
    [{ field: 'Your kit', before: 'dumbbells and a barbell and plates', after: 'dumbbells' }, ...Array.from({ length: 6 }, (_, i) => ({ field: `Wed ${16 + 7 * (i % 3)} Sep`, before: i % 2 ? 'Band Face Pulls' : 'Barbell Squats', after: i % 2 ? 'Prone Y-T Raises' : 'Smith Machine Squat' }))],
    [...Array.from({ length: 9 }, (_, i) => ({ field: `Monday (Week ${i + 1})`, before: 'Back Squat', after: '— removed (no safe alternative)', note: 'no knee-safe squat left' })), { field: 'Injuries', before: 'not listed', after: 'knee — added' }],
    [{ field: 'Training days', before: 'Mon, Wed, Fri', after: 'Mon, Tue, Thu' }, { field: 'Gym sessions', before: 'mornings', after: 'evenings' }],
  ]
  const lost: string[] = []
  for (const rows of sets) {
    const text = lines(rows).join('\n')
    for (const r of rows) {
      for (const part of [r.before, r.after.replace(/^—\s+/, ''), r.note ?? '']) {
        if (part && part !== '—' && !text.includes(part)) lost.push(part)
      }
    }
    // Every label is named, or counted in an "and N more" whose N adds up.
    const named = rows.map(r => r.field).filter(f => text.includes(f)).length
    const counted = [...text.matchAll(/and (\d+) more:/g)].reduce((n, m) => n + Number(m[1]), 0)
    if (named + counted < new Set(rows.map(r => r.field)).size) lost.push(`labels: ${named} named + ${counted} counted of ${rows.length}`)
  }
  check('every before, after and note reaches the text, and every day is named or counted', lost.length === 0, lost)
  check('...and no row came out as an empty sentence', sets.every(rows => lines(rows).every(l => /\S: \S|^\S/.test(l) && !/: $/.test(l))), sets.map(lines))
}

console.log('\n§4 The offer is the coach\'s bubble, with nothing of the card')
{
  const card = strip(readFileSync('src/components/chat/ProposalCard.tsx', 'utf8'))
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  // Strings only: what the component can PRINT.
  const printed = [...card.matchAll(/(['"`>])([^'"`<>{}]*?)(['"`<])/g)].map(m => m[2].trim()).filter(Boolean)
  check('no "Proposed change" heading and no "Keep" button anywhere it can print', !printed.some(t => /Proposed change/i.test(t) || t === 'Keep'), printed.filter(t => /Proposed change|^Keep$/i.test(t)))
  check('..."Not now" in its place', printed.includes('Not now'), printed.filter(t => /now/i.test(t)))
  check('the facts are said through the shared lines, and handed to the bubble', /offerChanges\(diff\.rows\)/.test(card) && /offerChangeText\(c\)/.test(card) && /\{bubble\(facts\)\}/.test(card))
  // RE-ANCHORED 31 Oct 2026 (design 2b, which her tab-polish plan says fits this ruling): the offer's FIRST answer is
  // a filled main-colour pill. What this guards is unchanged — no glowing button, and no solid main-colour BLOCK —
  // so: no glow anywhere, the fill appears once, on the primary weight only, and that pill is word-sized (36px, h-9).
  const fills = card.match(/\bbg-primary\b/g) ?? []
  const pillFn = (card.match(/const pill = \(weight[\s\S]*?\n {2}const small/) || [''])[0]
  check('no big glowing button: no glow; the main colour fills ONE word-sized pill, the primary answer, and nothing else', !/glow-mint-box/.test(card) && fills.length === 1
    && /weight === 'primary'\s*\?\s*'bg-primary /.test(pillFn) && /inline-flex h-9 items-center/.test(pillFn), { fills: fills.length, pillFn: pillFn.slice(0, 200) })
  check('every button keeps the 44px tap target', (card.match(/<button/g) ?? []).length >= 3 && !/<button[^>]*className="(?![^"]*min-h-\[44px\])/.test(card) && /const small = '[^']*min-h-\[44px\]/.test(card))
  const site = chat.indexOf('<ProposalCard')
  const cards = chat.indexOf('data-testid="chat-cards"')
  check('the chat hands the offer the coach\'s own bubble, and draws it OUTSIDE the cards column',
    site >= 0 && cards >= 0 && site < cards && /bubble=\{facts => drawBubble\(facts\)\}/.test(chat.slice(site, site + 600)), { site, cards })
  // A FAILED turn draws no offer (as the card was never drawn on one): proved on a source fixture of the guard.
  check('...and only for a turn that has not failed', /const offerOf = \(m: ChatMessage\) => \(m\.pendingAction && m\.status !== 'failed' \? m\.pendingAction : null\)/.test(chat))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('offer text: all checks passed')
