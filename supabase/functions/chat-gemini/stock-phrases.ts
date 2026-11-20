// ---------------------------------------------------------------------------
// THE TICS THAT MAKE A COACH SOUND LIKE SOFTWARE, taken out in code.
//
// Ashley, 19 Nov 2026: "improve the chat ... the way the chat speaks the tone
// it uses, the questions it asks ... the way it keeps the conversation going",
// and "If you're unsure about something go with your recommendations."
//
// The exam run of 18 Nov 2026 (59 conversations) is the evidence. The coach's
// instructions already ban every one of these, and the model wrote them anyway:
//   - an internal name said to the person ("we can use propose_schedule_change");
//   - a tag the app does not read, shown raw ("[START_TIMER: type=...]");
//   - an emoji hung on ordinary advice (about 12 replies, a phone on two of them);
//   - a stock opener that grades them ("I hear you, Ashley." three times running);
//   - a stock closer whose answer changes nothing ("How does that sound?");
//   - his name in reply after reply.
//
// The same split as textLikeACoach beside this file: code holds what a rule can
// SEE, the exam grades what only judgement can. So every list here is CLOSED
// and literal. A question that is specific to him ("how did the knee settle?")
// is never touched, however idle it is: that is the exam's to mark.
//
// Nothing here writes a word of its own, except an internal name turned into
// the plain words it is made of. And where the reply is safety or medical
// wording (voice-pass's own test), no sentence is removed at all.
// ---------------------------------------------------------------------------
import { mustNotRewrite } from './voice-pass.ts'

/** The markers the app reads. Anything else in this shape is the model inventing one. */
const APP_TAG_NAMES = 'QUICK_REPLIES|BREAK|ACTION|LESSON'
const TRAILING_TAGS = new RegExp(`(?:\\s*\\[(?:QUICK_REPLIES|ACTION|LESSON):?[^\\]]*\\])+\\s*$`)
const ANY_APP_TAG = new RegExp(`\\[(?:${APP_TAG_NAMES}):?[^\\]]*\\]`, 'g')

/** What he reads: the app's markers out. */
function visible(text: string): string {
  return text.replace(ANY_APP_TAG, ' ').replace(/\s+/g, ' ').trim()
}

function splitTail(text: string): { body: string; tail: string } {
  const m = TRAILING_TAGS.exec(text)
  return m ? { body: text.slice(0, m.index), tail: text.slice(m.index) } : { body: text, tail: '' }
}

const upperFirst = (s: string) => s.replace(/^(\s*)(\p{Ll})/u, (_m, sp: string, c: string) => sp + c.toUpperCase())

// --- 1. A tag the app does not read ------------------------------------------

/** "[START_TIMER: type=...]", "[LOG_SET]": capitals, then a colon or an underscore, and not one of the app's own. */
const INVENTED_TAG = new RegExp(
  `\\[(?!(?:${APP_TAG_NAMES})\\b)(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*:[^\\]\\n]*|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\\]`,
  'g',
)

export function removeInventedTags(text: string): string {
  if (!INVENTED_TAG.test(text)) { INVENTED_TAG.lastIndex = 0; return text }
  INVENTED_TAG.lastIndex = 0
  const { body, tail } = splitTail(text.replace(INVENTED_TAG, ''))
  // "Ready when you are:" with the tag gone ends on a colon pointing at nothing.
  const tidy = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trimEnd().replace(/:$/, '.')
  return tidy + tail.replace(/^\n{2,}/, '\n')
}

// --- 2. An internal name ------------------------------------------------------

const URL_OR_LINK = /\]\([^)]*\)|https?:\/\/\S+|www\.\S+/g
/** snake_case: never an English word. "propose_schedule_change", "today_meal_plan". */
const INTERNAL_NAME = /`?\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b`?/g

function plainName(name: string): string {
  const words = name.split('_')
  if (words[0] === 'propose' && words.length > 1) {
    const rest = words.slice(1).join(' ')
    return `${/^[aeiou]/.test(rest) ? 'an' : 'a'} ${rest}`
  }
  return words.join(' ')
}

/** An internal name becomes the plain words it is made of. Links are left exactly as they are. */
export function plainInternalNames(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(URL_OR_LINK)) {
    out += text.slice(last, m.index).replace(INTERNAL_NAME, (_m, n: string) => plainName(n)) + m[0]
    last = (m.index ?? 0) + m[0].length
  }
  return out + text.slice(last).replace(INTERNAL_NAME, (_m, n: string) => plainName(n))
}

