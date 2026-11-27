// ---------------------------------------------------------------------------
// THE FIVE THEMES (27 Nov 2026). Ashley: "keep the Nightshift theme, replace the other themes with the purplish
// background with red, purple, blue or green accents", and from two mock-ups, "B: each leans". Whole app
// (app-boot.html), real taps: Profile, Appearance shows exactly Nightshift, Ruby, Amethyst, Sapphire and Emerald, with
// no Dark/Light split and no "Match system" (every theme is dark); tapping a card repaints the APP, not only the card,
// and the choice survives a reload; a phone that saved a retired theme opens on its new one. PORT 9991.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9991, page: 'app-boot.html', name: 'appearance-themes' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btnText = re => `[...document.querySelectorAll('button,[role=menuitem]')].find(b => ${re}.test((b.getAttribute('aria-label') || '').trim()) || ${re}.test(b.textContent.trim()))`
const CANVAS = `getComputedStyle(document.body).backgroundColor`

async function openAppearance() {
  check('the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
  await wait(1500)
  if (await ev(`!!(${btnText('/^Not now$/')})`)) { await clickAt(btnText('/^Not now$/')); await wait(500) }
  await clickAt(btnText('/Profile and settings/')); await wait(600)
  await clickAt(btnText('/^Profile$/')); await wait(1200)
  const ROW = `[...document.querySelectorAll('[data-profile-page] button')].find(b => b.textContent.trim().startsWith('Appearance'))`
  await ev(`(${ROW})?.scrollIntoView({ block: 'end' })`); await wait(400)
  await clickAt(ROW); await wait(900)
}
// The theme cards are the buttons whose name and subtitle both sit inside them (a card draws "<Name>" and "a · b").
const CARDS = `[...document.querySelectorAll('[data-profile-sheet] button[aria-pressed]')].filter(b => / · /.test(b.textContent) && b.querySelector('span.rounded-md'))`

await go('')
await openAppearance()
const cards = await ev(`${CARDS}.map(b => b.querySelector('span span')?.textContent.trim())`)
check('1. Appearance shows exactly the five themes, Nightshift first, then red, purple, blue, green',
  JSON.stringify(cards) === JSON.stringify(['Nightshift', 'Ruby', 'Amethyst', 'Sapphire', 'Emerald']), cards)
// Element by element: the sheet's whole text runs words together ("LightNightshift"), which a word match cannot see.
const labels = await ev(`[...document.querySelectorAll('[data-profile-sheet] *')].map(n => n.textContent.trim()).filter(t => /^(Dark|Light)$|Match system/.test(t))`)
check('2. ...with no "Match system" and no Dark / Light rows (every theme is dark)', Array.isArray(labels) && labels.length === 0, labels)
check('3. Nightshift is the one chosen by default', (await ev(`${CARDS}.find(b => b.getAttribute('aria-pressed') === 'true')?.textContent`) ?? '').startsWith('Nightshift'))
const before = await ev(CANVAS)
await ev(`${CARDS}[0].scrollIntoView({ block: 'center' })`); await wait(300)
await shoot('appearance-themes-nightshift')

await clickAt(`${CARDS}.find(b => b.textContent.startsWith('Ruby'))`); await wait(600)
const ruby = await ev(`({ theme: document.documentElement.getAttribute('data-theme'), canvas: ${CANVAS}, pressed: ${CARDS}.find(b => b.getAttribute('aria-pressed') === 'true')?.textContent ?? '' })`)
check('4. tapping Ruby repaints the app (its page colour is #1E1430), not only the card',
  ruby.theme === 'ruby' && ruby.canvas === 'rgb(30, 20, 48)' && ruby.canvas !== before && ruby.pressed.startsWith('Ruby'), { ruby, before })
await shoot('appearance-themes-ruby')

await clickAt(`${CARDS}.find(b => b.textContent.startsWith('Emerald'))`); await wait(600)
check('5. ...and Emerald paints its own (#151B34)', (await ev(CANVAS)) === 'rgb(21, 27, 52)', await ev(CANVAS))
await shoot('appearance-themes-emerald')

// 6-7. THE CHOICE IS KEPT, AND A RETIRED ONE MOVES. Read off which card the sheet marks after a reload: this harness page
// does not run main.tsx, whose first line paints the saved theme (applyAppearance(getAppearance())), so the page colour
// after a reload here would measure the harness. The sheet reads the same record through the same getAppearance.
const pressedAfterReload = async () => { await go(''); await openAppearance(); return (await ev(`${CARDS}.find(b => b.getAttribute('aria-pressed') === 'true')?.textContent ?? ''`)) }
check('6. the choice survives a reload (Emerald is still the one chosen)', (await pressedAfterReload()).startsWith('Emerald'))
await ev(`localStorage.setItem('fitplan_appearance_v2', JSON.stringify({ glow: 'full', theme: 'midnight', accent: 'theme' }))`)
const moved = await pressedAfterReload()
check('7. a phone that saved the retired Midnight opens on Sapphire', moved.startsWith('Sapphire'), moved)

await ev(`localStorage.removeItem('fitplan_appearance_v2')`)
await finish('verify:appearance-themes PASSED')
