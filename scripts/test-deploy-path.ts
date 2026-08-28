// ---------------------------------------------------------------------------
// Gate for the commands that decide WHICH Supabase project gets written to.
//
// WHY THIS EXISTS. The onboarding voice was deployed to the wrong project
// twice, and each time the deploy printed a confident success line.
//
//   1st  The docs said the CLI's ambient link was PRODUCTION. It is TEST by
//        design. A bare `functions deploy` went to TEST.
//   2nd  `npm run db:link-prod` was `bash scripts/db-link-prod.sh`. Ashley
//        runs Windows PowerShell, where bash is not on PATH, so the ONLY
//        sanctioned route to production could not run on the only machine
//        that needs it. It printed "'bash' is not recognized", the link never
//        happened, and the deploy that followed went to TEST again.
//
// Both are the same defect: a target chosen by AMBIENT STATE, where the step
// that sets the state can fail without stopping the step that uses it. This
// file holds the three properties that fix depends on -- the scripts must be
// runnable on Ashley's shell, production must cost a typed phrase, and the
// CLI must always come back to TEST.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const scripts: Record<string, string> = pkg.scripts
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const PROD_REF = 'sdkhuczcfnqqimdgfiks'
const TEST_REF = 'vswuurrtbzbrgubddefv'

// ---------------------------------------------------------------------------
console.log('\n1. Every npm script runs on Windows PowerShell')
// ---------------------------------------------------------------------------
{
  // THE SECOND WRONG-PROJECT DEPLOY, in one assertion. Node is a hard
  // dependency of this repo; bash is an assumption about the developer's
  // shell, and it was false for the person who owns the app.
  //
  // Git hooks are deliberately NOT covered: git runs those itself, and Git
  // for Windows ships its own bash to run them with. The exposure is npm
  // scripts, which run in whatever shell the user is actually sitting in.
  const shellOut = Object.entries(scripts).filter(([, cmd]) => /(^|\s)(bash|sh)\s|\.sh(\s|$)/.test(cmd))
  check('no npm script shells out to bash or a .sh file', shellOut.length === 0, shellOut)

  // A rename that leaves a dangling entry produces an error message that
  // says nothing about the real problem -- and, for a link script, one that
  // is easy to scroll past on the way to the deploy that follows it.
  const missing: string[] = []
  for (const [name, cmd] of Object.entries(scripts)) {
    for (const m of cmd.matchAll(/(?:^|\s)(scripts\/[\w.-]+)/g)) {
      if (!existsSync(join(ROOT, m[1]))) missing.push(`${name} -> ${m[1]}`)
    }
  }
  check('every script file an npm script names exists', missing.length === 0, missing)

  // The four commands that pick a project, by name. If one of these ever
  // disappears, CLAUDE.md and PROJECT-LOG stop being true.
  for (const s of ['db:link-prod', 'db:link-test', 'db:push-both', 'deploy:functions:prod']) {
    check(`npm run ${s} exists`, typeof scripts[s] === 'string', scripts[s])
  }
}

