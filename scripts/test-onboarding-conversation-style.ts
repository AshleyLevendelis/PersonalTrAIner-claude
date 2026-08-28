/**
 * Gate for the text-only onboarding conversation design.
 *
 * The design's whole idea is that the coach STOPS looking like a chat app:
 * plain large text on the canvas under a small COACH mark, with only the user
 * getting a fill. Two bubbles facing each other read as messaging furniture;
 * one voice reading as a person and one as a reply is what makes it feel like
 * being talked to.
 *
 * The check with the most teeth is the hex one. The handoff is explicit —
 * "never hard-code hex — the app has 4 themes x accent overrides" — and a hex
 * here is the perfect silent bug: it looks right in Nightshift (whose values
 * the design was drawn from) and is wrong in the other three, on a screen
 * nobody re-opens once they have a plan.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) console.log(`  ok: ${label}`)
  else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

const ui = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')

console.log('\n1. Every colour is a token, so all four themes still work')
{
  // The design was drawn in Nightshift. A hex lifted from it looks perfect
  // there and wrong in Ember, Field and Graphite — and --primary is an accent
  // override on top, so even the mint is not a constant.
  const hexes = [...ui.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0])
  check('no hard-coded hex anywhere in the onboarding screen', hexes.length === 0, hexes)
  const themes = [...css.matchAll(/^\[data-theme="([a-z]+)"\]/gm)].map(m => m[1])
  check('...and there really are multiple themes to break', themes.length >= 4, themes)
  check('--primary is an accent override, not a fixed value',
    /--primary:\s*var\(--theme-primary\)/.test(css))
}

console.log('\n2. The coach is not in a bubble')
{
  const row = ui.slice(ui.indexOf('TEXT-ONLY CONVERSATION, v2.'), ui.indexOf('{msg.slotCard'))
  check('the coach line exists', row.length > 100)
  const coach = /max-w-\[88%\] text-\[19px\]\/\[1\.6\] text-foreground \[text-wrap:pretty\]/.exec(row)
  check('coach text is 19px / 1.6, foreground, pretty-wrapped', coach !== null)
  // The actual regression to fear: someone "tidies up" by giving the coach a
  // surface again, and the design quietly reverts to a messaging UI.
  const coachClasses = coach ? coach[0] : ''
  check('...with NO background', !/\bbg-/.test(coachClasses), coachClasses)
  check('...and NO border or radius', !/\bborder|\brounded/.test(coachClasses), coachClasses)
  // v2 moved the fill into a class so the gradient could be token-derived.
  // Still --secondary underneath, which is what keeps it right in all four
  // themes rather than only in the one it was drawn in.
  check('the user reply keeps its fill', /ob-user-bubble/.test(row))
  check('...still built from --secondary, not a pasted gradient',
    /\.ob-user-bubble\s*\{[^}]*var\(--secondary\)/s.test(css))
  check('...with the mint hairline derived from the accent',
    /\.ob-user-bubble\s*\{[^}]*rgba\(var\(--glow-rgb\), \.18\)/s.test(css))
  check('...at 17px / 1.5, one step down from the coach', /text-\[17px\]\/\[1\.5\]/.test(row))
  check('...with the asymmetric corner', /rounded-\[20px_20px_4px_20px\]/.test(row))
  check('...and capped at 80%', /max-w-\[80%\]/.test(row))
}

console.log('\n3. v2 — a header says who is talking, once and permanently')
{
  // v1 stamped a COACH label above every coach line, and the run-suppression
  // that needed was itself a workaround. v2 states identity once in a header,
  // so the label is gone entirely — asserted, because re-adding it would put
  // the same words on screen twice.
  check('no per-message COACH label remains', !/ds-label mb-1\.5">Coach</.test(ui))
  check('...and its run-suppression helper went with it', !/isCoachContinuation/.test(ui))

  const header = ui.slice(ui.indexOf('v2 COACH HEADER'), ui.indexOf('The base pb-28'))
  check('the header exists', header.length > 200)
  check('...with the pulsing avatar', /ob-coach-avatar/.test(header))
  check('...carrying the brand name', /Personal TrAIner/.test(header))
  check('...and what it is currently doing', /Building your plan/.test(header))

  // Progress ticks, NOT a step counter — "12 of 18" is the scorekeeping this
  // whole redesign removes. But a screen reader still needs the real numbers,
  // which is how the old invisible bar was fixed once already.
  check('progress is ticks', /ob-tick/.test(header))
  check('...four of them', /const PROGRESS_TICKS = 4/.test(ui))
  // Scoped to RENDERED text: the progressbar's aria-valuenow legitimately
  // carries answeredCount, and matching the bare word flagged that. What must
  // not appear is a count the eye can read.
  check('...with no visible count',
    !/>\s*\{answeredCount\}|\{answeredCount\}\s*(of|\/)|of \{requiredCount\}/.test(header))
  check('...but the real numbers still reach a screen reader',
    /role="progressbar"/.test(header) && /aria-valuenow=\{answeredCount\}/.test(header))
}

console.log('\n4. The typing indicator is someone typing, not a spinner')
{
  const busy = ui.slice(ui.indexOf('{busy && ('), ui.indexOf('{busy && (') + 800)
  check('there are three dots', (busy.match(/ds-typing-dot/g) ?? []).length === 3, (busy.match(/ds-typing-dot/g) ?? []).length)
  check('...staggered', /\[animation-delay:150ms\]/.test(busy) && /\[animation-delay:300ms\]/.test(busy))
  check('...and announced to a screen reader', /aria-live="polite"/.test(busy) && /Coach is typing/.test(busy))
  check('the dots are 7px', /\.ds-typing-dot\s*\{[^}]*width:\s*7px/s.test(css))
  // v2: mint, not grey. Grey reads as the app buffering; the accent says the
  // coach specifically is composing.
  check('v2 — the dots are mint, not muted grey',
    /\.ds-typing-dot\s*\{[^}]*background:\s*var\(--primary\)/s.test(css))
  check('the lift is 3px, not a cartoon bounce', /@keyframes dsTypingDot[\s\S]{0,200}translateY\(-3px\)/.test(css))
  check('the loop is 1.2s', /animation:\s*dsTypingDot 1\.2s/.test(css))
  // Motion, not decoration: --glow-strength must not be able to switch it off,
  // and reduced motion must leave the dots VISIBLE rather than removing the
  // only sign the app is working.
  // Scoped to the keyframe's OWN body: an unbounded window here just runs
  // into the next @keyframes block (which legitimately uses --glow-strength)
  // and reports a problem that isn't there. This gate's first run did exactly
  // that.
  const kf = /@keyframes dsTypingDot\s*\{([\s\S]*?)\n\}/.exec(css)
  check('the keyframe exists', kf !== null)
  check('it is not wired to the glow system — motion must not be switchable off',
    kf !== null && !/--glow-strength/.test(kf[1]))
  check('reduced motion stops the movement but keeps the dots',
    /prefers-reduced-motion[\s\S]{0,120}\.ds-typing-dot\s*\{\s*animation:\s*none;\s*opacity/.test(css))
}

console.log('\n5. v2 — the composer')
{
  // To the END OF THE FILE, not a fixed character count. This was
  // `+ 3400`, and adding five lines of comment inside the composer pushed
  // `size-[22px]` outside the window and turned a passing check red with the
  // markup unchanged — a gate that fails on comment length is measuring the
  // wrong thing. The composer is the last element in the component, so
  // end-of-file is its real boundary; the review card that check 135 must not
  // see sits ABOVE it, so this stays correctly scoped.
  const composer = ui.slice(ui.indexOf('ob-composer-fade'))
  check('it sits on a fade-up of the canvas, not a hard rule', /ob-composer-fade/.test(ui))
  // Scoped to the composer: the review card legitimately still uses that
  // border on its own paragraphs, and an unscoped check flagged those.
  check('...and the old hard rule is gone from it', !/border-t border-border\/40/.test(composer))
  check('the input is a filled pill', /ob-input/.test(composer) && /rounded-full/.test(composer))
  check('...neutral at rest, mint on focus — so the accent means "you are here"',
    /\.ob-input\s*\{[^}]*border:\s*1\.5px solid var\(--border\)/s.test(css) &&
    /\.ob-input:focus\s*\{\s*border-color:\s*var\(--primary\)/.test(css))
  check('...at 16px', /text-\[16px\]/.test(composer))

  check('the send button is a 52px CIRCLE', /size-\[52px\]/.test(composer) && /rounded-full/.test(composer))
  check('...with a 22px icon', /size-\[22px\]/.test(composer))
  check('...and a .92 press state', /active:scale-\[\.92\]/.test(composer))
  // The disabled state is the point: it is the only feedback that Enter will
  // do nothing on an empty box.
  check('it is dim until there is something to send', /canSend\s*$|\{canSend/m.test(composer))
  check('...lighting up in accent-on-accent when there is',
    /bg-primary text-primary-foreground/.test(composer))
  check('...and is genuinely disabled, not just dim', /disabled=\{!canSend\}/.test(composer))
}

console.log('\n5b. v2 — the placeholder follows the question')
{
  check('the placeholder is derived, not hard-coded', /placeholder=\{pendingHint\}/.test(ui))
  check('...from the slot the coach is waiting on', /const pendingHint = /.test(ui))
  check('...falling back honestly when nothing is pending', /\?\? 'Say anything…'/.test(ui))
  const slots = readFileSync(join(ROOT, 'src/lib/onboarding-slots.ts'), 'utf8')
  check('slots own their own hint', /inputHint\?: string/.test(slots))
  const hints = (slots.match(/inputHint: '/g) ?? []).length
  check('...and enough of them carry one to matter', hints >= 15, hints)
  // A hint that names the slot instead of the answer would put the form's
  // vocabulary back on screen, which is what this redesign removes.
  const named = [...slots.matchAll(/inputHint: '([^']*)'/g)].map(m => m[1])
  check('no hint reads like a field label', !named.some(h => /^[A-Z][a-z]+:$/.test(h)), named.slice(0, 3))
}

console.log('\n6. Regression: the behaviour this design depends on is still there')
{
  // The design is "the coach asks and waits". That behaviour is held by
  // test:onboarding-conversational; this only checks the two things that
  // would make the SCREEN wrong if they regressed.
  check('"Say anything…" survives as the honest fallback', /\?\? 'Say anything…'/.test(ui))
  check('messages are still gapped as a conversation, not a list', /flex flex-col gap-\[22px\]/.test(ui))
  check('v2 — messages animate in', /ob-message-in/.test(ui) && /@keyframes obMessageIn/.test(css))
  check('...and reduced motion turns that off too',
    /prefers-reduced-motion[\s\S]{0,200}\.ob-message-in\s*\{\s*animation:\s*none/.test(css))
  check('the avatar pulse respects the glow setting',
    /@keyframes obCoachPulse[\s\S]{0,300}--glow-strength/.test(css))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll onboarding conversation-style checks passed.\n')
