// ---------------------------------------------------------------------------
// HOME SAYS WHAT TODAY IS (2 Nov 2026, the UX pass, item 5 "the coach knows where you are"; whole-app test §4).
// The test found Home calling a day the plan names "Active Recovery + Cardio" a plain "Rest day", offering
// "Adjust today" on a day with no session to adjust, a weight change printed as a bare "-0.4", and Profile showing
// 79.55 kg where Home showed 79.5. The whole app (app-boot.html), each case set up by an INPUT only:
//   1. the default page: today (Wednesday) is the plan's "Active Recovery + Cardio".
//   2. ?no-cardio: she avoids cardio, so today is a plain rest day with no plan entry.
//   3. ?weigh=79.55: yesterday's weigh-in has two decimals.
// PORT 9563.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9563, page: 'app-boot.html', name: 'home-day-named' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const named = re => `[...document.querySelectorAll('button,[role=menuitem]')].find(b => ${re}.test((b.getAttribute('aria-label') || '').trim()) || ${re}.test(b.textContent.trim()))`
const hero = () => ev(`(() => { const h = document.querySelector('[data-home-hero]'); if (!h) return null; const t = h.querySelector('[data-home-title]'); return { status: h.getAttribute('data-home-hero'), title: t?.textContent.trim() ?? null, sub: t?.nextElementSibling?.textContent.trim() ?? null } })()`)
const chips = () => ev(`[...document.querySelectorAll('[data-home-page] button')].map(b => b.textContent.trim()).filter(t => t === 'What changed?' || t === 'Adjust today')`)
const up = async query => {
  // A FRESH PHONE EACH TIME: the app keeps a copy of the last plan on the phone and draws it first (boot-cache), so a
  // page loaded after another would show the previous page's plan. The fixture re-stamps whose phone this is.
  await ev(`(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })()`)
  await go(query)
  const ok = (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]') && !!document.querySelector('[data-home-hero] [data-home-title]')`), v => v === true, 120)) === true
  await wait(1500)
  if (await ev(`!!(${named('/^Not now$/')})`)) { await clickAt(named('/^Not now$/')); await wait(500) }
  return ok
}

// --- 1. Active recovery -------------------------------------------------------------------------------------------
check('1a. the app is up, today active recovery', await up(''))
const ar = await hero()
check('1b. today is a rest status on Home (no lifting; the case binds)', ar?.status === 'rest', ar)
check('1c. ...and is named as the plan names it, never "Rest day"', ar?.title === 'Active Recovery + Cardio', ar)
check('1d. ...with its cardio in the plan\'s words underneath', /Active Recovery Walk or Light Swim/.test(ar?.sub ?? '') && /\d+ min/.test(ar?.sub ?? ''), ar?.sub)
const arChips = await chips()
check('1e. the coach note offers "What changed?" (a note is on screen, so the next check binds)', arChips.includes('What changed?'), arChips)
check('1f. ...and "Adjust today" too: there is a session to adjust', arChips.includes('Adjust today'), arChips)
await shoot('home-day-named-recovery')

// --- 2. A plain rest day ------------------------------------------------------------------------------------------
check('2a. the app is up, a plain rest day', await up('&no-cardio=1'))
const rest = await hero()
check('2b. the plain rest day is still called "Rest day"', rest?.status === 'rest' && rest?.title === 'Rest day' && rest?.sub === 'Recovery is part of the program', rest)
const restChips = await chips()
check('2c. the coach note is on screen ("What changed?")', restChips.includes('What changed?'), restChips)
check('2d. ...and offers no "Adjust today": nothing to adjust', !restChips.includes('Adjust today'), restChips)
await shoot('home-day-named-rest')

// --- 3. The weight, on Home and on Profile ------------------------------------------------------------------------
check('3a. the app is up, weighed 79.55 yesterday', await up('&weigh=79.55'))
await clickAt(`document.querySelector('[data-home-progress-toggle]')`); await wait(700)
const delta = await ev(`(() => { const u = document.querySelector('[data-testid="home-weight-delta-unit"]'); if (!u) return null; const r = u.getBoundingClientRect(); const cs = getComputedStyle(u); return { line: u.parentElement.textContent.replace(/since you started/, '').trim(), shown: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !u.closest('.sr-only') } })()`)
check('3b. the weight change carries its unit, on screen (not only for a screen reader)', delta?.shown === true && /^[+−-]?\d+\.\d kg$/.test(delta?.line ?? ''), delta)
const homeKg = await ev(`(document.querySelector('[data-home-progress-toggle]')?.textContent.match(/(\\d+\\.\\d) kg/) || [])[1] ?? null`)
check('3c. Home shows the weigh-in to one decimal', homeKg === '79.5' || homeKg === '79.6', homeKg)
await shoot('home-day-named-weight')
await clickAt(named('/Profile and settings/')); await wait(600)
await clickAt(named('/^Profile$/')); await wait(1500)
const rowKg = await ev(`(([...document.querySelectorAll('[data-profile-page] button')].find(b => b.textContent.trim().startsWith('Height & weight'))?.textContent ?? '').match(/(\\d+(?:\\.\\d+)?) kg/) || [])[1] ?? null`)
check('3d. Profile\'s row shows the same weight Home does, to one decimal', rowKg === homeKg, { rowKg, homeKg })
await clickAt(`[...document.querySelectorAll('[data-profile-page] button')].find(b => b.textContent.trim().startsWith('Height & weight'))`); await wait(900)
const profKg = await ev(`document.querySelector('[data-testid="profile-current-weight"]')?.textContent.trim() ?? null`)
check('3e. ...and so does "Current weight" inside it', profKg === `${homeKg} kg`, { profKg, homeKg })
await shoot('home-day-named-profile')

await finish('verify:home-day-named PASSED')
