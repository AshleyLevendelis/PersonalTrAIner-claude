// ---------------------------------------------------------------------------
// THE ALLERGY CARD ON PROFILE (his ruling 15 Nov 2026, "Allergy card, peanuts split"). Whole app (app-boot.html),
// real taps. PORT 9955. The row sits above Diet; an allergy is picked, then its taps; the row reads it back in words.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9955, page: 'app-boot.html', name: 'allergy-profile' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btnText = re => `[...document.querySelectorAll('button,[role=menuitem]')].find(b => ${re}.test((b.getAttribute('aria-label') || '').trim()) || ${re}.test(b.textContent.trim()))`
const tid = t => `document.querySelector('[data-testid="${t}"]')`

await go('')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btnText('/^Not now$/')})`)) { await clickAt(btnText('/^Not now$/')); await wait(500) }
await clickAt(btnText('/Profile and settings/')); await wait(600)
await clickAt(btnText('/^Profile$/')); await wait(1200)
const rows = await ev(`[...document.querySelectorAll('[data-profile-row]')].map(r => ({ label: r.getAttribute('data-profile-row'), text: r.innerText.trim(), top: Math.round(r.getBoundingClientRect().top) }))`)
const a = rows.find(r => r.label === 'Allergies'), diet = rows.find(r => r.label === 'Diet')
check('2. Allergies is a row, directly above Diet', !!a && !!diet && a.top < diet.top && rows.indexOf(diet) === rows.indexOf(a) + 1, rows.map(r => r.label))
check('3. it reads "None recorded" to start', /None recorded/.test(a?.text ?? ''), a)
const ROW = `document.querySelector('[data-profile-row="Allergies"]')`
await ev(`(${ROW})?.scrollIntoView({ block: 'center' })`); await wait(400)
await clickAt(ROW); await wait(900)
check('4. the sheet opens with all 14 allergens', (await ev(`document.querySelectorAll('[data-testid^="allergen-"]').length`)) === 14)
check('5. and says what it does and does not do', /filtered, not verified/.test(await ev(`${tid('allergies-editor')}?.innerText`) ?? ''))
await clickAt(tid('allergen-tree-nuts')); await wait(700)
check('6. tapping Tree nuts adds its card', await ev(`!!${tid('allergy-tree-nuts')}`))
await ev(`${tid('pen-yes-tree-nuts')}?.scrollIntoView({ block: 'center' })`); await wait(300)
await clickAt(tid('pen-yes-tree-nuts')); await wait(600)
await ev(`${tid('traces-avoid-tree-nuts')}?.scrollIntoView({ block: 'center' })`); await wait(300)
await clickAt(tid('traces-avoid-tree-nuts')); await wait(600)
const line = await ev(`${tid('allergy-line-tree-nuts')}?.innerText`)
check('7. the card reads it back in words', line === 'Tree nuts · carries an adrenaline pen · avoids traces', line)
check('8. peanuts is NOT switched on by tree nuts', (await ev(`${tid('allergen-peanuts')}?.getAttribute('aria-pressed')`)) === 'false')
check('9. avoiding traces adds the "may contain" line', /may contain/.test(await ev(`${tid('allergy-label-lines')}?.innerText`) ?? ''))
const small = await ev(`[...document.querySelectorAll('[data-testid="allergies-editor"] button')].filter(b => b.getBoundingClientRect().height < 44).length`)
check('10. every tap in the sheet is 44px tall', small === 0, small)
await ev(`${tid('allergy-tree-nuts')}?.scrollIntoView({ block: 'center' })`); await wait(300)
await shoot('allergy-profile-sheet')
const stored = await ev(`JSON.stringify((window.__fakeDb?.fitness_profiles ?? [])[0]?.allergies ?? null)`)
check('11. the record is saved: tree nuts, pen, traces', /"allergen":"tree nuts"/.test(stored ?? '') && /"pen":true/.test(stored ?? '') && /"traces":"avoid"/.test(stored ?? ''), stored)
await clickAt(`document.querySelector('[data-profile-back]')`); await wait(800)
const back = await ev(`document.querySelector('[data-profile-row="Allergies"]')?.innerText`)
check('12. back on Profile the row names it', /Tree nuts/.test(back ?? '') && /adrenaline pen/.test(back ?? ''), back)
await shoot('allergy-profile-row')
await finish('verify:allergy-profile PASSED')