// ---------------------------------------------------------------------------
console.log('\n2. Reaching production costs a typed phrase')
// ---------------------------------------------------------------------------
{
  const lib = read('scripts/db-target.mjs')
  check("the phrase is 'yes-production'", /answer\.trim\(\) === 'yes-production'/.test(lib))

  // An unattended runner cannot type it, and a prompt that hangs forever in
  // CI eventually gets "fixed" by removing the prompt. Refusing outright is
  // the version of that fix that keeps the gate.
  check('a non-interactive stdin is refused, not waved through',
    /!process\.stdin\.isTTY/.test(lib) && /process\.exit\(1\)/.test(lib))

  // Every route that can write to production asks first.
  for (const f of ['scripts/db-link-prod.mjs', 'scripts/db-push-both.mjs', 'scripts/deploy-functions.mjs']) {
    const src = read(f)
    check(`${f.replace('scripts/', '')} asks before production`,
      /confirmProduction\(\)/.test(src) && /process\.exit\(1\)/.test(src))
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. The CLI always comes back to TEST')
// ---------------------------------------------------------------------------
{
  const lib = read('scripts/db-target.mjs')

  // THE TRANSLATION BUG THIS ALMOST SHIPPED WITH. bash's `trap ... EXIT`
  // fires on every exit path. Its obvious Node equivalent, try/finally, does
  // NOT run when process.exit() is called -- so a script that bailed out
  // mid-production-leg would have left the CLI pointed at the live project,
  // the exact state these scripts exist to prevent.
  check("relink is an exit handler, not a finally", /process\.on\('exit', relinkTest\)/.test(lib))

  for (const f of ['scripts/db-push-both.mjs', 'scripts/deploy-functions.mjs', 'scripts/test-schema-parity.mjs']) {
    const src = read(f)
    check(`${f.replace('scripts/', '')} registers the relink before touching production`,
      /relinkTestOnExit\(\)/.test(src))
    check(`...and does not rely on try/finally for it`, !/finally\s*\{[^}]*relinkTest/.test(src))
  }
}

// ---------------------------------------------------------------------------
console.log('\n4. The deploy is aimed by argument, not by ambient state')
// ---------------------------------------------------------------------------
{
  const src = read('scripts/deploy-functions.mjs')

  // This is what makes the whole class of failure impossible rather than
  // merely unlikely: even if the link silently did nothing, the deploy
  // still names its own target.
  check('functions deploy passes --project-ref explicitly',
    /'functions', 'deploy', f, '--project-ref', target/.test(src))

  // Link and deploy in one command, so the deploy cannot outlive a failed
  // link. The two-step is what broke, twice.
  check('the same command links and deploys', /link\(target\)/.test(src) && /'functions', 'deploy'/.test(src))

  // TEST is what you get if you do not say otherwise.
  check("the default target is TEST", /process\.argv\[2\] === 'prod' \? PROD_REF : TEST_REF/.test(src))

  // Function names reach a shell on Windows. They come from argv.
  const lib = read('scripts/db-target.mjs')
  check('CLI arguments are validated before they reach a shell', /SAFE_ARG = \/\^\[a-z0-9-\]\+\$\//.test(lib))

  // The list offered must be the functions that actually exist, not a list
  // that drifts as functions are added.
  check('the deployable list is read from disk', /readdirSync\('supabase\/functions'/.test(src))
}

// ---------------------------------------------------------------------------
console.log('\n5. Nothing else names the production project')
// ---------------------------------------------------------------------------
{
  // THIS CHECK WAS RESHAPED AFTER IT FIRED, and the reason is worth keeping.
  // It started as "only db-target.mjs holds either literal ref" and went red
  // on five smoke scripts. Reading them showed the check was wrong, not the
  // scripts: every one of those hits is a REFUSAL GUARD --
  //
  //     if (!url!.includes(TEST)) { console.error('Refusing non-TEST URL'); exit }
  //
  // -- a script declining to run anywhere but TEST. A guard that imports its
  // own definition of "safe" is a guard that a bad edit to the shared file
  // can switch off everywhere at once, so those copies are load-bearing.
  // None of them held the PRODUCTION ref.
  //
  // The property that actually matters is narrower and stronger: the live
  // project is nameable in exactly one place, and every other appearance of
  // a ref is a script refusing to leave TEST.
  const strays: string[] = []
  const unguarded: string[] = []
  for (const f of readdirSync(join(ROOT, 'scripts'))) {
    if (!/\.(mjs|ts)$/.test(f) || f === 'db-target.mjs' || f === 'test-deploy-path.ts') continue
    const lines = read(`scripts/${f}`).split('\n')
    lines.forEach((line, i) => {
      if (line.includes(PROD_REF)) strays.push(`${f}:${i + 1}`)
      if (line.includes(TEST_REF)) {
        const context = lines.slice(i, i + 3).join(' ')
        if (!/refus/i.test(context)) unguarded.push(`${f}:${i + 1}`)
      }
    })
  }
  check('no script but db-target.mjs names the PRODUCTION project', strays.length === 0, strays)
  check('every other mention of the TEST ref is a refusal guard', unguarded.length === 0, unguarded)

  const lib = read('scripts/db-target.mjs')
  check('PROD_REF is the production project', lib.includes(`PROD_REF = '${PROD_REF}'`))
  check('TEST_REF is the test project', lib.includes(`TEST_REF = '${TEST_REF}'`))
  check('the two are not the same project', PROD_REF !== TEST_REF)
}

console.log(failures === 0 ? '\nAll deploy-path checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
