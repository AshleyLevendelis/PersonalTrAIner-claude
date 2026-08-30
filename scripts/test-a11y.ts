// ---------------------------------------------------------------------------
// Gate: the app can be operated by somebody who cannot see it, and read by
// somebody who needs bigger text.
//
// Audit §11. Two defects, both invisible to everyone they don't affect, which
// is exactly why they survived this long.
//
//   NAMES. Twenty controls contained nothing but an icon. A screen reader
//   announces those as "button", full stop — the send button, both week
//   arrows, every save/cancel/edit/delete on the Profile screen, and the tick
//   that logs a set. Not "hard to use": there is no way to know what any of
//   them does.
//
//   SIZE. Every font size was written in px, and a CSS pixel does not move
//   when someone raises their text size in iOS or Android settings. The one
//   accessibility control almost everybody actually uses did nothing here.
//   273 sizes are now in rem, which is a multiple of exactly that setting.
//
// The button scan is BRACE-AWARE, and that is not fussiness. The first
// version matched `<button([^>]*)>`, which stops at the first `>` — and
// `onClick={() => save()}` contains one. It mis-parsed most of the app and
// reported 6 unnamed controls where there were 20.
// ---------------------------------------------------------------------------

import { execFileSync } from 'child_process'
import { readdirSync, statSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail, null, 2)}` : ''}`) }
}

const files: string[] = []
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx$/.test(e)) files.push(p)
  }
}
walk(join(ROOT, 'src'))

/**
 * The `>` that closes an opening tag, ignoring any inside `{...}`.
 * `onClick={() => setOpen(false)}` has one, and a naive scan stops there.
 */
function closeOfOpenTag(src: string, i: number): number {
  let depth = 0
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return i
  }
  return -1
}

/**
 * True when nothing inside this control can ever become text.
 *
 * Self-closing elements are icons and spacers — they announce nothing. What
 * is left has to contain either a word or an interpolation that could render
 * one; `{label}` counts, `<X className="size-3" />` does not.
 */
function isUnnamed(body: string): boolean {
  let rest = body
  let before: string
  do { before = rest; rest = rest.replace(/<[A-Za-z][^<>]*\/>/g, '') } while (rest !== before)
  return !/[A-Za-z{]/.test(rest.trim())
}

interface Control { file: string; line: number; body: string }

function unnamedControls(): Control[] {
  const found: Control[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const tag of ['button', 'Button']) {
      let i = 0
      while ((i = src.indexOf('<' + tag, i)) !== -1) {
        const after = src[i + tag.length + 1]
        if (after && /[A-Za-z0-9]/.test(after)) { i++; continue }
        const gt = closeOfOpenTag(src, i)
        if (gt === -1) break
        const attrs = src.slice(i, gt)
        if (src[gt - 1] === '/') { i = gt; continue }
        const end = src.indexOf('</' + tag + '>', gt)
        if (end === -1) { i = gt; continue }
        const body = src.slice(gt + 1, end)
        i = gt + 1
        if (/aria-label|title=|aria-labelledby/.test(attrs)) continue
        if (!isUnnamed(body)) continue
        found.push({
          file: f.replace(ROOT + '/', ''),
          line: src.slice(0, i).split('\n').length,
          body: body.trim().replace(/\s+/g, ' ').slice(0, 60),
        })
      }
    }
  }
  return found
}

console.log('\n1. Every control says what it does')
{
  const unnamed = unnamedControls()
  check('no control is announced as just "button"', unnamed.length === 0,
    unnamed.map(u => `${u.file}:${u.line}  ${u.body}`))

  // The scanner has to actually be finding controls, or "zero unnamed" is a
  // statement about a scan that matched nothing.
  let scanned = 0
  for (const f of files) scanned += (readFileSync(f, 'utf8').match(/<[Bb]utton\b/g) ?? []).length
  check(`it scanned real controls (${scanned} found)`, scanned > 100, scanned)
}

console.log('\n2. Labels name the thing, not the icon')
{
  // "Button", "Icon", "Click" tell a screen-reader user nothing they did not
  // already know from the role.
  const useless: string[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/aria-label="([^"]*)"/g)) {
      const label = m[1].trim()
      if (label.length < 3 || /^(button|icon|click|link|image|img)$/i.test(label)) {
        useless.push(`${f.replace(ROOT + '/', '')}: "${label}"`)
      }
    }
  }
  check('no label restates the role instead of the action', useless.length === 0, useless)
}

console.log('\n3. Text scales with the reader\'s own setting')
{
  let inRem = true
  let detail = ''
  try { execFileSync('node', [join(ROOT, 'scripts/codemod-px-to-rem.mjs'), '--check'], { encoding: 'utf8' }) }
  catch (err) { inRem = false; detail = String((err as { stdout?: string }).stdout ?? '').trim() }
  check('no font size is written in px, so the OS text-size setting works', inRem, detail)

  // And the conversion has to be the real thing, not a handful of leftovers.
  let remCount = 0
  for (const f of [...files, join(ROOT, 'src/index.css')]) {
    const src = readFileSync(f, 'utf8')
    remCount += (src.match(/text-\[[0-9.]+rem\]|font-size:\s*[0-9.]+rem/g) ?? []).length
  }
  check(`the whole type scale moved, not a sample (${remCount} sizes in rem)`, remCount > 250, remCount)
}

console.log('\n4. Touch targets did NOT move — a floor is not a preference')
{
  // 44px is the minimum comfortable target, from the platform guidelines. It
  // must not shrink because someone chose smaller text: that would make the
  // control harder to hit for the person who asked for less, which is the
  // opposite of respecting the setting.
  const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
  // The size lives on the ::after pseudo-element that draws the slop, not on
  // the base rule — an earlier version of this check read the base rule, found
  // no number in it, and failed on correct CSS.
  const hitSlop = /\.hit-slop-44::after\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? ''
  check('the hit-slop rule is where this expects it', hitSlop.length > 0)
  check('...and its 44 is still px, not rem',
    /max\(44px,/.test(hitSlop) && !/44[0-9.]*rem/.test(hitSlop), hitSlop.slice(0, 240))

  const remTargets = [...css.matchAll(/(min-h|min-w|height|width)[^;]*?([0-9.]+)rem/g)]
    .filter(m => Number(m[2]) * 16 === 44)
  check('...and no touch target was converted anywhere else', remTargets.length === 0,
    remTargets.map(m => m[0]))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll accessibility checks passed.')
