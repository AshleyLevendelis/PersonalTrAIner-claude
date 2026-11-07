// ---------------------------------------------------------------------------
// THE SECOND PASS: THE COACH DRAFTS, A SHORT EDIT MAKES IT A TEXT.
//
// Ashley's ruling, 6 Nov 2026, "Second pass + checks" (over checks only and
// over a stronger model), after the coach exam showed the warm coach who
// teaches still writing three paragraphs and handing over menus: asking the
// model to be short did not work, the same as every attempt before it.
//
// So for an advice reply, the model's draft is rewritten by a SEPARATE short
// call whose only job is the voice: two to four short lines, one option not a
// menu, one question at most, warm, with the why kept. Drafting and editing
// are two jobs; asking for both at once is what failed.
//
// THE REWRITE IS CHECKED, and refused when it:
//   - loses or alters an app marker ([QUICK_REPLIES], [BREAK], [LESSON], [ACTION]);
//   - carries a number the draft does not;
//   - names a food the draft does not;
//   - says it changed her plan or day (the plan-claim and today checks, handed in);
//   - is still the wrong shape (shapeProblem).
// A refused rewrite gets ONE more try told why; after that the draft stands.
// Nothing is ever lost: the worst case is the reply she would have had anyway.
//
// WHAT IS NEVER REWRITTEN, because the exact words matter more than the length:
//   - a reply to a message that REPORTS something: pain, a symptom or an injury,
//     an allergy or intolerance, a medical question, medication, or eating very
//     little (PROTECTED_ASK, read off her message);
//   - a reply that hands her to a doctor, physio, pharmacist or dietitian, or
//     talks about an allergy, medication or disordered eating (PROTECTED_REPLY).
// And inside a reply that IS edited, every sentence about pain, an injury or a
// warning sign (SAFETY_SENTENCE) must come back word for word, or the edit is
// refused: "stop if you feel a sharp pain" is never shortened away.
//
// MEASURED 7 Nov 2026 (the exam on TEST): one list read off both her message
// and the draft skipped 19 replies, 9 of them on plain training advice. "numb"
// matched "numbers" (3), "chest" matched a press (3), "injury" matched a reply
// explaining why an exercise was chosen (2), "starving" matched hunger (1). So
// the territory is read off what she SAID, and a warning in the coach's own
// advice is kept rather than used as a reason to skip the whole reply.
//
// A reply that is already short and the right shape goes straight through,
// with no extra call.
//
// Everything that touches the world is handed in (`call`, `refuse`), so
// test:voice-pass drives this exact code with fakes.
// ---------------------------------------------------------------------------
import { FOOD } from '../_shared/reminder-writer.ts'

/** Past this many characters of visible text, or with a shape problem, a draft is edited. */
export const EDIT_OVER_CHARS = 220
/** Her "two to four lines, never a block of text". */
export const MAX_LINES = 4
export const MAX_SENTENCES_PER_LINE = 2
export const MAX_CHARS = 520

const MARKER_RE = /\[(?:QUICK_REPLIES|BREAK|LESSON|ACTION):?[^\]]*\]/g

/** The app's markers that carry meaning (buttons, a lesson, an action), in order, exactly as written. [BREAK] is
 *  not one of them: splitting a reply into texts is the edit's job. */
const KEPT_MARKER_RE = /\[(?:QUICK_REPLIES|LESSON|ACTION):?[^\]]*\]/g
export function markersOf(text: string): string[] {
  return text.match(KEPT_MARKER_RE) ?? []
}

/** What she reads: markers out, one entry per non-empty line ([BREAK] is a line break). */
function visibleLines(text: string): string[] {
  return text.replace(/\[BREAK\]/g, '\n').replace(MARKER_RE, '').split('\n').map(l => l.trim()).filter(Boolean)
}

function sentences(line: string): number {
  return line.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean).length
}

/** She asked HOW to do something, or for the full guide: up to three numbered steps are hers (24 Sep "short steps"). */
export function isHowTo(userMessage: string): boolean {
  return /\bhow (?:do|to|should|can) i\b|\bform\b|\btechnique\b|\bcues?\b|\bset ?up\b|full form guide/i.test(userMessage)
}

