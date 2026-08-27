// ---------------------------------------------------------------------------
// Read two probe transcripts and put NUMBERS on the thing everyone has only
// ever had adjectives for.
//
// Tone in this project has never been measured against the real model. Every
// claim — including mine — has been reasoning about a prompt, or a gate run
// against a scripted fake. Ashley said the onboarding coach reads "cold and
// clipped"; the honest response to that is not a better-sounding prompt, it is
// a before/after on the deployed function.
//
// Free to run (it reads two JSON files, no API calls), unlike the probe that
// produces them. Usage:
//
//   npm run tone:compare -- before.json after.json
//   npm run tone:compare -- before.json          # just read one
//
// WHAT "COLD AND CLIPPED" ACTUALLY IS, made countable. The signature is a turn
// that is nothing but a question — no reaction, no reference to what was just
// said, no human noise. So: bare-question rate, sentences per turn, whether
// the reply reuses the user's own words, contractions, and opener variety.
//
// TWO OF THESE ARE NOT WARMTH METRICS, they are guard rails, and they are the
// reason this script exists rather than a vibe check:
//   - EMPTY REPLIES must stay 0. fa683fc was a tone rewrite that fixed grading
//     7/7 -> 0/7 and silenced the model on 4 of 7 turns. That is the failure
//     mode of this exact change.
//   - GRADING must stay at 0. The anti-appraisal rule was added for a real bug
//     Ashley hit ("That 12% target is a classic, sharp goal to aim for").
//     Warmth coming back as compliments is not the fix, it is the old bug.
//
// SAMPLE SIZE IS SMALL — the conversational persona is 9 turns. One turn is
// ~11 percentage points. Read the big moves; ignore the small ones.
// ---------------------------------------------------------------------------

import fs from 'fs'

interface Turn {
  user: string
  reply: string
  error?: unknown
  actions?: { name: string; args?: Record<string, unknown> }[]
}
interface Transcript { persona?: string; turns: Turn[] }

const STOPWORDS = new Set([
  'about', 'after', 'again', 'been', 'being', 'could', 'doing', 'down', 'each', 'from',
  'have', 'here', 'into', 'just', 'like', 'more', 'most', 'much', 'need', 'only', 'over',
  'said', 'same', 'some', 'such', 'than', 'that', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'very', 'want', 'well', 'were', 'what', 'when',
  'where', 'which', 'while', 'will', 'with', 'would', 'your', 'youre', 'dont', 'really',
  'think', 'know', 'thing', 'things', 'going', 'still', 'because', 'something',
])

