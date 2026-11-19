// ---------------------------------------------------------------------------
// A SENTENCE TYPED INTO A FOOD LIST BOX (18 Nov 2026, the full pass). The real Profile screen (profile.html). PORT 9965.
//
// "I don't eat mushrooms" typed into Foods to avoid was saved as a food called "i don t eat mushrooms", a row that
// left nothing out. Here: the sentence becomes the food; words the box cannot read are said under it and kept in it,
// never saved; and each box reads only its own way of saying it ("I love pizza" under Foods to avoid adds nothing).
// The database is read from window.__fakeDb.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9965, page: 'profile.html', name: 'food-list-box' })
const { ev, check, until, wait, go, clickAt, shoot, finish, send } = d
const row = k => `document.querySelector('[data-profile-row=${JSON.stringify(k)}]')`
const tid = t => `document.querySelector('[data-testid="${t}"]')`
const enter = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}
const type = async (box, text) => { await clickAt(tid(box)); await wait(150); await send('Input.insertText', { text }); await wait(200); await enter(); await wait(1300) }
const facts = polarity => ev(`(window.__fakeDb?.user_facts ?? []).filter(f => f.kind === 'food_preference' && f.polarity === ${JSON.stringify(polarity)} && f.status !== 'deleted' && !f.retired_at).map(f => f.raw_phrase)`)
const note = () => ev(`(() => { const n = ${tid('food-list-unread')}; if (!n) return null; const r = n.getBoundingClientRect(); return { text: n.innerText, top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight } })()`)
const boxValue = box => ev(`${tid(box)}?.value ?? null`)

await go('')
check('1. Profile is up', (await until(() => ev(`!!${row('Foods to avoid')}`), v => v === true, 80)) === true)
await clickAt(row('Foods to avoid')); await wait(900)
check('2. the Foods to avoid box is there', (await ev(`!!${tid('food-avoid-input')}`)) === true)
const before = await facts('dislike')

await type('food-avoid-input', "I don't eat mushrooms")
const a1 = await facts('dislike')
check('3. "I don\'t eat mushrooms" is saved as the food mushrooms', a1.includes('mushrooms') && !a1.some(f => /don|eat/.test(f)), a1)
check('4. ...with nothing said about unread words, and the box emptied', (await note()) === null && (await boxValue('food-avoid-input')) === '', { note: await note(), box: await boxValue('food-avoid-input') })

await type('food-avoid-input', 'I love pizza')
const a2 = await facts('dislike')
const n2 = await note()
check('5. "I love pizza" under Foods to avoid adds nothing', a2.length === a1.length && !a2.some(f => /pizza/.test(f)), a2)
check('6. ...the box says it could not read it, quoting the words', !!n2 && n2.text.includes('"I love pizza"') && /nothing was added/.test(n2.text), n2)
check('7. ...where he can see it, and his words are still in the box', !!n2 && n2.top >= 0 && n2.bottom <= n2.h && (await boxValue('food-avoid-input')) === 'I love pizza', { n2, box: await boxValue('food-avoid-input') })
await shoot('food-list-box-unread')

// Clear the box, then a mixed entry: the readable food is added, the rest stays.
await ev(`(() => { const el = ${tid('food-avoid-input')}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })()`); await wait(200)
await type('food-avoid-input', 'no pork, I am vegetarian')
const a3 = await facts('dislike')
check('8. "no pork, I am vegetarian": pork is added and the diet is not saved as a food', a3.includes('pork') && !a3.some(f => /vegetarian/.test(f)), a3)
check('9. ...the unread half is said and left in the box', /I am vegetarian/.test((await note())?.text ?? '') && (await boxValue('food-avoid-input')) === 'I am vegetarian', { note: await note(), box: await boxValue('food-avoid-input') })
check('10. nothing that was there before was lost', before.every(f => a3.includes(f)), { before, a3 })

await clickAt(`document.querySelector('[data-profile-back]')`); await wait(700)
await clickAt(row('Foods you like')); await wait(900)
const l0 = await facts('like')
await type('food-like-input', 'I love pizza')
const l1 = await facts('like')
check('11. "I love pizza" under Foods you like is the like pizza', l1.includes('pizza') && !l1.some(f => /love/.test(f)), l1)
await type('food-like-input', "I don't eat prawns")
const l2 = await facts('like')
check('12. "I don\'t eat prawns" under Foods you like adds nothing and says so', l2.length === l1.length && /"I don't eat prawns"/.test((await note())?.text ?? ''), { l2, note: await note() })
check('13. ...and it did not become a food to avoid behind his back either', !(await facts('dislike')).some(f => /prawn/.test(f)), await facts('dislike'))
check('14. the like added is one more than before', l1.length === l0.length + 1, { l0, l1 })
await finish('A sentence typed into a food box is read as the food; what cannot be read is said and kept, never saved.')
