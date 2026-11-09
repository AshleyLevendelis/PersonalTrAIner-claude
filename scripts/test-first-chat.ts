// ---------------------------------------------------------------------------
// test:first-chat — QA round 3 (8 Nov 2026): the chat's first words, and the one-change preview.
//
//   1. A first chat is no chat rows AND nothing trained. A chat cleared in week 2 was welcomed aboard.
//   2. The chat asks that question when it loads, of the tables that hold training, by the right owner column.
//   3. The welcome's session is read off the week each date is in, never week 1 (`exercisePlan`).
//   4. The one-change preview wraps; it never cuts the thing it is changing to "M…".
// verify:chat-cleared drives 1-3 on a real screen. Every check runs every time.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

async function main() {
  const { isFirstChat } = await import('../src/lib/first-run-intro')

  console.log('\n1. What a first chat is')
  check('no rows, nothing trained: a first chat', isFirstChat(0, 0) === true)
  check('no rows after training (a cleared chat): not a first chat', isFirstChat(0, 1) === false)
  check('rows and nothing trained: not a first chat', isFirstChat(3, 0) === false)
  check('a training count that could not be read: not a first chat (the returning opener still speaks)', isFirstChat(0, null) === false)
  check('a chat count that could not be read: not a first chat', isFirstChat(null, 0) === false && isFirstChat(undefined, 0) === false)

  console.log('\n2. The chat asks it when it loads')
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const load = chat.slice(chat.indexOf("from('chat_messages')"), chat.indexOf('setHistoryLoaded(true)', chat.indexOf("from('chat_messages')")) + 30)
  check('the first-chat flag is set by isFirstChat with the chat count and the training count',
    /setIsFirstEverChat\(isFirstChat\(count \?\? 0, trainingRows\)\)/.test(load), load.slice(-500))
  check('...and nothing else sets it true from the chat count alone', !/setIsFirstEverChat\(\(count \?\? 0\) === 0\)/.test(chat))
  check('training is counted from sessions (by profile_id) and cardio (by user_id)',
    /from\('workout_sessions'\)\.select\('id', head\)\.eq\('profile_id', profile\.id\)/.test(load) && /from\('cardio_logs'\)\.select\('id', head\)\.eq\('user_id', profile\.id\)/.test(load), load.slice(0, 1600))
  check('...a failed count reads as unknown, never as zero', /trainingRows = sessions\.error \|\| cardio\.error \? null :/.test(load))

  console.log('\n3. The welcome names the week each date is in')
  const brief = chat.slice(chat.indexOf('const firstRunSessionBrief'), chat.indexOf('for (let ahead = 1', chat.indexOf('const firstRunSessionBrief')))
  check('each date is looked up in its own week of the plan', /getActiveMesocycleWeek\(planCreatedAt \?\? profile\.created_at, d, weeks\)/.test(brief) && /const sessionOn = \(d: Date\) => daysOf\(d\)\.find/.test(brief), brief.slice(-700))
  check('...not read off week 1', !/exercisePlan\.find\(x => x\.day === nameOfDay/.test(brief))

  console.log('\n4. The one-change preview wraps')
  const card = strip(readFileSync('src/components/chat/ProposalCard.tsx', 'utf8'))
  const preview = card.slice(card.indexOf('data-testid="offer-preview"'), card.indexOf('</p>', card.indexOf('data-testid="offer-preview"')))
  check('the preview block was found', preview.length > 100 && /preview\.to/.test(preview), preview.length)
  check('neither half is truncated', !/\btruncate\b/.test(preview), preview)
  check('...both wrap their words, and the line wraps', (preview.match(/break-words/g) ?? []).length === 2 && /flex-wrap/.test(preview), preview)

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('A cleared chat is not a new account, the welcome reads the live week, and the preview never cuts its words.')
}
main().catch(e => { console.error(e); process.exit(1) })
