/**
 * Gate: sending a message must not take the phone keyboard away, and a
 * scrolling flex child must actually be able to scroll.
 *
 * ROOT INCIDENT, reported from a real phone: "each time I enter an input and
 * hit send the keyboard closes and I have to reopen it for the next message
 * and the conversation is not at the latest message and it cuts off the bottom
 * so I have to scroll down which is incredibly frustrating."
 *
 * Two independent causes, both measured in Chromium against the real
 * onboarding screen before anything was changed (`npm run verify:keyboard`):
 *
 *   1. FOCUS. After tapping send, document.activeElement was <body>. A tap
 *      focuses the button, and emptying the box flips it to `disabled` in the
 *      same tick, so not even the button keeps it. A soft keyboard lives
 *      exactly as long as a text input holds focus.
 *
 *   2. SCROLL. The canvas was `min-h-[100dvh]` and the scroll container was a
 *      flex child with the default min-height:auto — so it grew to fit its
 *      content instead of scrolling inside it. Measured at 390x844: canvas
 *      875px in an 844px viewport, scrollHeight === clientHeight === 799.
 *      Nothing to scroll. Every scrollTo in the auto-scroll block — a block
 *      carrying thirty lines of comment about ResizeObservers and why watching
 *      the message list was wrong — was a no-op, and what actually moved was
 *      the page, parking the newest message 11px under the fixed composer.
 *
 * The browser harness proves the onboarding screen. This file is what stops a
 * THIRD composer repeating either shape, and it is a static check for the
 * reason test-chat-app-reality.ts already gives: the harness can only drive
 * screens it can mount, and it currently cannot mount the main chat.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

/** Strips block and line comments, so a check can never be satisfied by prose ABOUT the thing it looks for. */
const code = (src: string) => src.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const COMPOSERS = [
  { label: 'onboarding', file: 'src/components/onboarding/ConversationalOnboarding.tsx' },
  { label: 'main chat', file: 'src/components/ChatAssistant.tsx' },
]
const sources = COMPOSERS.map(c => ({ ...c, src: code(readFileSync(join(ROOT, c.file), 'utf8')) }))

console.log('\n1. Every composer send button refuses to take focus off the input')
for (const { label, src } of sources) {
  // The send button is found by its icon, not by a class or a test id — those
  // are cosmetic and get rewritten; the Send glyph is what makes it the send
  // button. Its JSX element is everything from the <Button that contains it
  // back to the opening tag.
  const sendIdx = src.indexOf('<Send ')
  check(`${label}: a send button exists (sanity check on this gate)`, sendIdx !== -1)
  if (sendIdx === -1) continue
  const openIdx = src.lastIndexOf('<Button', sendIdx)
  const button = src.slice(openIdx, sendIdx)
  check(`${label}: the send button spreads keepsComposerFocus`,
    button.includes('{...keepsComposerFocus}'), button.slice(0, 200))
  check(`${label}: ...and puts focus back on the composer after sending`,
    /refocusComposer\(/.test(src), label)
}

console.log('\n2. Nothing hand-rolls the guard — one definition, so fixing it once fixes it everywhere')
{
  // code(), not the raw file: this check first went red on its own doc
  // comment, which contains the words "rather than onPointerDown:" — the
  // third time in this repo a check has been satisfied (or broken) by prose
  // ABOUT the thing it looks for rather than the thing itself.
  const helper = code(readFileSync(join(ROOT, 'src/lib/composer-focus.ts'), 'utf8'))
  check('composer-focus.ts prevents default on mousedown, not pointerdown',
    /onMouseDown/.test(helper) && !/onPointerDown:/.test(helper),
    'pointerdown preventDefault can swallow the click on some engines; mousedown is the compat event that assigns focus')
  for (const { label, src } of sources) {
    check(`${label}: does not re-implement the guard beside the shared one`,
      !/onMouseDown=\{[^}]*preventDefault/.test(src), label)
  }
}

console.log('\n3. Every scrolling flex child can actually shrink, so it scrolls instead of growing')
{
  // The exact shape that was measured broken: `flex-1` + `overflow-y-auto`
  // with no min-h-0. A flex item's automatic minimum size is its content, so
  // without this the box grows and the page scrolls instead.
  for (const { label, file } of COMPOSERS) {
    const raw = readFileSync(join(ROOT, file), 'utf8')
    const classAttrs = [...raw.matchAll(/className="([^"]*)"/g)].map(m => m[1])
    const offenders = classAttrs.filter(c =>
      /\bflex-1\b/.test(c) && /\boverflow-y-auto\b/.test(c) && !/\bmin-h-0\b/.test(c))
    check(`${label}: no flex-1 + overflow-y-auto without min-h-0`, offenders.length === 0, offenders)
  }
}

console.log('\n4. The onboarding canvas is a fixed height, not a minimum one')
{
  const raw = readFileSync(join(ROOT, COMPOSERS[0].file), 'utf8')
  check('the canvas is h-[100dvh], not min-h-[100dvh]',
    /className="h-\[100dvh\][^"]*ob-canvas"/.test(raw),
    raw.match(/className="[^"]*ob-canvas"/)?.[0])
  check('...and clips its own overflow so the page cannot scroll behind the composer',
    /className="h-\[100dvh\] overflow-hidden/.test(raw))
}

console.log('\n5. The input is still soft-disabled, never hard-disabled — the fix that came first')
{
  const raw = readFileSync(join(ROOT, COMPOSERS[0].file), 'utf8')
  const inputIdx = raw.indexOf('<Input')
  const input = raw.slice(inputIdx, raw.indexOf('/>', inputIdx))
  check('the onboarding input uses readOnly while busy', /readOnly=\{busy\}/.test(input))
  check('...and is never `disabled`, which would dismiss the keyboard',
    !/\sdisabled=\{/.test(input), input.slice(0, 200))
}

console.log('\n6. The chat harness still reproduces the container App.tsx actually uses')
{
  // .tour-harness/chat.tsx COPIES App.tsx's shell so the measurement means
  // something: ChatAssistant's Card is a fixed h-[600px] while its composer is
  // fixed to the VIEWPORT, so whether they collide depends entirely on where
  // App.tsx's <main> padding puts the card. Measuring inside a different
  // wrapper answers a question about the harness — which this repo has now
  // done twice (a harness page with no viewport meta reporting a composer at
  // top: 2029px, and real.tsx measuring a panel it never passed a handler to).
  //
  // A copy that drifts is worse than no copy, so the two are pinned together.
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  const harness = readFileSync(join(ROOT, '.tour-harness/chat.tsx'), 'utf8')
  const mainClass = app.match(/<main className="([^"]+)"/)?.[1]
  check('App.tsx has a <main> wrapper to copy (sanity check on this gate)', !!mainClass, mainClass)
  check('the harness reproduces it verbatim',
    !!mainClass && harness.includes(`<main className="${mainClass}"`),
    { app: mainClass, harnessHasIt: !!mainClass && harness.includes(mainClass) })

  const shellClass = app.match(/<div className="(min-h-screen bg-background)">/)?.[1]
  check('...and the shell around it', !!shellClass && harness.includes(shellClass), shellClass)

  // The harness is worthless if it mounts a stub. real.tsx's chat tab was one
  // for exactly as long as nobody measured the chat.
  check('the harness mounts the real ChatAssistant, not a stand-in',
    /<ChatAssistant\b/.test(harness))
  check('...and seeds the thread through the real cache key',
    harness.includes('chat_history_cache_'),
    'the first attempt used fitplan_chat_cache_ and a { messages } wrapper, so the chat restored NOTHING and the harness measured an empty thread')
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll composer-focus checks passed.\n')