/** Why this reply is the wrong shape for a text from a coach, or null. */
export function shapeProblem(text: string, userMessage: string): string | null {
  const lines = visibleLines(text)
  const numbered = lines.filter(l => /^\d+[.)]\s/.test(l)).length
  const bullets = lines.filter(l => /^[-•*]\s/.test(l)).length
  if (bullets > 0) return 'a bulleted list'
  if (numbered > 0 && !isHowTo(userMessage)) return 'a list of options'
  if (numbered > 3) return 'more than three steps'
  const prose = lines.filter(l => !/^\d+[.)]\s/.test(l))
  // A how-to's lead-in and its steps are counted apart: the steps are one shape, not four lines of prose.
  if (prose.length > MAX_LINES) return 'too many lines'
  if (prose.some(l => sentences(l) > MAX_SENTENCES_PER_LINE + 1)) return 'a paragraph'
  if (lines.join(' ').length > MAX_CHARS) return 'too long'
  const questions = lines.join(' ').split(/(?<=[.!?])\s+/).filter(s => s.trim().endsWith('?')).length
  if (questions > 1) return 'more than one question'
  return null
}

/** Her message reports something where the exact reply matters more than its length. */
const PROTECTED_ASK = /\b(?:allerg\w*|anaphyla\w*|nut-free|gluten|coeliac|celiac|lactose|sesame|shellfish|intoleran\w*|doctor|gp|physio\w*|pharmac\w*|dietitian|medic(?:al|ation|ations|ine|ines)|prescri\w*|diagnos\w*|injur\w*|pain\w*|sharp|hurts?|hurting|numb|numbness|tingl\w*|dizz\w*|faint\w*|swell\w*|swollen|disorder\w*|purg\w*|binge\w*|starv\w* (?:myself|yourself)|starvation|calories? a day|[1-9]\d{2} ?(?:k?cals?|calories))\b/i
/** The coach's draft hands her to a professional, or talks about an allergy, medication or disordered eating. */
const PROTECTED_REPLY = /\b(?:allerg\w*|anaphyla\w*|nut-free|coeliac|celiac|intoleran\w*|doctor|gp|physio\w*|pharmac\w*|dietitian|medic(?:al|ation|ations|ine|ines)|prescri\w*|diagnos\w*|eating disorder\w*|purg\w*|binge\w*|starv\w* (?:myself|yourself)|starvation)\b/i
/** A sentence in an edited reply that must come back word for word: a warning sign, pain, an injury. */
const SAFETY_SENTENCE = /\b(?:pain\w*|hurts?|hurting|sharp|numb|numbness|tingl\w*|dizz\w*|faint\w*|swell\w*|swollen|injur\w*)\b/i

export function mustNotRewrite(draft: string, userMessage: string): boolean {
  return PROTECTED_ASK.test(userMessage) || PROTECTED_REPLY.test(draft)
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

/** The draft's sentences that an edit must keep word for word (a step number in front is not part of it). */
export function safetySentencesOf(draft: string): string[] {
  return visibleLines(draft)
    .map(l => l.replace(/^\d+[.)]\s+/, ''))
    .flatMap(l => l.split(/(?<=[.!?])\s+/))
    .map(s => s.trim())
    .filter(s => s && SAFETY_SENTENCE.test(s))
}

export function voicePrompt(draft: string, userMessage: string, why: string | null): string {
  return [
    "You edit messages for a fitness and nutrition coach who texts their client. The coach is warm, encouraging, knowledgeable and in the client's corner, and teaches the reason behind its advice.",
    `The client wrote: "${userMessage}"`,
    `The coach's draft reply:\n"""\n${draft}\n"""`,
    why ? `Your last version was ${why}. Fix that.` : '',
    'Rewrite the draft as the coach texting. Rules:',
    '- Two to four short lines, one or two sentences each. Never a block of text. Split into separate texts with a line containing only [BREAK] where it reads better.',
    '- Keep the answer first, then ONE short reason (the why). Drop everything else.',
    '- If the draft offers several options, pick the one that suits them best, say why, and mention there are other options. No list of options.',
    isHowTo(userMessage) ? '- A how-to may stay as up to three short numbered steps.' : '- No lists, no numbered lines, no bullets.',
    '- At most one question, and only if their answer changes what happens next. Otherwise end on the answer.',
    '- Keep every fact, number, name and food exactly as in the draft. Add nothing new: no new number, food, exercise or claim.',
    ...(() => { const keep = safetySentencesOf(draft); return keep.length ? [`- Keep these sentences word for word, because they are about their safety: ${keep.map(k => `"${k}"`).join(' ')}`] : [] })(),
    '- Keep every marker in square brackets ([QUICK_REPLIES: ...], [LESSON: ...], [ACTION: ...]) exactly as written, at the end.',
    '- No bold, no headers. At most one emoji. Never mention being an AI or that you are editing.',
    'Reply with the message only.',
  ].filter(Boolean).join('\n')
}

