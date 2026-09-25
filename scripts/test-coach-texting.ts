/**
 * THE COACH TEXTS; IT DOES NOT FORMAT — the part of Ashley's 24 Sep 2026
 * rulings ("short steps", "a text conversation with a coach") that code can
 * hold. The first exam run after the rulings (25 Sep) showed the model still
 * writing "### Setup & Stance" headers and "**Set your stance**:" bold, so the
 * reply now leaves chat-gemini through textLikeACoach.
 *
 * What this CANNOT prove, and says so: whether an answer is one line per
 * thing, or whether a closing question matters. Those are judgement, and the
 * coach exam's voice dimension grades them.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { textLikeACoach, cleanCoachResponse } from '../supabase/functions/chat-gemini/text-like-a-coach.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const noMarkup = (s: string) => !/\*\*/.test(s) && !/^[ \t]{0,3}#{1,6}[ \t]/m.test(s)

const CAUGHT_25_SEP: string[] = [
  "1. **Set your stance**: Stand with your feet hip-width apart, with the barbell cutting directly over the middle of your feet.\n2. **Hinge and grip**: Bend at your hips and knees to grab the bar with a shoulder-width grip, keeping your arms completely straight.\n3. **Brace and pull**: Flatten your back, pull your chest up to take the \"slack\" out of the bar, and push the floor away with your legs to stand up.\n\nThat setup is the foundation. Are you planning to do barbell deadlifts today, or are you working with dumbbells or a kettlebell?",
  "[Watch Barbell Deadlift Tutorial on YouTube](www.youtube.com/results?search_query=barbell+deadlift+tutorial+form)\n\n### Setup & Stance\n- **Foot position**: Walk up to the bar and place your feet hip-width apart. The barbell should sit directly over the middle of your feet, about an inch away from your shins.\n- **The grip**: Hinge at your hips and bend your knees just enough to grip the bar just outside your shins. Keep your arms completely straight — they act as chains, not levers.\n\n### The Pull (Execution)\n- **Set your back**: Pull your chest up and push your hips back to flatten your spine. Think about squeezing your armpits tight (like you're trying to crush oranges under them) to engage your lats.\n- **Take the slack out**: Pull up slightly on the bar until you hear it click against the weights. This creates tension before the lift starts.\n- **Push the floor**: Do not yank the bar off the ground. Drive your feet hard into the floor, pushing the earth away, and stand up by driving your hips forward. Keep the bar touching your legs the entire way up.\n\n### The Lockout & Descent\n- **Lockout**: Stand tall, squeezing your glutes and quads at the top. Do not lean back or hyperextend your lower back.\n- **The descent**: Reverse the movement by pushing your hips back first. Once the bar clears your knees, bend your legs to lower it back to the floor. Reset completely before the next rep.\n\n### Common Mistakes\n- **Rounding the back**: This usually happens if you start with the bar too far forward or fail to brace your core. Keep the bar close.\n- **Bending the arms**: Pulling with your biceps can cause serious injury. Keep your arms dead straight throughout.\n- **Squatting the weight**: If your hips are too low, your shins will push the bar forward. Keep your hips higher than your knees.\n\n\nAre you getting ready to hit these in a session today, Ashley?",
  "Carbs are exactly what we want to pull on when hunger spikes like that, Ashley. Since you're starving today, let's make sure you're eating enough of them to fuel up. \n\nFor your pre-workout tomorrow morning, you want something fast-digesting so it's ready to use by the time you train, without sitting heavy in your stomach. Since your profile has a nut-free filter active, a great option is:\n\n**Banana & Honey Oatmeal**\n- 50g rolled oats (cooked in water or a nut-free milk like soy or oat milk)\n- 1 medium banana, sliced\n- 1 tbsp honey\n\nThis gives you a great mix of fast and moderate-releasing carbs to power through that lower body session tomorrow. If you want me to put this into your breakfast slot for tomorrow, just say the word and I'll add it to your plan.\n\nAs for skipping the stretching yesterday — don't sweat it at all. Post-workout stretching is great for cooling down and relaxing, but it isn't going to make or break your recovery or your progress. The most important thing yesterday was getting that bench press session done. \n\nHow are your legs feeling today? We've got back squats and Romanian deadlifts on the schedule for tomorrow morning."
]

