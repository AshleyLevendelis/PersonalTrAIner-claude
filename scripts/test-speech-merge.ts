// ---------------------------------------------------------------------------
// Gate: VOICE TYPING SAYS EACH WORD ONCE (1 Nov 2026).
//
// Ashley's Android phone turned "what is the plan" into "what what is what is what is the what is the
// what is the plan what is": in continuous mode it sends each growing guess at one phrase as its own
// final result, and the hook joined them all. src/lib/speech-merge.ts folds a guess into the one it
// extends. Behaviour here; the screen half is verify:chat-composer.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { mergeSpeechSegments as merge } from '../src/lib/speech-merge'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n1. The Android shape: every guess its own result')
const hers = ['what', 'what is', 'what is', 'what is the', 'what is the', 'what is the plan', 'what is the plan for today']
check('her phrase reads once', merge(hers) === 'what is the plan for today', merge(hers))
check('the OLD join is exactly what she saw (so the fixture is her case)', hers.slice(0, 7).join(' ').startsWith('what what is what is what is the what is the what is the plan'))
check('case and punctuation do not make a new phrase', merge(['What', 'what is', 'What is the plan?']) === 'What is the plan?', merge(['What', 'what is', 'What is the plan?']))
check('a guess the engine took back (shorter) does not come back', merge(['what is the plan', 'what is']) === 'what is the plan', merge(['what is the plan', 'what is']))
check('two phrases, each with its own guesses', merge(['I', 'I did', 'I did legs', 'and', 'and chest']) === 'I did legs and chest', merge(['I', 'I did', 'I did legs', 'and', 'and chest']))

console.log('\n2. The desktop shape: one result per phrase, still joined')
check('separate phrases join with a space', merge(['what is the plan', 'for today']) === 'what is the plan for today', merge(['what is the plan', 'for today']))
check('a word is never read as the start of a longer word', merge(['what', 'whatever works']) === 'what whatever works', merge(['what', 'whatever works']))
check('only the phrase just before is compared: an earlier phrase said again later is kept', merge(['legs', 'then arms', 'legs']) === 'legs then arms legs', merge(['legs', 'then arms', 'legs']))
check('empty and blank results add nothing', merge(['', '  ', 'hello', '']) === 'hello', merge(['', '  ', 'hello', '']))
check('nothing heard is an empty box, not a space', merge([]) === '' && merge(['']) === '')

console.log('\n3. The hook uses it (source-held; the screen proof is verify:chat-composer)')
const hook = strip(readFileSync(new URL('../src/hooks/useSpeechToText.ts', import.meta.url), 'utf8'))
check('the shown text is the merge of the finals and the word still being heard',
  /const combined = mergeSpeechSegments\(\[\.\.\.finalsByIndex\.filter\(Boolean\), interimText\]\)/.test(hook))
check('...and no plain join of the finals is left', !/finalsByIndex\.filter\(Boolean\)\.join\(/.test(hook))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`speech merge: ${failures} check(s) failed`); process.exit(1) }
console.log('speech merge: all checks passed')