/** Appraisal of the PERSON, which the prompt bans outright. Includes the compliment-wearing-a-description's-clothes shapes Ashley actually got. */
const GRADING = [
  /\b(great|good|nice|solid|excellent|perfect|awesome|brilliant|fantastic|smart|impressive)\s+(choice|goal|answer|target|shout|one|call|number|start|plan)\b/i,
  /\bthat'?s\s+(a\s+)?(great|good|nice|solid|excellent|perfect|awesome|brilliant|fantastic|smart|impressive|classic|sharp|ambitious|realistic)\b/i,
  /\b(love|like)\s+(that|it|this)\b/i,
  /\bgood\s+(shout|man|stuff|to hear)\b/i,
  /\bwell done\b/i,
]

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
const words = (t: string) => (t.toLowerCase().match(/[a-z']+/g) ?? [])

/** A turn that is ONLY question(s) — the actual shape of "clipped". */
function isBareQuestion(reply: string): boolean {
  const ss = sentences(reply)
  if (ss.length === 0) return false
  return ss.every(s => s.endsWith('?'))
}

/** Does the reply pick up a distinctive word the user just used? The prompt's core warmth mechanic: use what they told you, inside the next question. */
function echoesUser(userText: string, reply: string): boolean {
  const userWords = new Set(
    words(userText).filter(w => w.length >= 4 && !STOPWORDS.has(w)),
  )
  if (userWords.size === 0) return false
  return words(reply).some(w => userWords.has(w))
}

const CONTRACTION = /\b\w+'(s|re|ll|ve|d|t|m)\b/gi

function analyse(t: Transcript) {
  const turns = t.turns.filter(x => !x.error)
  const n = turns.length || 1
  const replies = turns.map(x => String(x.reply ?? ''))

  const openers = replies
    .map(r => words(r).slice(0, 2).join(' '))
    .filter(Boolean)

  return {
    turns: turns.length,
    errorTurns: t.turns.length - turns.length,
    emptyReplies: replies.filter(r => !r.trim()).length,
    grading: replies.filter(r => GRADING.some(re => re.test(r))).length,
    bareQuestion: replies.filter(isBareQuestion).length,
    bareQuestionPct: Math.round((replies.filter(isBareQuestion).length / n) * 100),
    sentencesPerTurn: +(replies.reduce((a, r) => a + sentences(r).length, 0) / n).toFixed(2),
    wordsPerTurn: Math.round(replies.reduce((a, r) => a + words(r).length, 0) / n),
    echoesUser: turns.filter(x => echoesUser(x.user, String(x.reply ?? ''))).length,
    echoesUserPct: Math.round((turns.filter(x => echoesUser(x.user, String(x.reply ?? ''))).length / n) * 100),
    contractions: +(replies.reduce((a, r) => a + (r.match(CONTRACTION) ?? []).length, 0) / n).toFixed(2),
    distinctOpeners: new Set(openers).size,
    openerCount: openers.length,
    chipTurns: turns.filter(x => (x.actions ?? []).some(a => a.name === 'present_slot')).length,
  }
}

type Stats = ReturnType<typeof analyse>

/** '↑ better', '↓ better', or 'must stay' — stated per metric so nothing is read the wrong way round. */
const METRICS: { key: keyof Stats; label: string; good: 'up' | 'down' | 'zero'; note?: string }[] = [
  { key: 'emptyReplies', label: 'Empty replies', good: 'zero', note: 'GUARD RAIL — fa683fc broke exactly here' },
  { key: 'grading', label: 'Graded/appraised the user', good: 'zero', note: 'GUARD RAIL — warmth must not return as compliments' },
  { key: 'bareQuestionPct', label: 'Turns that are ONLY a question  %', good: 'down', note: 'the actual shape of "clipped"' },
  { key: 'sentencesPerTurn', label: 'Sentences per turn', good: 'up' },
  { key: 'wordsPerTurn', label: 'Words per turn', good: 'up' },
  { key: 'echoesUserPct', label: 'Reused what the user just said  %', good: 'up', note: 'the core warmth mechanic' },
  { key: 'contractions', label: 'Contractions per turn', good: 'up', note: 'talks like a human texts' },
  { key: 'distinctOpeners', label: 'Distinct turn openings', good: 'up', note: 'out of `turns`' },
  { key: 'chipTurns', label: 'Turns that offered chips', good: 'down', note: 'chips are a rescue, not the default' },
]

const [beforePath, afterPath] = process.argv.slice(2)
if (!beforePath) {
  console.error('usage: npm run tone:compare -- before.json [after.json]')
  process.exit(1)
}

const load = (p: string): Transcript => JSON.parse(fs.readFileSync(p, 'utf8'))
const before = analyse(load(beforePath))
const after = afterPath ? analyse(load(afterPath)) : null

console.log(`\n${'='.repeat(72)}`)
console.log('ONBOARDING TONE' + (after ? ' — BEFORE vs AFTER' : ''))
console.log('='.repeat(72))
console.log(`sample: ${before.turns} turns${after ? ` vs ${after.turns} turns` : ''}` +
  ` — one turn is ~${Math.round(100 / (before.turns || 1))} percentage points, so read the big moves only`)
if (before.errorTurns || after?.errorTurns) {
  console.log(`NOTE: transport errors excluded — before ${before.errorTurns}${after ? `, after ${after.errorTurns}` : ''}`)
}
console.log('')

const pad = (s: string | number, n: number) => String(s).padStart(n)
console.log(`  ${'metric'.padEnd(36)}${pad('before', 8)}${after ? pad('after', 8) + pad('move', 9) : ''}`)
console.log(`  ${'-'.repeat(36)}${'-'.repeat(after ? 25 : 8)}`)

for (const m of METRICS) {
  const b = before[m.key] as number
  const a = after ? (after[m.key] as number) : null
  let move = ''
  if (a !== null) {
    const d = +(a - b).toFixed(2)
    const better = m.good === 'zero' ? a === 0 : m.good === 'up' ? d > 0 : d < 0
    const worse = m.good === 'zero' ? a > 0 : m.good === 'up' ? d < 0 : d > 0
    move = d === 0 ? '  —' : `${d > 0 ? '+' : ''}${d}${better ? '  ✓' : worse ? '  ✗' : ''}`
  }
  console.log(`  ${m.label.padEnd(36)}${pad(b, 8)}${a !== null ? pad(a, 8) + pad(move, 9) : ''}`)
  if (m.note) console.log(`  ${' '.repeat(36)}${m.note}`)
}

console.log('')
if (after) {
  const railsBroken =
    after.emptyReplies > 0 ? 'EMPTY REPLIES came back — this is the fa683fc failure, revert the prompt' :
    after.grading > 0 ? 'GRADING came back — warmth returned as compliments, which is the bug Ashley found' : null
  if (railsBroken) console.log(`STOP: ${railsBroken}\n`)
  else console.log('Both guard rails held: no empty replies, no graded answers.\n')
}
console.log('The numbers cannot tell you whether it sounds like a person. Read the')
console.log('transcripts too — these say WHERE to look, not whether it is good.\n')