const numbersOf = (t: string) => new Set(t.replace(MARKER_RE, '').match(/\d+(?:\.\d+)?/g) ?? [])
const foodsOf = (t: string) => new Set([...t.replace(MARKER_RE, '').matchAll(new RegExp(FOOD.source, 'gi'))].map(m => m[0].toLowerCase()))

export type VoiceCheck = { ok: true; text: string } | { ok: false; why: string }

/** Is the rewrite safe to send in place of the draft? */
export function checkRewrite(raw: string | null | undefined, draft: string, userMessage: string, refuse?: (t: string) => string | null): VoiceCheck {
  const text = (raw ?? '').replace(/^["“]+|["”]+$/g, '').replace(/^"""\s*|\s*"""$/g, '').trim()
  if (!text) return { ok: false, why: 'empty' }
  if (JSON.stringify(markersOf(text)) !== JSON.stringify(markersOf(draft))) return { ok: false, why: 'changed the app markers' }
  const nums = numbersOf(draft)
  const strayNum = [...numbersOf(text)].filter(n => !nums.has(n))
  if (strayNum.length) return { ok: false, why: `a number not in the draft (${strayNum.join(', ')})` }
  const foods = foodsOf(draft)
  const strayFood = [...foodsOf(text)].filter(f => !foods.has(f))
  if (strayFood.length) return { ok: false, why: `a food not in the draft (${strayFood.join(', ')})` }
  const visible = norm(visibleLines(text).join(' '))
  const lost = safetySentencesOf(draft).find(k => !visible.includes(norm(k)))
  if (lost) return { ok: false, why: `a safety sentence not kept word for word ("${lost.slice(0, 60)}")` }
  const claim = refuse ? refuse(text) : null
  if (claim) return { ok: false, why: `a claim the checks refuse (${claim.slice(0, 60)})` }
  const shape = shapeProblem(text, userMessage)
  if (shape) return { ok: false, why: shape }
  return { ok: true, text }
}

export interface VoicePassResult {
  reply: string
  /** 'kept': short and right already, or never rewritten; 'edited': the rewrite; 'draft': every rewrite refused. */
  source: 'kept' | 'skipped' | 'edited' | 'draft'
  why?: string
}

/**
 * THE REPLY SHE GETS. `call` returns the edit's text or null; `refuse` is the
 * same claim check the draft passed. At most two edit calls; never worse than
 * the draft.
 */
export async function voicePass(
  draft: string,
  userMessage: string,
  call: ((prompt: string) => Promise<string | null>) | null,
  refuse?: (t: string) => string | null,
): Promise<VoicePassResult> {
  const visible = visibleLines(draft).join(' ')
  const problem = shapeProblem(draft, userMessage)
  if (!problem && visible.length <= EDIT_OVER_CHARS) return { reply: draft, source: 'kept' }
  if (mustNotRewrite(draft, userMessage)) return { reply: draft, source: 'skipped', why: 'safety wording' }
  if (/^full form guide$/i.test(userMessage.trim())) return { reply: draft, source: 'skipped', why: 'the full guide was asked for' }
  if (!call) return { reply: draft, source: 'draft', why: 'no editor' }
  let why: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string | null = null
    try { raw = await call(voicePrompt(draft, userMessage, why)) } catch { raw = null }
    const checked = checkRewrite(raw, draft, userMessage, refuse)
    if (checked.ok) return { reply: checked.text, source: 'edited' }
    why = checked.why
  }
  return { reply: draft, source: 'draft', why: why ?? undefined }
}
