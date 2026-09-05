/**
 * Chat-prompt app-reality drift gate — keeps chat-gemini's §1a-i screen/
 * feature list in lockstep with the app's actual routes so a renamed/added/
 * removed tab can't silently leave the coach describing a UI that no longer
 * exists (or missing one that now does). Root incident: the coach invented
 * "Subscription"/"Billing" screens and a "Social" tab that never existed —
 * root cause was the system prompt carrying zero grounding in the real tab
 * list at all. §1a-i fixed that with a hand-written list; this gate is what
 * keeps that list honest as app-route.ts changes, the same static-text-check
 * approach test-diet-tag-sync.ts already uses for the same reason (a Deno
 * edge function can't import across the src/lib boundary, so a shared
 * import isn't available — this is the next-best thing to "cannot drift").
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

/** Extracts the text between two `=== HEADING ===` markers (exclusive of the next heading), matching this prompt's own section-delimiter convention. */
function extractSection(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  if (start === -1) throw new Error(`section "${startMarker}" not found`)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (end === -1) throw new Error(`section "${startMarker}" never closes before "${endMarker}"`)
  return source.slice(start, end)
}

async function main() {
  const { TABS } = await import('../src/lib/app-route')
  const chatGeminiSrc = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf-8')
  const appRealityBlock = extractSection(
    chatGeminiSrc,
    '=== 1a-i. APP REALITY',
    '=== 1a. ANSWER WHAT WAS ASKED',
  )

  console.log('[1] Every real tab (app-route.ts TABS) is named in §1a-i, so a renamed/added tab cannot go silently ungrounded')
  check('TABS is non-empty (sanity check on the gate itself)', TABS.length > 0, TABS)
  for (const tab of TABS) {
    const capitalized = tab.charAt(0).toUpperCase() + tab.slice(1)
    check(`§1a-i mentions "${capitalized}"`, appRealityBlock.includes(capitalized))
  }

  // -------------------------------------------------------------------------
  // [1b] EVERY CAPABILITY CLAIM IS TIED TO THE CODE THAT PROVIDES IT.
  //
  // Added 5 Sep 2026, and the reason is the whole point of this gate. §1a-i
  // said "Dashboard: … water logging, step-count logging …" for WEEKS after
  // both moved off the Dashboard — and every check in this file stayed GREEN,
  // because they only ever asserted that a tab was NAMED. Meanwhile
  // test:tab-ownership was asserting, correctly, that Home logs neither. Two
  // gates, two contradictory pictures of one app, both passing.
  //
  // The cost is not abstract: §1a-i opens "This is the complete, current list.
  // Nothing outside it exists", so the coach confidently sent people to a tab
  // that had no logger on it.
  //
  // Same fix as test-app-tour.ts's: tie the claim to the source fact, so the
  // NEXT time a control moves, the gate moves with it or goes red.
  // -------------------------------------------------------------------------
  console.log('\n[1b] A capability §1a-i claims for a tab is provided by that tab')
  {
    const bulletFor = (tab: string) => {
      const m = appRealityBlock.match(new RegExp(`^- ${tab}:.*$`, 'm'))
      return m ? m[0] : ''
    }
    const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf-8')
    // Each row: the writer that PROVES the capability, and where it lives now.
    const CAPABILITIES: { label: string; claim: RegExp; writer: RegExp; file: string; tab: string }[] = [
      {
        label: 'step logging', claim: /step[- ]count logging/i, writer: /logStepsManual/,
        file: 'src/components/exercise/StepsRow.tsx', tab: 'Exercise',
      },
      {
        label: 'water logging', claim: /water logging/i, writer: /logWater\b/,
        file: 'src/components/NutritionDisplay.tsx', tab: 'Nutrition',
      },
    ]
    for (const c of CAPABILITIES) {
      // The component really does the writing — or this check is asserting
      // against a file that stopped being the owner and nobody noticed.
      check(`${c.label}: ${c.file} is the writer (sanity check on this check)`, c.writer.test(src(c.file)))
      check(`§1a-i credits ${c.label} to ${c.tab}`, c.claim.test(bulletFor(c.tab)), bulletFor(c.tab))
      // And no OTHER tab claims it. A move that only adds is a lie kept in
      // two places, which is exactly how the Dashboard line survived.
      for (const other of ['Dashboard', 'Nutrition', 'Exercise', 'Tools', 'Chat']) {
        if (other === c.tab) continue
        check(`...and ${other} no longer claims ${c.label}`, !c.claim.test(bulletFor(other)), bulletFor(other))
      }
    }
    // The technique screen shipped 5 Sep 2026 and the coach must know it
    // exists, or it answers "where can I see how to do this?" with nothing.
    check('§1a-i names the per-exercise technique screen',
      /how to|form cues/i.test(bulletFor('Exercise')), bulletFor('Exercise'))
    check('...and the app really has one (sanity check on this check)',
      /form_cues/.test(src('src/components/exercise/ExerciseDetailDialog.tsx')))
  }

  console.log('\n[2] §1a-i names exactly as many tabs as TABS.length — catches a tab being silently dropped from the list even if the others still match')
  // Counts capitalized tab-name occurrences at the "- Name:" bullet position
  // specifically (not a bare substring count, which would also match the
  // tab name appearing again later in prose, e.g. "Chat" inside "Chat: this
  // thread.").
  const bulletNames = [...appRealityBlock.matchAll(/^- ([A-Za-z]+):/gm)].map(m => m[1])
  check(
    `${TABS.length} tab bullets found, one per real tab`,
    bulletNames.length === TABS.length,
    bulletNames,
  )

  console.log('\n[3] The Tools tab bullet mentions its two real features (Timer, Grocery) — the most likely area to gain/lose a feature')
  const toolsBulletMatch = appRealityBlock.match(/^- Tools:.*$/m)
  check('a Tools bullet exists', toolsBulletMatch !== null)
  const toolsBullet = toolsBulletMatch?.[0] ?? ''
  check('Tools bullet mentions Timer', /timer/i.test(toolsBullet), toolsBullet)
  check('Tools bullet mentions Grocery', /grocery/i.test(toolsBullet), toolsBullet)

  console.log('\n[4] Regression guard: the confirmed-fabricated features stay on the "does NOT exist" list, never reintroduced as real')
  const doesNotExistMatch = appRealityBlock.match(/These do NOT exist[^]*?(?=\n\nIf asked)/)
  check('a "does NOT exist" list is present', doesNotExistMatch !== null)
  const doesNotExistBlock = doesNotExistMatch?.[0] ?? ''
  for (const phrase of ['subscription', 'data export', 'progress-photo', 'community']) {
    check(`"does NOT exist" list still names "${phrase}"`, doesNotExistBlock.toLowerCase().includes(phrase))
  }

  if (failures > 0) {
    console.error(`\n${failures} chat-app-reality check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll chat-app-reality checks passed.')
}

main()
