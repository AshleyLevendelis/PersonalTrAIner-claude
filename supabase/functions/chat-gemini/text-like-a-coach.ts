// ---------------------------------------------------------------------------
// THE COACH TEXTS; IT DOES NOT FORMAT. The last step every reply takes before
// it leaves this function.
//
// Ashley, 24 Sep 2026: "I want it to feel like a text conversation with a
// coach", and from three options, "short steps" — up to three numbered lines
// for a how-to, one line per thing when several were asked, no headers, no
// bold. The prompt says so (§1 VOICE). The first exam run after it said so
// (25 Sep 2026) shows the model ignoring the formatting half anyway: "###
// Setup & Stance" headers and "**Set your stance**:" bold on a three-step
// answer, and a bold dish name over a bulleted ingredient list.
//
// So the part that CAN be enforced in code is enforced here, and only that
// part — the same split as her cardio ruling: code holds what a rule can see
// (a header, a bold marker), the exam grades what only judgement can (whether
// a question matters, whether an answer is one line per thing).
//
// DELIBERATELY NARROW. It removes markup: a header becomes its own plain line,
// **bold** becomes the words inside it. Numbered and dash lines stay — both
// are allowed shapes. Links, and the app's own tags ([QUICK_REPLIES: …],
// [BREAK], [ACTION: …]), are untouched: the client reads those, and a
// formatter that ate one would break a button.
//
// SINCE 19 NOV 2026 IT ALSO TAKES OUT THE TICS (stock-phrases.ts, on his "improve
// the chat ... the tone it uses, the questions it asks"): an internal name said
// to him, a tag the app does not read, an emoji on advice, a closed list of
// stock openers and closers, and his name said again and again. Still only
// what a rule can see; whether a specific question earns its place stays the
// exam's to judge.
// ---------------------------------------------------------------------------
import { withoutTics, type TicContext } from './stock-phrases.ts'

/** A markdown header line — "# X" to "###### X" — becomes "X". */
const HEADER = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm
/** Paired bold markers on one line: **x** and __x__. Single * is left alone. */
const BOLD_STARS = /\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g
const BOLD_UNDERSCORES = /(^|[^\w])__(?=\S)([^_\n]+?)(?<=\S)__(?=[^\w]|$)/g

export function textLikeACoach(text: string, ctx: TicContext = {}): string {
  if (!text) return text
  const plain = text
    .replace(HEADER, '$1')
    .replace(BOLD_STARS, '$1')
    .replace(BOLD_UNDERSCORES, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
  return withoutTics(plain, ctx)
}

/** What the door needs to know about the conversation, read off the request the client sent. */
export function ticContextOf(request: unknown): TicContext {
  const r = (request && typeof request === 'object' ? request : {}) as { context?: { display_name?: unknown }; history?: unknown; message?: unknown }
  const name = typeof r.context?.display_name === 'string' ? r.context.display_name : null
  const recentCoach = Array.isArray(r.history)
    ? r.history
        .filter((t: { role?: unknown; content?: unknown }) => t && t.role === 'assistant' && typeof t.content === 'string')
        .slice(-3)
        .map((t: { content: string }) => t.content)
    : []
  return { name, recentCoach, userMessage: typeof r.message === 'string' ? r.message : null }
}

/**
 * The response the handler built, with its `reply` passed through
 * textLikeACoach. Anything that is not a JSON body with a string reply goes
 * back exactly as it came — an error, a card with no words, a preflight.
 */
export async function cleanCoachResponse(res: Response, ctx: TicContext = {}): Promise<Response> {
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('application/json')) return res
  const raw = await res.clone().text()
  let body: unknown
  try { body = JSON.parse(raw) } catch { return res }
  if (!body || typeof body !== 'object' || typeof (body as { reply?: unknown }).reply !== 'string') return res
  const reply = (body as { reply: string }).reply
  const cleaned = textLikeACoach(reply, ctx)
  if (cleaned === reply) return res
  return new Response(JSON.stringify({ ...(body as Record<string, unknown>), reply: cleaned }), {
    status: res.status,
    headers: res.headers,
  })
}
