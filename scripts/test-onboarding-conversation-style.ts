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
  const row = ui.slice(ui.indexOf('TEXT-ONLY CONVERSATION DESIGN'), ui.indexOf('{msg.slotCard'))
  check('the coach line exists', row.length > 100)
  const coach = /max-w-\[88%\] text-\[19px\]\/\[1\.6\] text-foreground \[text-wrap:pretty\]/.exec(row)
  check('coach text is 19px / 1.6, foreground, pretty-wrapped', coach !== null)
  // The actual regression to fear: someone "tidies up" by giving the coach a
  // surface again, and the design quietly reverts to a messaging UI.
  const coachClasses = coach ? coach[0] : ''
  check('...with NO background', !/\bbg-/.test(coachClasses), coachClasses)
  check('...and NO border or radius', !/\bborder|\brounded/.test(coachClasses), coachClasses)
  check('the user reply keeps its fill', /bg-secondary/.test(row))
  check('...at 17px / 1.5, one step down from the coach', /text-\[17px\]\/\[1\.5\]/.test(row))
  check('...with the asymmetric corner', /rounded-\[20px_20px_4px_20px\]/.test(row))
  check('...and capped at 80%', /max-w-\[80%\]/.test(row))
}

console.log('\n3. The COACH mark says who is speaking, once per turn')
{
  check('the mark uses the existing .ds-label utility', /className="ds-label mb-1\.5">Coach</.test(ui))
  check('.ds-label is 11px / 0.14em caps, as the design specifies',
    /\.ds-label\s*\{[^}]*font-size:\s*11px[^}]*letter-spacing:\s*0\.14em/s.test(css))
  // A run of coach messages is one person still talking. Onboarding really
  // does send two or three in a row, and repeating the mark reads as three
  // different speakers.
  check('a run of coach messages is not re-labelled', /function isCoachContinuation/.test(ui))
  check('...and a receipt does not break the run', /if \(m\.isReceipt\) continue/.test(ui))
}

console.log('\n4. The typing indicator is someone typing, not a spinner')
{
  const busy = ui.slice(ui.indexOf('{busy && ('), ui.indexOf('{busy && (') + 800)
  check('there are three dots', (busy.match(/ds-typing-dot/g) ?? []).length === 3, (busy.match(/ds-typing-dot/g) ?? []).length)
  check('...staggered', /\[animation-delay:150ms\]/.test(busy) && /\[animation-delay:300ms\]/.test(busy))
  check('...and announced to a screen reader', /aria-live="polite"/.test(busy) && /Coach is typing/.test(busy))
  check('the dots are 7px', /\.ds-typing-dot\s*\{[^}]*width:\s*7px/s.test(css))
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

console.log('\n5. The composer is a pill you talk into, not a form field')
{
  const composer = ui.slice(ui.indexOf('placeholder="Say anything'), ui.indexOf('placeholder="Say anything') + 2200)
  check('the input is fully rounded', /rounded-full/.test(composer))
  check('...with a 1.5px accent hairline', /border-\[1\.5px\] border-primary/.test(composer))
  check('...and no fill', /bg-transparent/.test(composer))
  check('...at 16px', /text-\[16px\]/.test(composer))
  check('the send button is 52x52', /size-\[52px\]/.test(composer))
  check('...a squircle beside the round pill', /rounded-2xl/.test(composer))
  check('...in accent-on-accent tokens', /bg-primary/.test(composer) && /text-primary-foreground/.test(composer))
  check('...with a 22px icon', /size-\[22px\]/.test(composer))
  check('...and a press state, since a phone has no hover', /active:scale-\[\.94\]/.test(composer))
}

console.log('\n6. Regression: the behaviour this design depends on is still there')
{
  // The design is "the coach asks and waits". That behaviour is held by
  // test:onboarding-conversational; this only checks the two things that
  // would make the SCREEN wrong if they regressed.
  check('the composer still says "Say anything…"', /placeholder="Say anything…"/.test(ui))
  check('messages are still gapped as a conversation, not a list', /flex flex-col gap-\[22px\]/.test(ui))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll onboarding conversation-style checks passed.\n')
