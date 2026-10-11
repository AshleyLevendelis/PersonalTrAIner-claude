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

/**
 * The rendered size of a `text-[...]` class, in px at the browser's 16px
 * default root — so the design number stays readable here whichever unit the
 * source uses.
 *
 * Sizes moved from px to rem for accessibility (audit §11): px ignores the
 * reader's OS text-size setting, rem follows it. The DESIGN did not change —
 * 19px is still 19px at default — so this gate keeps asserting 19, and stops
 * asserting the spelling.
 */
function renderedPx(classes: string): number | null {
  const m = /text-\[([0-9.]+)(px|rem)\]/.exec(classes)
  if (!m) return null
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])
}

console.log('\n2. One question per screen (design handoff 2e, 10 Oct 2026)')
{
  // The question is the screen: the last sentence that asks, set large, with
  // what came before it small above. Earlier turns are not drawn — except a
  // card still waiting for an answer, which holds the screen open.
  const q = /data-onboarding-question/.test(ui) ? ui.slice(ui.lastIndexOf('className={`ob-message-in font-bold', ui.indexOf('data-onboarding-question')), ui.indexOf('data-onboarding-question') + 40) : ''
  check('the question exists', q.length > 40)
  check('...set at 28px / 1.12, bold, tight, glowing, pretty-wrapped',
    /font-bold tracking-\[-\.03em\] text-foreground glow-text \[text-wrap:pretty\]/.test(q) && /text-\[1\.75rem\]\/\[1\.12\]/.test(q))
  check('...stepping down to 20px for a long one rather than filling the screen', /\.length > 120 \? 'text-\[1\.25rem\]\/\[1\.3\]'/.test(q))
  check('...and still no surface: the coach is not in a bubble', !/\bbg-|\bborder|\brounded/.test(q))
  check('the question is the LAST SENTENCE THAT ASKS, from one shared splitter', /splitQuestion\(msg\.content\)/.test(ui))
  check('earlier turns are not drawn', /messages\.map\(\(msg, i\) => i < turnStart \? null :/.test(ui))
  check('...but an open card holds the screen open', /const turnStart = oldestLiveCard >= 0 && oldestLiveCard <= lastUserIdx \? oldestLiveCard : lastUserIdx \+ 1/.test(ui))

  // Her reply: on the right, small and quiet, in the AI-role violet (a token,
  // so it follows the theme), with the asymmetric corner and a 78% cap.
  check('her reply is the answer bubble', /ob-user-bubble ml-auto w-fit max-w-\[78%\]/.test(ui))
  check('...from the AI-role accent token, not a pasted colour',
    /\.ob-user-bubble\s*\{[^}]*color-mix\(in srgb, var\(--role-ai-accent\) 22%, transparent\)/s.test(css))
  check('...with the asymmetric corner', /\.ob-user-bubble\s*\{[^}]*border-radius:\s*16px 16px 4px 16px/s.test(css))
  check('...at 13.5px in the tertiary ink', /\.ob-user-bubble\s*\{[^}]*font-size:\s*0\.84375rem[^}]*color:\s*var\(--text-tertiary\)/s.test(css))
}

console.log('\n3. The header says who is asking, where she is, and offers Skip only where it may')
{
  check('no per-message COACH label remains', !/ds-label mb-1\.5">Coach</.test(ui))
  check('...and its run-suppression helper went with it', !/isCoachContinuation/.test(ui))
  const header = ui.slice(ui.lastIndexOf('{/*', ui.indexOf('THE COACH HEADER (design handoff 2e')), ui.indexOf('The base pb-28'))
  check('the header exists', header.length > 200)
  check('...with the 34px gradient disc', /ob-coach-avatar size-\[34px\]/.test(header))
  // Her ruling: "Personal TrAIner" everywhere, over the brief's "Your coach".
  check('...named "Your Personal TrAIner", her ruling over the brief\'s "Your coach"', /Your Personal TrAIner/.test(header) && !/Your coach/.test(header.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')))
  // 2e DRAWS A COUNT ("Training · 3 of 17"), reversing v2's no-visible-count
  // choice; the brief is hers. The count is the tracked set readyToGenerate
  // waits on, so it ends where setup ends.
  check('...and where she is: "{Section} · n of N"', /\{sectionLabel\} · \{stepNow\} of \{requiredCount\}/.test(header))
  check('six ticks', /const PROGRESS_TICKS = 6/.test(ui) && /grid grid-cols-6/.test(header))
  check('...done, now and to come', /'done' : i === doneTicks \? 'now' : 'next'/.test(header))
  check('...and the real numbers still reach a screen reader',
    /role="progressbar"/.test(header) && /aria-valuenow=\{answeredCount\}/.test(header))
  // SKIP IS THE OLD "PREFER NOT TO SAY", MOVED: only a single-choice or number
  // question the plan does not need. Never a multi-select (injuries and diet
  // record "none" through their own Next).
  check('Skip shows only when there is something it may skip', /\{skipKeys\.length > 0 && !busy && \(/.test(header) && /onClick=\{\(\) => handleDecline\(skipKeys\)\}/.test(header))
  check('...decided by canDeclineSlot', /canDeclineSlot\(d, values\)/.test(ui))
  check('...for single-choice and number questions only', /def\.control !== 'single' && def\.control !== 'numeric'\)\) return \[\]/.test(ui))
  const cards = readFileSync(join(ROOT, 'src/components/onboarding/SlotChipsCard.tsx'), 'utf8') + readFileSync(join(ROOT, 'src/components/onboarding/SlotNumericCard.tsx'), 'utf8')
  check('...moved, not copied: the cards no longer carry their own decline', !/Prefer not to say<\/|onDecline\(/.test(cards.replace(/\/\/.*$/gm, '')))
}

console.log('\n4. The typing indicator is someone typing, not a spinner')
{
  const busy = ui.slice(ui.indexOf('{busy && ('), ui.indexOf('{busy && (') + 800)
  check('there are three dots', (busy.match(/ds-typing-dot/g) ?? []).length === 3, (busy.match(/ds-typing-dot/g) ?? []).length)
  check('...staggered', /\[animation-delay:150ms\]/.test(busy) && /\[animation-delay:300ms\]/.test(busy))
  // "Coach is typing" until 6 Sep 2026 — renamed with every other UI string
  // that named the assistant. The requirement is the announcement, not the noun.
  check('...and announced to a screen reader', /aria-live="polite"/.test(busy) && /Personal TrAIner is typing/.test(busy))
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
  // 16px is not a taste choice: iOS Safari zooms the whole page when a focused
  // input's text is smaller, so anything under it makes the composer jump.
  const composerSize = /text-\[[0-9.]+(?:px|rem)\]/.exec(composer)
  check('...at 16px, the size below which iOS zooms the page on focus',
    composerSize !== null && renderedPx(composerSize[0]) === 16, composerSize?.[0])

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
  check('the turn is gapped, not a run-on list', /max-w-md w-full mx-auto flex flex-col gap-4 pt-6/.test(ui))
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
