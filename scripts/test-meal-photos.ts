// PHOTOS OF A MEAL, A MENU OR A LABEL (17 Nov 2026, the chat review; his ruling "Read it, then discard"). Held here:
//   1. a photo is sent with ONE message and kept nowhere: not in the chat (the line says one was sent), not stored;
//   2. on a photo turn, a sentence calling a food safe or free of an allergen is taken out and the app's line said;
//   3. the server passes only a jpeg/png/webp under the cap, for that turn only, and tells the coach the rules.
import { readFileSync } from 'node:fs'
import { withoutPhotoAllergenClaims, PHOTO_ALLERGEN_LINE, PHOTO_MIME } from '../src/lib/photo-safety'
import { photoMessageText, scaledSize, PHOTO_DEFAULT_ASK } from '../src/lib/photo-prepare'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail).slice(0, 300)})` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('1. Sent once, kept nowhere')
check('the chat keeps a line saying a photo was sent, never the photo', photoMessageText('how many calories?') === '[Photo] how many calories?' && photoMessageText('') === `[Photo] ${PHOTO_DEFAULT_ASK}`)
check('the photo is shrunk to 1024px on its longest side, never enlarged', JSON.stringify(scaledSize(4000, 3000)) === JSON.stringify({ w: 1024, h: 768 }) && JSON.stringify(scaledSize(800, 600)) === JSON.stringify({ w: 800, h: 600 }))
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
check('the chat sends it with the one message and clears it after', /\.\.\.\(sendingPhotoRef\.current \? \{ image: sendingPhotoRef\.current \} : \{\}\)/.test(chat) && /signal: controller\.signal,\s*\}\)\s*sendingPhotoRef\.current = null/.test(chat))
check('...and drops the attached photo the moment it is sent', /sendingPhotoRef\.current = photo\s*setPhoto\(null\)/.test(chat))
check('nothing in the chat stores the photo (no upload, no storage bucket)', !/storage\.from\(|\.upload\(/.test(chat))

console.log('\n2. A photo never makes a food allergy-safe')
const said = 'That looks like a chicken satay. It looks completely nut-free. About 450 kcal.'
const fixed = withoutPhotoAllergenClaims(said)
check('"it looks completely nut-free" is taken out', !/nut-free/.test(fixed.reply) && fixed.removed === 1, fixed)
check('...the rest of the reply stays', /chicken satay/.test(fixed.reply) && /450 kcal/.test(fixed.reply), fixed.reply)
check('...and the app\'s line is said', fixed.reply.endsWith(PHOTO_ALLERGEN_LINE), fixed.reply)
check('"this should be safe to eat" is taken out too', withoutPhotoAllergenClaims('This should be safe to eat.').removed === 1)
check('"I can\'t tell if it\'s gluten-free" is honest and stays', withoutPhotoAllergenClaims("I can't tell if it's gluten-free from here.").removed === 0)
check('a reply with no claim passes untouched', withoutPhotoAllergenClaims(said.replace(' It looks completely nut-free.', '')).removed === 0)

console.log('\n3. The server: one turn, the right files, the rules')
const server = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
check('only jpeg, png or webp', PHOTO_MIME.test('image/jpeg') && PHOTO_MIME.test('image/webp') && !PHOTO_MIME.test('image/gif') && !PHOTO_MIME.test('application/pdf'))
check('the photo goes in this turn\'s message only', /parts: photo \? \[\{ inlineData: photo \}, \{ text: message \}\] : \[\{ text: message \}\]/.test(server))
check('every reply on a photo turn passes the allergy net', /\?\.image \? await withoutPhotoClaims\(guarded\) : guarded/.test(server))
check('the coach is told: estimate and say so, log only when asked, never call a food safe from a photo', /THIS MESSAGE CAME WITH A PHOTO/.test(server) && /NEVER say from a photo that a food is safe/.test(server) && /log it with log_meal only if he says he ate it or asks you to/.test(server))
check('the coach\'s copy of the net is the app\'s, kept in step', readFileSync('supabase/functions/_shared/photo-safety.ts', 'utf8').includes(PHOTO_ALLERGEN_LINE))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('A photo is read once, estimated honestly, and never called allergy-safe.')
