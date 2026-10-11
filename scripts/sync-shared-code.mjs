// ---------------------------------------------------------------------------
// CODE THE APP AND THE COACH MUST AGREE ON IS WRITTEN ONCE. This script is how
// the coach gets its copy.
//
// The app reads src/lib/. The coach (the chat-gemini edge function) runs on
// Deno and cannot import across the src/lib boundary, so anything both need
// has a second file under supabase/functions/_shared/. For six weeks the food
// database's second file was "kept in sync by hand", and it was not: on 9 Oct
// 2026 it was 9 foods short and missing the 1 Sep fix that stops "2 eggs"
// being read as two grams of egg, while a 9 Sep fix had gone into IT and never
// reached the app. Two typed-in meals were logged at a quarter of their real
// calories because the coach and the screen were reading different databases.
//
// So the coach's copies are no longer written by anyone. Each is this script's
// output: the app's file, byte for byte, under a header saying so.
//
//   npm run sync:shared                        write the coach's copies
//   node scripts/sync-shared-code.mjs --check  exit 1 if any is stale (no write)
//
// test:food-db-parity fails while a copy is stale, and the deploy script
// refuses to ship one. Edit the file in src/lib, run sync, commit both.
//
// TO SHARE ANOTHER FILE: it must have no imports at all (see denoProblems),
// then add one line to SHARED_FILES.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** source (the one a person edits) -> copy (generated, for the edge functions). */
export const SHARED_FILES = [
  { source: 'src/lib/food-db.ts', copy: 'supabase/functions/_shared/food-db.ts' },
  { source: 'src/lib/weigh-in-check.ts', copy: 'supabase/functions/_shared/weigh-in-check.ts' },
]

const header = (source) => `// ===========================================================================
// GENERATED FILE — DO NOT EDIT.
//
// This is ${source}, copied here by scripts/sync-shared-code.mjs so the edge
// functions (Deno, which cannot import from src/) run the SAME code the app
// does. Change the source, then run:
//
//     npm run sync:shared
//
// A hand edit here is overwritten by the next sync, and test:food-db-parity
// fails for as long as this file differs from what the script would write.
// ===========================================================================

`

/**
 * What makes a source unusable on Deno. The edge runtime resolves imports
 * differently from the app's bundler and has no Node globals, so a shared
 * source must stay a self-contained module: no imports at all, nothing
 * Node-only.
 */
export function denoProblems(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const problems = []
  if (/^\s*import\s/m.test(code) || /\bimport\s*\(/.test(code)) problems.push('it has an import (the coach\'s copy must be self-contained)')
  if (/\brequire\s*\(/.test(code)) problems.push('it calls require()')
  if (/\bprocess\./.test(code)) problems.push('it reads process.* (Node only)')
  if (/\bimport\.meta\.env\b/.test(code)) problems.push('it reads import.meta.env (the app bundler only)')
  return problems
}

/** The exact text a copy should hold for a given source path and its text. */
export function renderSharedCopy(sourcePath, sourceText) {
  return header(sourcePath) + sourceText
}

/** One { source, copy, fresh, expected, actual, problems } per shared file, for the tree on disk. */
export function sharedSyncStates(root = ROOT) {
  return SHARED_FILES.map(({ source, copy }) => {
    const text = readFileSync(join(root, source), 'utf8')
    const expected = renderSharedCopy(source, text)
    let actual = ''
    try { actual = readFileSync(join(root, copy), 'utf8') } catch { /* missing reads as stale */ }
    return { source, copy, fresh: actual === expected, expected, actual, problems: denoProblems(text) }
  })
}

// Run as a command (not when a gate imports it for the functions above).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const states = sharedSyncStates()
  const checkOnly = process.argv.includes('--check')
  let failed = false
  for (const state of states) {
    if (state.problems.length > 0) {
      console.error(`${state.source} cannot run on Deno: ${state.problems.join('; ')}.`)
      failed = true
    } else if (checkOnly) {
      if (state.fresh) console.log(`${state.copy} is up to date.`)
      else { console.error(`${state.copy} is STALE: it is not what ${state.source} generates. Run: npm run sync:shared (then commit both files)`); failed = true }
    } else if (state.fresh) {
      console.log(`${state.copy} already up to date.`)
    } else {
      writeFileSync(join(ROOT, state.copy), state.expected)
      console.log(`Wrote ${state.copy} from ${state.source}.`)
    }
  }
  if (failed) process.exit(1)
}
