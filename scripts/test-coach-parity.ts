// ---------------------------------------------------------------------------
// EVERY COACH TOOL IS CLASSIFIED, AND NONE OF THEM QUIETLY DECLINES.
//
// Ashley's second promise: everything the app can do can be done by tapping OR
// by asking. CLAUDE.md's rule 4 says parity is checked both ways against a
// written exceptions list — and that until that list exists, every one-sided
// capability counts as a gap. docs/coach-screen-parity.md is that list; this
// file is what stops it going stale.
//
// THE HOLE THIS CLOSES, named in CLAUDE.md: "No GENERAL gate distinguishes a
// declared coach tool from a declining stub." That is how ban_exercise sat for
// weeks declared to the model and declining in the handler, while the must-have
// list recorded it as working on both surfaces. test:meal-food-edit §8 does this
// for its own three tools; this does it for all of them.
//
// WHAT IT NOW DOES ABOUT A SCREEN CLAIM, corrected 14 Sep 2026. This header
// used to say it "cannot tell whether the screen control a row names really
// exists — that is a human reading". That was true of a NAME and false of the
// CODE: most of these tools resolve through a client builder, and a screen path
// that really exists is a component importing that same builder. So §5 derives
// it, and a row marked SCREEN whose builder no component touches now fails.
//
// WHAT IT STILL CANNOT DO: judge whether the control is reachable, legible or
// correct. That is what the verify: drivers are for, and each closed gap gets
// one. A tool with no client builder at all (the pure server ones) still rests
// on the written note and the date beside it.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const chat = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
const doc = readFileSync('docs/coach-screen-parity.md', 'utf8')

const declared = [...new Set([...chat.matchAll(/^\s*name:\s*"([a-z_]+)",\s*$/gm)].map(m => m[1]))].sort()

console.log('\n1. The list covers every tool the coach is given\n')
check(`there are tools to check, so this has teeth (${declared.length})`, declared.length >= 20, declared.length)

// A row is `| \`tool\` | MARK | notes |`.
const rows = new Map<string, { mark: string; notes: string }>()
for (const m of doc.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*([A-Z]+)\s*\|\s*([^|]*)\|/gm)) {
  rows.set(m[1], { mark: m[2].trim(), notes: m[3].trim() })
}
check(`the list has rows, so this has teeth (${rows.size})`, rows.size >= 20, rows.size)

for (const tool of declared) {
  check(`${tool} is in the parity list`, rows.has(tool))
}
const ghosts = [...rows.keys()].filter(t => !declared.includes(t))
check('...and the list names no tool that does not exist', ghosts.length === 0, ghosts)

console.log('\n2. Each row says which side it lives on, and an exception says why\n')
for (const [tool, row] of rows) {
  check(`${tool}: marked SCREEN or EXCEPTION`, row.mark === 'SCREEN' || row.mark === 'EXCEPTION', row.mark)
  if (row.mark === 'EXCEPTION') {
    // A REASON, not a restatement. Short notes like "coach only" would make
    // the list a tally rather than a record of decisions, which is the thing
    // rule 4 asks for.
    check(`${tool}: the exception carries a reason`, row.notes.length >= 40, row.notes)
  } else {
    check(`${tool}: names the control that does the same thing`, row.notes.length >= 10, row.notes)
  }
}

console.log('\n3. No declared tool is a declining stub\n')
// A DECLINE IS A HANDLER WHOSE ONLY ANSWER IS A REFUSAL. Detected by the phrase
// the app's declines have always used, and proved on a synthetic handler first
// so the rule cannot go vacuous when — as now — nothing declines.
const DECLINE = /coming in an update soon|can't .{0,40} through chat yet|is not available from chat/i
const handlerOf = (tool: string): string => {
  const at = chat.indexOf(`name === "${tool}"`)
  if (at < 0) return ''
  const next = chat.indexOf('if (name === "', at + 5)
  return chat.slice(at, next < 0 ? at + 6000 : next)
}
check('the decline detector detects (proved on a synthetic handler)',
  DECLINE.test('return json({ reply: "I can\'t do that through chat yet — coming in an update soon." })'))
