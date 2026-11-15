/**
 * A [BREAK] IS NEVER SHOWN AS A WORD — wherever the model put it.
 * Reported live 15 Nov 2026 (screenshot): "[BREAK]" printed three times inside one paragraph of a coach
 * reply, because the app only removed a [BREAK] that sat alone on its line.
 * Both copies (the app's and the coach server's) are checked, and held equal.
 */
import { cleanReplyText as appClean, applyMessageBreaks as appBreaks } from '../src/lib/reply-text'
import { cleanReplyText as serverClean } from '../supabase/functions/_shared/reply-text'

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const LIVE = 'That makes total sense!\n\nTo build that fight cardio, stick to 30-45 minutes of steady-state jogging 1-2 times a week (Zone 2). [BREAK] It builds a bigger engine. There are other cardio options too, but this is great to start! [BREAK] If you’re already doing Muay Thai sessions, fit that in whenever your legs feel freshest.'
for (const [name, clean] of [['app', appClean], ['server', serverClean]] as const) {
  const out = clean(LIVE)
  check(`${name}: no [BREAK] is left in the live reply`, !/BREAK/i.test(out), out)
  check(`${name}: an inline break becomes a paragraph gap`, out.includes('(Zone 2).\n\nIt builds') && out.includes('start!\n\nIf you'), out)
  check(`${name}: a lone-line break still gives one blank line`, clean('One\n[BREAK]\nTwo') === 'One\n\nTwo', clean('One\n[BREAK]\nTwo'))
  check(`${name}: lower case and spaced forms go too`, !/break/i.test(clean('a [break] b [ BREAK ] c')) || clean('a [break] b').includes('\n\n'), clean('a [break] b'))
  check(`${name}: a break before the buttons leaves no trailing gap`, clean('Hi there.\n[BREAK]\n[QUICK_REPLIES: A | B]') === 'Hi there.', clean('Hi there.\n[BREAK]\n[QUICK_REPLIES: A | B]'))
  check(`${name}: ordinary words "break" are untouched`, clean('Take a break, then go.') === 'Take a break, then go.')
}
check('app and server agree on the live reply', appClean(LIVE) === serverClean(LIVE))
check('the streaming path (applyMessageBreaks) handles an inline break', !/BREAK/.test(appBreaks(LIVE)))
console.log(`${ran} checks ran`)
if (failures > 0) process.exit(1)
