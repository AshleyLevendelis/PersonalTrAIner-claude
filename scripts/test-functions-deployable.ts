// ---------------------------------------------------------------------------
// Gate: every edge function can actually be deployed.
//
// WHY THIS EXISTS. On 1 Sep 2026 a production deploy of `onboarding-chat`
// failed with:
//
//   Failed to bundle the function (reason: The module's source code could not
//   be parsed: Expected ',', got '{' at .../onboarding-chat/index.ts:10:8
//
// The file had not parsed since `c2a48bb` (30 Aug), because that commit
// inserted a new import INSIDE another import's braces:
//
//   import {
//   import { checkSpendCap, ONBOARDING_CAP } from '../_shared/spend-cap.ts';
//     callsOf,
//     ...
//   } from "./reply-resolver.ts";
//
// TWO DAYS UNDEPLOYABLE, AND NOTHING IN 120 GATES COULD SEE IT. `npx tsc -b`
// covers `src/` only — these are Deno modules with `.ts` import specifiers and
// jsr: URLs, deliberately outside the app's tsconfig. So the one artifact this
// repo hands to a live server had no syntax check of any kind.
//
// WORSE, A GATE SAID IT WAS FINE. `c2a48bb` added a spend cap to all four AI
// functions, and `test:spend-cap` passed the whole time — it scans SOURCE TEXT
// for `checkSpendCap(req, ONBOARDING_CAP, ...)`, and that string is present.
// It is not wrong; it just answers "was this written?" while the question that
// mattered was "can this ship?". The cap was written, gated, committed and
// believed live, and could never once have reached production. A gate that
// reads a file the deployer cannot even parse is the check-satisfied-by-the-
// wrong-thing shape, wearing the compiler's clothes.
//
// So this gate asks the deployer's question, not the reader's: does every file
// parse, and does every import point at something that exists. Those are the
// two ways `supabase functions deploy` refuses a bundle.
// ---------------------------------------------------------------------------

import ts from 'typescript'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FUNCTIONS = join(ROOT, 'supabase/functions')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail, null, 2).slice(0, 900)}` : ''}`) }
}

const files: string[] = []
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.ts')) files.push(p)
  }
}
walk(FUNCTIONS)
files.sort()
const rel = (p: string) => p.replace(FUNCTIONS + '/', '')

console.log('\n1. The sweep sees the real functions')
{
  // A gate that walked the wrong directory would pass by finding nothing.
  // Named deliberately rather than counted: a function deleted from this list
  // should be a decision, not a silent drop in coverage.
  const DEPLOYED = ['chat-gemini', 'generate-meals', 'macro-calibration', 'onboarding-chat']
  const missing = DEPLOYED.filter(fn => !files.includes(join(FUNCTIONS, fn, 'index.ts')))
  check(`all four deployed functions are in the sweep (${files.length} .ts files total)`, missing.length === 0, missing)
  // _shared is bundled INTO each function, so a syntax error there breaks
  // every one of them at once. It has to be in scope.
  check('...and the shared modules they bundle', files.some(f => rel(f).startsWith('_shared/')))
}

console.log('\n2. Every file parses — the check the deployer runs first')
{
  const broken: unknown[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
    // parseDiagnostics is syntax only — no type checking, no module
    // resolution, nothing that would need Deno or the network. Exactly the
    // layer that failed, and the only layer this can honestly assert.
    const diags = (sf as unknown as { parseDiagnostics?: ts.DiagnosticWithLocation[] }).parseDiagnostics ?? []
    if (diags.length === 0) continue
    const d = diags[0]
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start)
    broken.push({
      file: rel(f),
      at: `${line + 1}:${character + 1}`,
      error: ts.flattenDiagnosticMessageText(d.messageText, ' '),
      total: diags.length,
    })
  }
  check(`all ${files.length} edge-function files parse`, broken.length === 0, broken)
}

console.log('\n3. Every relative import points at a file that exists')
{
  // The other way a bundle is refused. A file can parse perfectly and still
  // fail to deploy because it imports `../_shared/thing.ts` that nobody
  // wrote — and again, nothing else here would notice: the app's tsconfig
  // does not compile this directory.
  //
  // Relative specifiers ONLY. `jsr:`, `npm:` and https: URLs are resolved by
  // Deno at deploy time from the network, which this sandbox cannot reach;
  // asserting them would be a check that fails on a correct repo.
  const dangling: unknown[] = []
  let checked = 0
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
    ts.forEachChild(sf, node => {
      const spec = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier : undefined
      if (!spec || !ts.isStringLiteral(spec)) return
      const target = spec.text
      if (!target.startsWith('.')) return
      checked++
      const abs = resolve(dirname(f), target)
      if (!existsSync(abs)) dangling.push({ file: rel(f), imports: target })
    })
  }
  console.log(`      ${checked} relative imports across ${files.length} files`)
  check('the sweep found relative imports at all (sanity check on this check)', checked > 10, checked)
  check('every one resolves to a file on disk', dangling.length === 0, dangling)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nEvery edge function can be bundled.\n')