for (const tool of declared) {
  check(`${tool}: reachable — the handler compares on its name`, chat.includes(`name === "${tool}"`))
  check(`${tool}: not a declining stub`, !DECLINE.test(handlerOf(tool)), handlerOf(tool).slice(0, 120))
}

console.log('\n4. The screen-only section is a real answer, not an empty heading\n')
const screenOnly = doc.slice(doc.indexOf('## Things the screen can do that the coach cannot'))
check('the screen-only section states a count or lists entries',
  /\*\*None,/.test(screenOnly) || /^- /m.test(screenOnly), screenOnly.slice(0, 120))
check('...and says when that was last measured', /\d{1,2} Sep 2026/.test(doc))

console.log('\n5. A SCREEN claim is derived, not merely asserted\n')
// THE HOLE THIS CLOSES, and it was this file's own. §2 checked that a row said
// SCREEN and that the note was long enough to be a sentence. Nothing checked
// the sentence was TRUE — so the list could claim a screen path that did not
// exist, which is exactly the failure the list was written to prevent, moved
// one level up.
//
// HOW IT IS DERIVED: a tool's client half is a builder named for it, and a
// screen path is a COMPONENT importing that builder. Neither is written down
// here — the builder name comes from the tool name, and the components are
// whatever is under src/components. So moving a control off a screen breaks
// this without anyone remembering to come back and edit the list.
{
  const { readdirSync, statSync, existsSync } = await import('fs')
  const { join, sep } = await import('path')

  const componentSources: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e)
      if (statSync(full).isDirectory()) walk(full)
      else if (e.endsWith('.tsx') || e.endsWith('.ts')) componentSources.push(readFileSync(full, 'utf8'))
    }
  }
  walk('src/components')
  check(`there are components to search (${componentSources.length} files)`, componentSources.length > 10, componentSources.length)

  // propose_meal_food_add -> buildMealFoodAddProposal
  const builderFor = (tool: string) =>
    'build' + tool.replace(/^propose_/, '').split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('') + 'Proposal'

  // WHICH TOOLS HAVE A SHARED CLIENT BUILDER AT ALL — declared in src/lib, and
  // decided INDEPENDENTLY of whether any component uses it.
  //
  // TWO THINGS THIS GOT WRONG FIRST, both found by running it:
  //
  //  1. The skip was "does a component import it?" — which skipped exactly the
  //     case the check exists to fail on. The loop could not produce a failure.
  //     A check that cannot fail is worse than no check, and it looked fine.
  //  2. Then it counted ChatAssistant.tsx as a component, so a builder DEFINED
  //     inside ChatAssistant (most of them are) read as a screen path. That
  //     proved the COACH had a builder, which is the opposite of the claim.
  //     ChatAssistant is the coach's own client and is excluded here.
  //
  // What is left is small and true: a builder in src/lib that a screen
  // component imports. The rest are named below rather than counted.
  const libBuilders = new Set<string>()
  const walkLib = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e)
      if (statSync(full).isDirectory()) walkLib(full)
      else if (e.endsWith('.ts')) {
        for (const m of readFileSync(full, 'utf8').matchAll(/^export function (build\w+Proposal)/gm)) libBuilders.add(m[1])
      }
    }
  }
  walkLib('src/lib')
  check(`src/lib declares shared builders (${libBuilders.size})`, libBuilders.size >= 5, [...libBuilders])

  // THE COACH'S OWN CLIENT IS NOT A SCREEN. Excluded by name, and asserted to
  // exist so a rename cannot silently turn the exclusion into a no-op.
  const CHAT_CLIENT = 'src/components/ChatAssistant.tsx'
  check('the coach client is where it is thought to be (sanity check on this check)',
    readFileSync(CHAT_CLIENT, 'utf8').length > 1000)

  // REACHABLE FROM A TAB, not merely present in the folder.
  //
  // The first version searched every file under src/components, which proved
  // only that SOME file mentions the builder. Measured: deleting the import
  // that actually renders the control left this green, because the control's
  // own file still referenced the builder while nothing rendered that file.
  // A component nobody reaches is not a screen path.
  //
  // So the reachable set is crawled from App.tsx's own <TabsContent> roots —
  // the same derivation test:app-tour §9 uses, and for the same reason: what
  // is on which tab is read from the app's wiring rather than written down.
  const app = readFileSync('src/App.tsx', 'utf8')
  const findComponentFile = (name: string): string | null => {
    const walk = (dir: string): string | null => {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e)
        if (statSync(full).isDirectory()) { const hit = walk(full); if (hit) return hit }
        else if (e === `${name}.tsx`) return full
      }
      return null
    }
    return walk('src/components')
  }
  const reachable = new Set<string>()
  const visit = (file: string) => {
    if (reachable.has(file) || file === CHAT_CLIENT) return
    reachable.add(file)
    const src = readFileSync(file, 'utf8')
    // STATIC AND DEFERRED IMPORTS BOTH.
    //
    // This followed `from '...'` only. The app deliberately defers components
    // that are not on the path to first paint — the coach client, and from
    // 14 Sep the two meal sheets — and those arrive as `import('...')` inside a
    // lazy() call, with no `from` anywhere. So the crawl stopped at the meal
    // rows and reported that no screen reached the Add-food builder, minutes
    // after a browser driver had opened that very control. A reachability check
    // that cannot see a lazy boundary will get less accurate every time the
    // bundle is split further, which is the direction this app is going.
    for (const m of src.matchAll(/(?:from|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1]
      let base: string
      if (spec.startsWith('@/')) base = join('src', spec.slice(2))
      else if (spec.startsWith('.')) base = join(file, '..', spec)
      else continue
      if (base.includes(`components${sep}ui${sep}`)) continue
      for (const ext of ['.tsx', '.ts']) {
        const cand = base + ext
        if (cand.includes(`components${sep}`) && existsSync(cand)) visit(cand)
      }
    }
  }
  for (const m of app.matchAll(/<TabsContent value="\w+"/g)) {
    const from = app.indexOf(m[0])
    const rest = app.slice(from + 1)
    const nextTab = rest.indexOf('<TabsContent value="')
    const endTabs = rest.indexOf('</Tabs>')
    const stop = [nextTab, endTabs].filter(i => i !== -1).sort((a, b) => a - b)[0] ?? rest.length
    for (const c of new Set([...rest.slice(0, stop).matchAll(/<([A-Z]\w+)/g)].map(x => x[1]))) {
      const f = findComponentFile(c)
      if (f) visit(f)
    }
  }
  check(`the tabs reach real components (${reachable.size}) (sanity check on this check)`, reachable.size > 5, reachable.size)
  const screenSources = [...reachable].map(f => readFileSync(f, 'utf8'))

  let derived = 0
  const notDerivable: string[] = []
  for (const [tool, row] of rows) {
    if (row.mark !== 'SCREEN') continue
    const builder = builderFor(tool)
    if (!libBuilders.has(builder)) { notDerivable.push(tool); continue }
    derived++
    check(`${tool}: a SCREEN component (not the chat) imports ${builder}`,
      screenSources.some(src => src.includes(builder)))
  }
  // NAMED, NOT SILENTLY PASSED. A tool without a shared builder rests on its
  // written note and the date beside it, and the list says which those are
  // rather than letting them look derived.
  console.log(`  (${notDerivable.length} SCREEN rows rest on the written note, having no shared builder)`)
  // WITHOUT THIS THE LOOP ABOVE PROVES NOTHING. A `continue` for every row
  // leaves zero checks and reads as a pass — the same shape as a crash
  // reporting zero failures.
  check(`...and this was derivable for a real number of tools (${derived})`, derived >= 4, derived)
}

console.log(failures === 0
  ? '\nEvery coach tool is classified, and none of them declines.\n'
  : `\n${failures} parity failure(s).\n`)
process.exit(failures === 0 ? 0 : 1)
