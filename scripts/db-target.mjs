// ---------------------------------------------------------------------------
// Which Supabase project a command acts on, and how you're allowed to change
// it. Shared by db-link-prod, db-link-test, db-push-both, deploy-functions
// and test-schema-parity so the two project refs and the confirmation gate
// exist once, not five times.
//
// WHY THIS IS NODE AND NOT BASH. These were `bash scripts/*.sh`. Ashley runs
// Windows PowerShell, where `bash` is not on PATH, so the ONLY sanctioned way
// to reach production could not run on the machine of the only person who
// needs to reach production. It failed with "'bash' is not recognized", the
// link never happened, and the deploy that followed went to TEST while
// looking like it had gone to PRODUCTION. Node is already a hard dependency
// of this repo; bash was an assumption about the developer's shell.
// ---------------------------------------------------------------------------

import { spawnSync } from 'child_process'
import { rmSync } from 'fs'
import { createInterface } from 'readline'

export const PROD_REF = 'sdkhuczcfnqqimdgfiks'
export const TEST_REF = 'vswuurrtbzbrgubddefv'

export const nameOf = (ref) =>
  ref === PROD_REF ? 'PRODUCTION' : ref === TEST_REF ? 'TEST' : ref

// On Windows `npx` is npx.cmd, and since the Node 18.20/20.12 security fix a
// .cmd cannot be spawned without a shell. Everything this file passes as an
// argument is a project ref or a function name, both validated against
// /^[a-z0-9-]+$/ before they get here, so shell:true carries nothing to
// interpolate.
const WIN = process.platform === 'win32'
const SAFE_ARG = /^[a-z0-9-]+$/

/** Run `npx supabase ...`. Returns the exit status; never throws on failure. */
export function supabase(args, { quiet = false } = {}) {
  for (const a of args) {
    if (!SAFE_ARG.test(a) && !a.startsWith('--')) {
      throw new Error(`refusing to pass an unexpected argument to the Supabase CLI: ${a}`)
    }
  }
  const r = spawnSync('npx', ['supabase', ...args], {
    stdio: quiet ? ['inherit', 'ignore', 'ignore'] : 'inherit',
    shell: WIN,
  })
  return r.status ?? 1
}

/** Same, but hands back stdout instead of streaming it. */
export function supabaseCapture(args) {
  const r = spawnSync('npx', ['supabase', ...args], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'ignore'],
    shell: WIN,
  })
  return { status: r.status ?? 1, stdout: r.stdout ?? '' }
}

/**
 * `supabase link` fails with "AlreadyExists: FileSystem.makeDirectory
 * (.../supabase/.temp)" when that directory survives from a prior link --
 * including one the same script did a moment ago. It is a regenerable local
 * cache (project ref, version info), rewritten by every successful link, so
 * clearing it before each link is what makes a two-leg script work on its
 * second leg rather than only its first.
 */
export function clearLinkCache() {
  rmSync('supabase/.temp', { recursive: true, force: true })
}

/** Point the CLI at one project. Exits non-zero if the link fails. */
export function link(ref, { quiet = false } = {}) {
  clearLinkCache()
  const status = supabase(['link', '--project-ref', ref], { quiet })
  if (status !== 0) {
    console.error(`\nFailed to link to ${nameOf(ref)} (${ref}). Nothing was run against it.`)
    process.exit(status)
  }
}

/** Return to the safe default, quietly, on the way out of anything. */
export function relinkTest() {
  clearLinkCache()
  supabase(['link', '--project-ref', TEST_REF], { quiet: true })
}

/**
 * The gate. Typing the phrase is the whole point -- a wrong-target command
 * should cost deliberate effort, not just a missing argument or an old
 * terminal tab. A non-interactive stdin cannot type it, so an unattended
 * runner is refused rather than waved through on a hanging prompt.
 */
export async function confirmProduction() {
  if (!process.stdin.isTTY) {
    console.error(
      "\nThis needs someone to type 'yes-production' at a prompt, and stdin is not a terminal.\n" +
      'Run it from an interactive shell. Nothing was changed.'
    )
    process.exit(1)
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((res) => rl.question("Type 'yes-production' to continue: ", res))
  rl.close()
  return answer.trim() === 'yes-production'
}

/**
 * The Node translation of bash's `trap relink_test EXIT`, and it has to be an
 * exit HANDLER rather than a try/finally: `process.exit()` does not run
 * finally blocks, so a script that bailed out mid-prod-leg would have left
 * the CLI pointed at PRODUCTION -- the precise state these scripts exist to
 * prevent. `process.on('exit')` fires on every path, and spawnSync is
 * synchronous so it still completes inside one.
 */
export function relinkTestOnExit() {
  process.on('exit', relinkTest)
}
