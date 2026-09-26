/**
 * test:chat-page — the two halves of the full-page chat (design 2a, 26 Sep
 * 2026) that no harness page can render, because both live in App.tsx and no
 * harness boots App. Everything ON the chat screen is measured in a real
 * browser by verify:chat-bubbles and verify:chat-shell; this holds only:
 *
 *   1. App hides its floating settings gear while the chat is the open tab,
 *      so the gear never shows twice (the chat's header carries it).
 *   2. App hands that same menu to the chat's header — the REAL ProfileMenu
 *      with App's own handlers, not a second implementation.
 *
 * Source checks, so they can prove the wiring exists and not that it is
 * reached; the harness renders the menu in the header and verify:chat-bubbles
 * measures it there.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const app = strip(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))

console.log('full-page chat — the App.tsx half')

// The floating gear is the element carrying data-tour="settings".
const at = app.indexOf('data-tour="settings"')
const gearOpen = at < 0 ? '' : app.slice(app.lastIndexOf('<div', at), app.indexOf('>', app.indexOf('style=', at)) + 1)
check('the floating settings gear is still there for every other tab (and for the tour)', at >= 0 && /<ProfileMenu\b/.test(app.slice(at, at + 1200)), at)
check('...and it is hidden while the chat is the open tab', /activeTab\s*===\s*'chat'\s*\?\s*'hidden'/.test(gearOpen), gearOpen.slice(0, 240))

const chatAt = app.indexOf('<ChatAssistant')
const chatProps = chatAt < 0 ? '' : app.slice(chatAt, app.indexOf('/>\n            </Suspense>', chatAt))
const header = chatProps.match(/headerAction=\{\s*<ProfileMenu([\s\S]*?)\/>\s*\}/)
check('App hands the chat\'s header the real ProfileMenu', !!header, chatProps.slice(-400))
check('...with App\'s own handlers: opening Profile and replaying the tour', !!header && /onOpenProfile=\{/.test(header[1]) && /setProfileInfoOpen\(true\)/.test(header[1]) && /onReplayTour=\{replayAppTour\}/.test(header[1]), header?.[1])

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
console.log('full-page chat: all checks passed')
