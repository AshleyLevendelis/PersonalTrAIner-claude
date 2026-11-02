// ---------------------------------------------------------------------------
// "LEAVE IT AS IT IS" LEAVES HER ON PROFILE (1 Nov 2026, whole-app test). The rebuild offer opens over Profile in its
// own portal; declining it read as a tap outside Profile, which shut, and she landed on Home. Only the whole app has
// both (app-boot.html). A real tap: the offer is raised by changing session length, as she would. PORT 9545.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9545, page: 'app-boot.html', name: 'profile-rebuild-decline' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btnText = re => `[...document.querySelectorAll('button,[role=menuitem]')].find(b => ${re}.test((b.getAttribute('aria-label') || '').trim()) || ${re}.test(b.textContent.trim()))`
const profileOpen = () => ev(`!!document.querySelector('[data-profile-page]')`)
const offer = () => ev(`[...document.querySelectorAll('[role=dialog]')].find(x => /Rebuild your sessions around the time you have/.test(x.innerText)) ? true : false`)

await go('')
check('1. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btnText('/^Not now$/')})`)) { await clickAt(btnText('/^Not now$/')); await wait(500) }
await clickAt(btnText('/Profile and settings/')); await wait(600)
await clickAt(btnText('/^Profile$/')); await wait(1200)
check('2. Profile is open', (await profileOpen()) === true)
await clickAt(`[...document.querySelectorAll('[data-profile-page] button')].find(b => b.textContent.trim().startsWith('Schedule'))`); await wait(900)
await clickAt(`[...document.querySelectorAll('[data-profile-page] button,[data-profile-page] [role=combobox]')].find(b => /^\\d+(-\\d+)? min$/.test(b.textContent.trim()))`); await wait(600)
await clickAt(`[...document.querySelectorAll('[role=option]')].find(o => o.textContent.trim().startsWith('30'))`); await wait(1500)
check('3. a shorter session raises the rebuild offer, over Profile', (await offer()) === true && (await profileOpen()) === true)
await shoot('profile-rebuild-decline-offer')
await clickAt(btnText('/^Leave it as it is$/')); await wait(1000)
check('4. "Leave it as it is" closes the offer', (await offer()) === false)
check('5. ...and she is still on Profile, where she was', (await profileOpen()) === true)
await shoot('profile-rebuild-decline-after')
await finish('verify:profile-rebuild-decline PASSED')
