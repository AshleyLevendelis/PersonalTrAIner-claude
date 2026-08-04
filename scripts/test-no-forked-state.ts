/**
 * P1 gate — grep-level checks against LAYOUT-DESIGN.md's no-fork invariants
 * (§7 F1: "a phase may not add a new owner for a fact without deleting the
 * old declaration in the same commit").
 *
 * These are regression guards, not aspirational future-state checks: every
 * rule here asserts something that is TRUE at the end of THIS phase. Rules
 * that only become true in a later phase (e.g. getLastSessionSets down to
 * one call site once SetLogger is deleted in P2) are scoped to what P1
 * actually ships, with a comment noting when they tighten.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

function grepFiles(pattern: RegExp): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = []
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, 'utf-8').split('\n')
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        hits.push({ file: relative(ROOT, file), line: i + 1, text: line.trim() })
      }
    })
  }
  return hits
}

function main() {
  console.log('[1] setCurrentWeek / setLiveWeek do not exist outside the hook')
  // The old currentWeek setState setter is gone entirely — replaced by
  // browseWeek (view-local, ExercisePlan.tsx) and the hook's read-only
  // liveWeek (D8: no component may move the live week). Neither name
  // should ever reappear anywhere in src/.
  const weekSetterHits = grepFiles(/\bset(CurrentWeek|LiveWeek)\b/)
  check('no setCurrentWeek/setLiveWeek anywhere in src/', weekSetterHits.length === 0, weekSetterHits)

  console.log('\n[2] no bare `new Date()` in the session-identity files this phase owns')
  // Scoped to the files P1 actually built/modified for session identity —
  // NOT a blanket repo-wide ban (most of the app predates this round and
  // is untouched by it). `new Date(x)` constructing from an existing
  // timestamp is fine; only the zero-arg "read the real wall clock" form
  // is the hazard dev-clock.ts's doc comment warns about.
  const sessionIdentityFiles = [
    'src/components/ExercisePlan.tsx',
    'src/components/BottomDock.tsx',
    'src/hooks/useActiveSession.tsx',
    'src/lib/app-route.ts',
    'src/lib/active-session-store.ts',
    'src/lib/session-derive.ts',
  ]
  for (const relPath of sessionIdentityFiles) {
    const full = join(ROOT, relPath)
    const lines = readFileSync(full, 'utf-8').split('\n')
    const hits = lines
      .map((text, i) => ({ text, line: i + 1 }))
      .filter(({ text }) => /new Date\(\s*\)/.test(text))
    check(`${relPath} has no bare new Date()`, hits.length === 0, hits)
  }

  console.log('\n[3] getLastSessionSets: at most 2 call sites in component/hook code (P1 baseline)')
  // P1 baseline is 2 (SetLogger's ghost fetch + the bulk-log fallback,
  // both still inside ExercisePlan.tsx — ghosts don't move into the hook
  // until P2 deletes SetLogger in the same commit, per F1). This asserts
  // the count doesn't grow, not that it's already down to the P2/P3 target
  // of one.
  const ghostCallSites = grepFiles(/getLastSessionSets\(/).filter(h =>
    /\.(tsx)$/.test(h.file) || h.file.includes('hooks/')
  )
  check(
    `getLastSessionSets has <=2 call sites in components/hooks (found ${ghostCallSites.length})`,
    ghostCallSites.length <= 2,
    ghostCallSites,
  )

  console.log('\n[4] subscribeSyncState has exactly one consumer: OfflineStatusIndicator')
  // Excludes the export declaration itself (set-log-store.ts) — only CALL
  // sites (`subscribeSyncState(someListener)`) count.
  const syncStateCalls = grepFiles(/subscribeSyncState\(/).filter(h => !/export function/.test(h.text))
  const nonIndicator = syncStateCalls.filter(h => !h.file.endsWith('OfflineStatusIndicator.tsx'))
  check('no subscribeSyncState call outside OfflineStatusIndicator.tsx', nonIndicator.length === 0, nonIndicator)
  check('OfflineStatusIndicator.tsx does call subscribeSyncState', syncStateCalls.length > nonIndicator.length)

  console.log('\n[5] DevTestPanel has exactly one mount site')
  const devTestPanelMounts = grepFiles(/<DevTestPanel\b/)
  check('exactly one <DevTestPanel mount', devTestPanelMounts.length === 1, devTestPanelMounts)

  console.log('\n[6] no "custom:" exercise-id namespace has been introduced')
  // §3b of the prior draft proposed a `custom:` id prefix for free-text
  // lifts; the critique found it would orphan ghosts/PRs/off-plan
  // detection for every previously-logged custom exercise. Rejected —
  // custom lifts keep using getExerciseId(name) like everything else.
  const customPrefixHits = grepFiles(/['"]custom:['"]/)
  check('no literal "custom:" id prefix anywhere in src/', customPrefixHits.length === 0, customPrefixHits)

  console.log('\n[7] RestTimer.tsx is gone — BottomDock is the only rest-timer UI')
  // Only import/JSX usage counts — explanatory comments referencing the
  // old component by name for historical context are fine and expected.
  const restTimerUsage = grepFiles(/(from\s+['"].*RestTimer['"]|<RestTimer\b)/)
  check('no import or JSX usage of RestTimer', restTimerUsage.length === 0, restTimerUsage)

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll no-forked-state checks passed.')
}

main()