async function main() {
  console.log('\n1. Markup goes; words stay')
  check('a header becomes its own plain line', textLikeACoach('### Setup & Stance\nFeet under the bar.') === 'Setup & Stance\nFeet under the bar.', textLikeACoach('### Setup & Stance\nFeet under the bar.'))
  check('...at any level, with closing hashes too', textLikeACoach('# One\n## Two ##') === 'One\nTwo')
  check('bold becomes the words inside it, on a numbered step',
    textLikeACoach('1. **Set your stance**: feet hip-width.') === '1. Set your stance: feet hip-width.')
  check('...and on a dash line', textLikeACoach('- **Foot position**: over mid-foot') === '- Foot position: over mid-foot')
  check('...and underscore bold', textLikeACoach('go __slow__ on the way down') === 'go slow on the way down', textLikeACoach('go __slow__ on the way down'))
  check('numbered and dash lines themselves stay — both are allowed shapes',
    textLikeACoach('1. Brace\n2. Push the floor\n- Carbs — yes') === '1. Brace\n2. Push the floor\n- Carbs — yes')
  check('a plain reply comes back identical', textLikeACoach("That's the main thing — want the full guide?") === "That's the main thing — want the full guide?")
  check('three blank lines left by a removed header close up to one', textLikeACoach('a\n\n\n\nb') === 'a\n\nb')

  console.log('\n2. What the client reads is never touched')
  const link = '[Watch Barbell Deadlift Tutorial on YouTube](www.youtube.com/results?search_query=barbell+deadlift+tutorial+form)'
  check('a link is left exactly as it was', textLikeACoach(link) === link)
  const chips = 'Want more?\n[QUICK_REPLIES: "Full form guide" | "Got it"]'
  check('the quick-reply tag is left exactly as it was', textLikeACoach(chips) === chips)
  check('[BREAK] and [ACTION: …] are left exactly as they were',
    textLikeACoach('one\n[BREAK]\ntwo\n[ACTION: SWAP_MEAL]') === 'one\n[BREAK]\ntwo\n[ACTION: SWAP_MEAL]')
  check('a single asterisk is not bold and is left alone', textLikeACoach('* one\n2*3 sets') === '* one\n2*3 sets')

  console.log('\n3. The replies the exam actually caught, 25 Sep 2026')
  // FROZEN HERE, not read from coach-exam/transcripts: the next exam run
  // replaces those files, and a fixture that changes under the check is how a
  // check goes quietly vacuous. These are the exact replies, verbatim.
  const caught: string[] = CAUGHT_25_SEP
  check('the fixtures really do carry the markup (so the next check can fail)', caught.filter(r => !noMarkup(r)).length >= 2, caught.map(noMarkup))
  const cleaned = caught.map(textLikeACoach)
  check('...and none survives the formatter', cleaned.every(noMarkup), cleaned.map(c => c.slice(0, 80)))
  check('...while every word does', caught.every((r, i) => r.replace(/[*#]/g, '').replace(/\s+/g, ' ').trim() === cleaned[i].replace(/[*#]/g, '').replace(/\s+/g, ' ').trim()))

  console.log('\n4. The response on its way out')
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Keep': 'yes' } })
  const r1 = await cleanCoachResponse(json({ reply: '**Brace** first', proposal: { kind: 'x' } }))
  const b1 = await r1.json() as { reply: string; proposal?: { kind: string } }
  check('a reply is cleaned, and everything beside it kept', b1.reply === 'Brace first' && b1.proposal?.kind === 'x' && r1.headers.get('X-Keep') === 'yes', b1)
  const r1b = await cleanCoachResponse(json({ reply: '**Slow down** — you have hit today\'s limit.' }, 429))
  check('...and a cleaned reply keeps its status (a limit reply is still a 429)', r1b.status === 429 && (await r1b.json() as { reply: string }).reply.startsWith('Slow down'), r1b.status)
  const r2 = await cleanCoachResponse(json({ error: '**boom**' }, 500))
  const b2 = await r2.json() as { error: string }
  check('an error body is left alone, status and all', r2.status === 500 && b2.error === '**boom**', { status: r2.status, b2 })
  const r3 = await cleanCoachResponse(new Response('plain **text**', { headers: { 'Content-Type': 'text/plain' } }))
  check('a response that is not JSON is left alone', (await r3.text()) === 'plain **text**')

  console.log('\n5. Every reply goes through it')
  const src = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const serves = src.match(/Deno\.serve\(/g) ?? []
  check('there is exactly one Deno.serve', serves.length === 1, serves.length)
  check('...and it hands every response to cleanCoachResponse(', /Deno\.serve\(\s*async\s*\(req[^)]*\)\s*=>\s*cleanCoachResponse\(\s*await\s+handleChatRequest\(req\)\s*\)\s*\)/.test(src))

  console.log(`\ncoach-texting: ${ran} checks ran`)
  if (failures > 0) { console.error(`coach-texting: ${failures} check(s) FAILED`); process.exit(1) }
  console.log('The coach texts: markup is stripped on the way out, and nothing the client reads is touched.')
}
main().catch(e => { console.error('coach-texting crashed:', e); process.exit(1) })
