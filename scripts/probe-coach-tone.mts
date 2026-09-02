// ---------------------------------------------------------------------------
// Manual tone probe for the COACH CHAT (chat-gemini) — NOT a gate, and
// deliberately not in package.json: it calls the deployed function against the
// real Gemini API, so it costs money and its output is prose a human reads.
//
//   npx tsx scripts/probe-coach-tone.mts scripts/probe-personas/coach-warmth.json [out.json]
//
// WHY THIS EXISTS. onboarding-chat has had a tone probe for a while; the coach
// chat has never had one, and that asymmetry is the whole reason this is being
// built BEFORE the prompt is touched. A tone rewrite in this repo has already
// been tried and reverted (fa683fc): it fixed the voice and simultaneously
// made the model stop replying on 4 of 7 turns. That was caught only because
// onboarding-chat had a probe. The same change here would currently be
// invisible.
//
// So the number that matters most is NOT a judgement about warmth. It is
// TURNS THAT PRODUCED TEXT AT ALL. Everything else on the summary is
// secondary, and is printed only so a before/after can be compared without
// re-reading two transcripts side by side.
//
// It creates no profile and writes to no database. The context payload is
// fixed in the persona file so runs stay comparable — the same reason
// probe-personas/warmth-measure.json says to keep itself stable.
// ---------------------------------------------------------------------------
import fs from 'fs'

// Same existsSync guard as the other four env-reading scripts: a missing file
// should produce the message below, not an ENOENT stack trace.
if (fs.existsSync('.env.local')) fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=')
  if (i > 0) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim()
})
const URL = process.env.VITE_SUPABASE_URL!
const KEY = process.env.VITE_SUPABASE_ANON_KEY!
if (!URL || !KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const personaPath = process.argv[2] ?? 'scripts/probe-personas/coach-warmth.json'
const outPath = process.argv[3]
const persona = JSON.parse(fs.readFileSync(personaPath, 'utf8'))
const script: string[] = persona.messages
const context = persona.context

// Gemini flash rate-limits under repeated probes — retry, don't die. A
// transport failure is counted SEPARATELY from model silence below, so an
// unreachable function is never misread as the model refusing to speak.
async function callWithRetry(body: string): Promise<any> {
  const waits = [2000, 5000, 12000, 25000]
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${URL}/functions/v1/chat-gemini`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body,
      })
      if (r.ok) return await r.json()
      if (attempt >= waits.length) return { reply: '', _error: `HTTP ${r.status}` }
    } catch (e: any) {
      if (attempt >= waits.length) return { reply: '', _error: e?.message ?? 'network' }
    }
    await new Promise(res => setTimeout(res, waits[attempt]))
  }
}

/** The app strips these before rendering, so the probe must too or every
 *  measurement below counts markup the user never sees. */
const strip = (t: string) =>
  t.replace(/\[ACTION:\s*.*?\]/gi, '')
   .replace(/\[QUICK_REPLIES:\s*(.*?)\]/gi, '')
   .replace(/^[ \t]*\[BREAK\][ \t]*$/gim, '')
   .trim()

/** Openers that restate-then-grade the user's answer. This is the exact
 *  pattern the reverted attempt measured at 7/7 and Ashley asked to be rid of
 *  — "energy in the words, not verdicts". Kept deliberately narrow: it should
 *  catch a verdict, not any sentence that happens to start warmly. */
const GRADING_OPENER =
  /^(great|solid|nice|excellent|perfect|awesome|impressive|good)\b[^.!?]{0,40}[.!?]|^(that'?s|that is)\s+(a\s+)?(great|solid|smart|good|excellent|impressive)\b/i

const sentences = (t: string) => (t.match(/[^.!?]+[.!?]+/g) ?? [t]).filter(s => s.trim()).length
/** Sentence count alone under-reads a wall of text: a bulleted block has few
 *  full stops and scored 3 on a reply that was plainly too long. Line count
 *  catches that shape. Neither is exact — this is a proxy for "too long to be
 *  a text message", not a parser. */
const tooLong = (t: string) => sentences(t) > 3 || t.split('\n').filter(l => l.trim()).length > 3
const hasList = (t: string) => /^\s*([-*•]|\d+\.)\s/m.test(t) || /^\s*#{1,6}\s/m.test(t) || /^\s*\*\*[^*]+\*\*:/m.test(t)
const emojis = (t: string) => (t.match(/\p{Extended_Pictographic}/gu) ?? []).length

const history: { role: string; content: string }[] = []
const transcript: any[] = []

for (const text of script) {
  const j: any = await callWithRetry(JSON.stringify({ message: text, history, context }))
  const raw = String(j.reply ?? '')
  const reply = strip(raw)
  history.push({ role: 'user', content: text })
  if (raw) history.push({ role: 'assistant', content: raw })

  console.log('\nUSER:  ' + text)
  console.log('COACH: ' + (reply || '*** NO TEXT ***'))
  if (j._error) console.log('       [transport: ' + j._error + ']')
  if (j.action) console.log('       [action: ' + JSON.stringify(j.action) + ']')

  transcript.push({
    user: text,
    reply,
    error: j._error,
    action: j.action ?? null,
    grading: GRADING_OPENER.test(reply),
    sentences: reply ? sentences(reply) : 0,
    tooLong: reply ? tooLong(reply) : false,
    list: hasList(reply),
    emojis: emojis(reply),
  })
}

const real = transcript.filter(t => !t.error)
const spoke = real.filter(t => t.reply.length > 0).length
const errored = transcript.filter(t => t.error).length

console.log('\n' + '='.repeat(60))
console.log(`persona: ${persona.name ?? personaPath}`)
// THE number. fa683fc shipped a voice improvement that silenced the model on
// more than half its turns; nothing else on this summary outranks this line.
console.log(`TURNS THAT SPOKE AT ALL:   ${spoke}/${real.length}`)
if (errored) console.log(`transport failures:        ${errored}/${transcript.length} (not counted as silence)`)
console.log(`opened with a verdict:     ${real.filter(t => t.grading).length}/${real.length}`)
console.log(`longer than a text:        ${real.filter(t => t.tooLong).length}/${real.length}`)
console.log(`used a list or header:     ${real.filter(t => t.list).length}/${real.length}`)
console.log(`more than 1 emoji:         ${real.filter(t => t.emojis > 1).length}/${real.length}`)
console.log('='.repeat(60))
console.log('The first line is the one that decides whether a tone change ships.')

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify({ persona: persona.name ?? personaPath, turns: transcript }, null, 2))
  console.log('transcript written: ' + outPath)
}
