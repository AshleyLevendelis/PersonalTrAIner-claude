import { readFileSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// WHICH COACH PRODUCED THIS ANSWER — one definition, three callers.
//
// CLAUDE.md's rule 5: "Advice quality is examined, not assumed. The coach
// exam, once built, runs whenever the prompt, the model or the tools change."
// A rule nothing can detect is a rule nobody keeps, so this is the detector:
// a hash of the three things that sentence names, stamped into every exam run
// and compared by test:coach-exam-fresh on every sweep.
//
// The runner stamps it, the grader carries it into the scores file, and the
// gate compares it. All three import THIS function rather than each computing
// their own — a fingerprint that two callers disagree about is worse than no
// fingerprint, because it fails in whichever direction nobody is watching.
//
// WHOLE FILES, NOT EXTRACTED SECTIONS, and deliberately. The obvious design
// was to pull out the system-prompt template literal and the toolDeclarations
// array and hash only those. That needs a small lexer to find the matching
// backtick and bracket through nested interpolations, and the day that lexer
// mis-parses is the day the gate goes quietly green forever. chat-gemini IS
// the coach — its prompt, its tool declarations and its tool handlers are all
// things that change what the coach does, which is exactly what rule 5 asks
// about. So the honest hash is the file.
//
// COMMENTS ARE STRIPPED FIRST, so documenting a decision never demands a paid
// re-run — the same reason test-coach-promises.ts reads a comment-stripped
// copy before asserting anything about what the coach says.
//
// The cost of the simple version is a false positive: an unrelated edit to
// this function asks for a re-run that was not strictly needed. That is the
// right direction to be wrong in. A missed re-run means the exam's scores
// describe a coach that no longer exists.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/** The three things rule 5 names, by the file each of them lives in. */
export const FINGERPRINT_PARTS = [
  { key: 'prompt-and-tools', path: 'supabase/functions/chat-gemini/index.ts' },
  { key: 'shared-rules', path: 'supabase/functions/_shared/coach-rules.ts' },
  { key: 'model', path: 'supabase/functions/_shared/gemini.ts' },
] as const

/**
 * Comments out, blank lines out, trailing whitespace out.
 *
 * The line-comment pattern requires the `//` to open the line, so a URL inside
 * a string literal survives it — `https://generativelanguage...` is in this
 * very file's hashing target.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.length > 0)
    .join('\n')
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16)

export interface CoachFingerprint {
  /** The one value the gate compares. */
  hash: string
  /** Per-part, so a stale-exam failure can say WHICH half of the coach moved. */
  parts: Record<string, string>
  /** Printed on the report so a human reading it knows what was examined. */
  model: string
}

export function coachFingerprint(root: string = ROOT): CoachFingerprint {
  const parts: Record<string, string> = {}
  for (const part of FINGERPRINT_PARTS) {
    parts[part.key] = sha(stripComments(readFileSync(join(root, part.path), 'utf8')))
  }
  const gemini = readFileSync(join(root, 'supabase/functions/_shared/gemini.ts'), 'utf8')
  const model = gemini.match(/GEMINI_MODEL\s*=\s*"([^"]+)"/)?.[1] ?? 'unknown'
  return {
    hash: sha(FINGERPRINT_PARTS.map(p => `${p.key}:${parts[p.key]}`).join('|')),
    parts,
    model,
  }
}

/**
 * WHICH MARKING GUIDE PRODUCED THESE SCORES — a separate stamp from the coach,
 * on purpose. Added 24 Sep 2026 with the rubric's sixth dimension (voice).
 *
 * The coach fingerprint answers "is this the coach that was examined?"; this
 * answers "were its answers marked against the standard on disk?". They are
 * different questions with different fixes: a changed coach needs the
 * conversations played again, while a changed rubric only needs the SAME
 * transcripts marked again. Folding the rubric into the coach hash would have
 * sent her to re-run the coach for a wording change in the marking guide.
 *
 * Only the marked block the judge is actually sent, and with whitespace
 * collapsed, so reflowing a paragraph never demands a re-grade while changing
 * a single word of the standard always does.
 */
export function rubricFingerprint(root: string = ROOT): string {
  const md = readFileSync(join(root, 'docs/coach-exam-rubric.md'), 'utf8')
  const start = md.indexOf('<!-- RUBRIC:BEGIN -->')
  const end = md.indexOf('<!-- RUBRIC:END -->')
  if (start < 0 || end < start) return 'no-rubric-block'
  return sha(md.slice(start, end).replace(/\s+/g, ' ').trim())
}

/**
 * WHICH QUESTIONS WERE ASKED — one stamp per exam case (3 Nov 2026).
 *
 * The coach stamp and the rubric stamp left one gap, named in BACKLOG since 26 Sep: an edited or ADDED case made
 * nothing stale, so a reworded question could sit beside answers to the old wording, and a new case beside scores
 * that never asked it, both reading as current. This is the third stamp. A case's stamp covers what the coach is
 * actually given and what it is graded on: its messages, its context overrides, its checks, and the shared base
 * world (minus that file's comment), so a change to the base marks every case. The case's `why` is documentation,
 * like a comment, and is left out so explaining a case never demands a paid re-run.
 */
export function examCaseStamps(root: string = ROOT): Record<string, string> {
  const dir = join(root, 'scripts/exam-cases')
  const base = JSON.parse(readFileSync(join(dir, '_base-context.json'), 'utf8')) as Record<string, unknown>
  delete base._comment
  const baseStamp = sha(JSON.stringify(base))
  const out: Record<string, string> = {}
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort()) {
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { name: string; messages?: unknown; contextOverrides?: unknown; checks?: unknown }
    out[c.name] = sha(JSON.stringify({ base: baseStamp, messages: c.messages ?? null, contextOverrides: c.contextOverrides ?? null, checks: c.checks ?? null }))
  }
  return out
}
