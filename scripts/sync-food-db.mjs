// ---------------------------------------------------------------------------
// ONE FOOD DATABASE. This script is how the coach gets its copy.
//
// The app reads src/lib/food-db.ts. The coach (the chat-gemini edge function)
// runs on Deno and cannot import across the src/lib boundary, so it has its
// own file at supabase/functions/_shared/food-db.ts. For six weeks that file
// was "kept in sync by hand", and it was not: on 9 Oct 2026 it was 9 foods
// short and missing the 1 Sep fix that stops "2 eggs" being read as two grams
// of egg, while a 9 Sep fix had gone into IT and never reached the app. Two
// typed-in meals were logged at a quarter of their real calories because the
// coach and the screen were reading different databases.
//
// So the coach's copy is no longer written by anyone. It is this script's
// output: the app's file, byte for byte, under a header saying so.
//
//   npm run sync:food-db           write the coach's copy
//   node scripts/sync-food-db.mjs --check    exit 1 if it is stale (no write)
//
// test:food-db-parity fails while the copy is stale, and the deploy script
// refuses to ship one. Edit src/lib/food-db.ts, run sync, commit both.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const FOOD_DB_SOURCE = 'src/lib/food-db.ts'
export const FOOD_DB_EDGE_COPY = 'supabase/functions/_shared/food-db.ts'

const HEADER = `// ===========================================================================
// GENERATED FILE — DO NOT EDIT.
//
// This is ${FOOD_DB_SOURCE}, copied here by scripts/sync-food-db.mjs so the
// chat-gemini edge function (Deno, which cannot import from src/) reads the
// SAME food database the app does. Change the source, then run:
//
//     npm run sync:food-db
//
// A hand edit here is overwritten by the next sync, and test:food-db-parity
// fails for as long as this file differs from what the script would write.
// ===========================================================================

`

/**
 * What makes the source unusable on Deno. The edge runtime resolves imports
 * differently from the app's bundler and has no Node globals, so the source
 * must stay a self-contained module: no imports at all, nothing Node-only.
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

/** The exact text the coach's copy should hold for a given source text. */
export function renderEdgeFoodDb(source) {
  return HEADER + source
}

/** { fresh, expected, actual, problems } for the tree on disk. */
export function foodDbSyncState(root = ROOT) {
  const source = readFileSync(join(root, FOOD_DB_SOURCE), 'utf8')
  const expected = renderEdgeFoodDb(source)
  let actual = ''
  try { actual = readFileSync(join(root, FOOD_DB_EDGE_COPY), 'utf8') } catch { /* missing reads as stale */ }
  return { fresh: actual === expected, expected, actual, problems: denoProblems(source) }
}

// Run as a command (not when a gate imports it for the functions above).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const state = foodDbSyncState()
  if (state.problems.length > 0) {
    console.error(`${FOOD_DB_SOURCE} cannot run on Deno: ${state.problems.join('; ')}.`)
    process.exit(1)
  }
  if (process.argv.includes('--check')) {
    if (!state.fresh) {
      console.error(`${FOOD_DB_EDGE_COPY} is STALE: it is not what ${FOOD_DB_SOURCE} generates.`)
      console.error('Run: npm run sync:food-db   (then commit both files)')
      process.exit(1)
    }
    console.log(`${FOOD_DB_EDGE_COPY} is up to date.`)
  } else if (state.fresh) {
    console.log(`${FOOD_DB_EDGE_COPY} already up to date.`)
  } else {
    writeFileSync(join(ROOT, FOOD_DB_EDGE_COPY), state.expected)
    console.log(`Wrote ${FOOD_DB_EDGE_COPY} from ${FOOD_DB_SOURCE}.`)
  }
}