// --- 3. Emoji ----------------------------------------------------------------

/** One emoji, with whatever joins onto it (a skin tone, a joined second figure). Ticks are not emoji here. */
const EMOJI = /(?![\u2713\u2714])(?:[\u{1F000}-\u{1FAFF}]|[\u2600-\u27BF])(?:\uFE0F|\u200D(?:[\u{1F000}-\u{1FAFF}]|[\u2600-\u27BF])|[\u{1F3FB}-\u{1F3FF}])*/gu
/** Past this much text a reply is advice, and advice carries no emoji (the coach's own rule: a win, a hello, a sign-off). */
export const EMOJI_OVER_CHARS = 160

export function capEmoji(text: string): string {
  const found = text.match(EMOJI)
  if (!found) return text
  const keepOne = visible(text).length <= EMOJI_OVER_CHARS
  let kept = 0
  const out = text.replace(EMOJI, e => (keepOne && kept++ === 0 ? e : ''))
  if (out === text) return text
  return out
    .replace(/[ \t]+([.,!?;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// --- 4. A stock opener -------------------------------------------------------

/**
 * Openers that grade him or what he said, each with how it joins what follows.
 * CLOSED: an acknowledgement about HIM ("Sorry, those days are rotten.") is
 * never here, and nor is being glad at good news ("That's what we love to
 * hear"): measured on the 18 Nov replies, taking that one out left a reply
 * that never answered "yesterday's session was great" at all.
 */
const STOCK_OPENERS: RegExp[] = [
  /^(?:(?:that's|that is|what) an? )?(?:really )?(?:great|good|excellent|fantastic|awesome|brilliant|interesting) question\s*(?:[.!]+\s*|[—–-]\s*|,\s*)/i,
  /^i hear you(?:,\s*\p{Lu}[\p{L}'-]*)?\s*(?:[.!]+\s+|[—–-]\s*|,\s*(?:but|and)\s+)/iu,
  /^love that\s*[.!]+\s+/i,
  /^(?:awesome|amazing)\s*[,!.]+\s*/i,
]
/** "To answer your question directly:" wherever a sentence starts with it. */
const META_LEAD = /(^|\n|[.!?]\s+)to answer your question(?: directly)?\s*[:,—–-]\s*(\p{L})/giu
/** What must be left for an opener to go: a reply that is ONLY the opener keeps it. */
const MIN_LEFT_AFTER_OPENER = 20

export function dropStockOpener(text: string): string {
  let out = text.replace(META_LEAD, (_m, lead: string, c: string) => lead + c.toUpperCase())
  const lead = /^\s*/.exec(out)?.[0] ?? ''
  const rest = out.slice(lead.length)
  for (const re of STOCK_OPENERS) {
    const m = re.exec(rest)
    if (!m) continue
    const left = rest.slice(m[0].length)
    if (visible(left).length < MIN_LEFT_AFTER_OPENER) break
    out = lead + upperFirst(left.replace(/^\s+/, ''))
    break
  }
  return out
}

// --- 5. A stock closer -------------------------------------------------------

/**
 * Closing lines whose answer changes nothing, as WHOLE sentences. CLOSED and
 * literal: nothing here names a lift, a meal, a day or a feeling of his.
 */
const STOCK_CLOSERS: RegExp[] = [
  /^(?:so,?\s+)?how (?:does|do) (?:that|this|all that|all of that) sound(?: to you)?\?$/i,
  /^(?:how's|how is) that sound(?:ing)?\?$/i,
  /^sounds? (?:good|ok|okay|alright|like a plan)\?$/i,
  /^does (?:that|this) sound (?:good|ok|okay|alright|right|like a plan)(?: to you)?\?$/i,
  /^(?:does (?:that|this) )?make sense\?$/i,
  /^does (?:that|this) help\?$/i,
  /^(?:i )?hope (?:that|this) helps\s*[.!]+$/i,
  /^(?:is there )?anything else(?: i can help(?: you)?(?: with)?| you(?:'d like| need| want)(?: help with)?| on your mind)?(?: today| right now)?\?$/i,
  /^let me know if (?:you need anything else|there(?:'s| is) anything else[^.!?]*|you have any (?:other |more )?questions)\s*[.!]+$/i,
  /^what do you think\?$/i,
  /^(?:any )?(?:other |more )?questions\?$/i,
]
/** A closer goes only from under a real answer. "Hey! How are you feeling today?" is a whole reply, not a closer. */
export const MIN_LEFT_AFTER_CLOSER = 80

export function isStockCloser(sentence: string): boolean {
  const s = sentence.replace(EMOJI, '').trim()
  return STOCK_CLOSERS.some(re => re.test(s))
}

export function dropStockCloser(text: string): string {
  const { body, tail } = splitTail(text)
  // Buttons answer the question above them: with a quick-reply tag it is a real, one-tap question.
  if (/\[QUICK_REPLIES/i.test(tail)) return text
  const trimmed = body.trimEnd()
  const m = /([^.!?\n]+[.!?]+)$/.exec(trimmed)
  if (!m || !isStockCloser(m[1])) return text
  const left = trimmed.slice(0, m.index).trimEnd().replace(/\n?\[BREAK\]$/i, '').trimEnd()
  if (visible(left).length < MIN_LEFT_AFTER_CLOSER) return text
  return left + tail
}

// --- 5b. An offer asked in plain words gets its buttons ----------------------

/**
 * "Would you like me to set that up for you?" with no buttons under it (his live chat, 19 Nov 2026). His 20 Oct
 * ruling is "text + small buttons always" for an offer, and the coach's own instructions say so (section 1b-ii, way
 * 2), but a reply that forgets leaves him typing "yes" on a gym floor. So a reply whose LAST sentence is an offer to
 * do something, with no button line of its own, gets the two plain answers. "Yes please" goes back to the coach as
 * his yes, and the coach then makes the change through its tool, with Apply, as for any other ask.
 */
const BARE_OFFER = /^(?:so\s+|and\s+)?(?:would you like me to|do you want me to|want me to|shall i|should i)\b[^?]*\?$/i
export const OFFER_BUTTONS = '[QUICK_REPLIES: "Yes please" | "Not now"]'

export function offerButtons(text: string): string {
  const { body, tail } = splitTail(text)
  if (/\[QUICK_REPLIES/i.test(tail) || /\[QUICK_REPLIES/i.test(body)) return text
  const trimmed = body.trimEnd()
  const m = /([^.!?\n]+\?)$/.exec(trimmed)
  if (!m || !BARE_OFFER.test(visible(m[1]).trim())) return text
  return `${trimmed}\n${OFFER_BUTTONS}${tail}`
}

// --- 6. His name -------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does this text say his name? */
export function saysName(text: string, name: string): boolean {
  const n = name.trim()
  if (n.length < 2) return false
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'u').test(text)
}

/**
 * His name as a form of address, at most once in a reply, and not at all when
 * the coach has just used it (`usedRecently`). Only the two shapes that are
 * unmistakably address: "Name, ..." opening a line, and ", Name" before a stop.
 */
export function limitName(text: string, name: string | null | undefined, usedRecently: boolean): string {
  const n = (name ?? '').trim()
  if (n.length < 2) return text
  const N = escapeRe(n)
  const address = new RegExp(`(^|\\n)(${N}),\\s+(\\p{L})|,\\s*(${N})(?=\\s*(?:[.!?,;:—–-]|$|\\n))`, 'gu')
  let seen = usedRecently ? 1 : 0
  return text.replace(address, (m, lineStart: string | undefined, _a: string | undefined, next: string | undefined) => {
    if (seen++ === 0) return m
    return lineStart !== undefined && next !== undefined ? lineStart + next.toUpperCase() : ''
  })
}

// --- All of it, in order -----------------------------------------------------

export interface TicContext {
  /** His first name, as the coach is told it. */
  name?: string | null
  /** The coach's last few messages, newest last. */
  recentCoach?: string[]
}

export function withoutTics(text: string, ctx: TicContext = {}): string {
  if (!text) return text
  let out = removeInventedTags(text)
  out = plainInternalNames(out)
  out = capEmoji(out)
  // Safety and medical wording keeps every sentence it was written with (voice-pass's own rule).
  if (!mustNotRewrite(out, '')) {
    out = dropStockOpener(out)
    out = dropStockCloser(out)
  }
  const name = (ctx.name ?? '').trim()
  if (name) out = limitName(out, name, (ctx.recentCoach ?? []).slice(-3).some(t => saysName(t, name)))
  return offerButtons(out)
}
