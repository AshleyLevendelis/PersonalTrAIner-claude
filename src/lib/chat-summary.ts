// ---------------------------------------------------------------------------
// THE COACH REMEMBERS OLDER CHATS (17 Nov 2026, the chat review, his "Build it all"). The coach is sent the last 20
// messages and nothing before them, so last week's "my knee's been sore on lunges" was gone by Thursday. Now the app
// keeps a running SUMMARY of what has dropped out of that window, written by a short coach call and CHECKED here
// before it is kept, and sends it with every message.
//
// What a summary may hold (mine, and the app's standing rules): what he said and what was decided or suggested, in
// short lines. It must not add a number that is in none of the messages it summarises (or the summary before it), and
// it never carries a clinical label he did not use himself (the 7 Nov save-note rule). A summary that fails is not
// kept; the previous one stands. Stored on the phone first, and on his profile when the column exists.
// ---------------------------------------------------------------------------

/** The window the coach is sent word for word (chat-gemini trims history to the same 20). */
export const CHAT_WINDOW = 20
/** How many messages must have left the window before a new summary is written (one short call per ~5 exchanges). */
export const SUMMARISE_EVERY = 10
/** The longest summary kept: enough for a few weeks of what matters, small beside the coach's instructions. */
export const SUMMARY_MAX_CHARS = 1200

export interface ChatSummary {
  /** The summary text, short lines. */
  text: string
  /** The created_at of the newest message it covers (ISO). Messages at or before this are in it. */
  through: string
}

export interface SummarisableMessage { role: string; content: string; created_at?: string; status?: string }

/**
 * The messages that have LEFT the coach's window and are not yet in the summary, oldest first; empty until there are
 * at least SUMMARISE_EVERY of them, so a summary is written in batches rather than on every message.
 */
export function messagesToSummarise(messages: readonly SummarisableMessage[], summary: ChatSummary | null): SummarisableMessage[] {
  const done = messages.filter(m => (m.status === 'complete' || m.status === undefined) && m.content.trim() && m.created_at)
  if (done.length <= CHAT_WINDOW) return []
  const outside = done.slice(0, done.length - CHAT_WINDOW)
  const fresh = summary ? outside.filter(m => (m.created_at as string) > summary.through) : outside
  return fresh.length >= SUMMARISE_EVERY ? fresh : []
}

const NUMBER_RE = /\d+(?:[.,]\d+)?/g
/** Words a summary may not put on him unless he used them himself (the 7 Nov "never a clinical label" rule). */
const CLINICAL = /\b(?:disorder|disordered|depress(?:ed|ion)|anxiety|anorexi\w*|bulimi\w*|binge|obes(?:e|ity)|diagnos\w*|tendinitis|tendonitis|arthritis|sciatica|syndrome|addict\w*)\b/gi

/** Why a summary may not be kept, or null when it may. */
export function summaryProblem(candidate: string, sources: readonly string[], previous: string | null): string | null {
  const text = candidate.trim()
  if (!text) return 'empty'
  if (text.length > SUMMARY_MAX_CHARS) return 'too long'
  const allowed = [...sources, previous ?? ''].join('\n')
  const said = new Set((allowed.match(NUMBER_RE) ?? []).map(n => n.replace(',', '.')))
  const invented = (text.match(NUMBER_RE) ?? []).filter(n => !said.has(n.replace(',', '.')))
  if (invented.length > 0) return `a number not in the messages (${invented[0]})`
  const labels = new Set((allowed.match(CLINICAL) ?? []).map(w => w.toLowerCase()))
  const label = (text.match(CLINICAL) ?? []).find(w => !labels.has(w.toLowerCase()))
  if (label) return `a label he did not use (${label})`
  return null
}

/** The summary to keep after a coach call: the new one when it passes, else the previous one unchanged. */
export function nextSummary(candidate: string | null, batch: readonly SummarisableMessage[], previous: ChatSummary | null): { summary: ChatSummary | null; kept: boolean; problem: string | null } {
  const through = batch[batch.length - 1]?.created_at
  if (!candidate || !through) return { summary: previous, kept: false, problem: 'no summary came back' }
  const problem = summaryProblem(candidate, batch.map(m => m.content), previous?.text ?? null)
  if (problem) return { summary: previous, kept: false, problem }
  return { summary: { text: candidate.trim(), through }, kept: true, problem: null }
}

// --- storage: the phone first (works before the profile column exists), the profile when it does -----------------

const key = (profileId: string) => `fitplan_chat_summary_v1:${profileId}`

export function loadChatSummary(profileId: string | undefined, fromProfile?: unknown): ChatSummary | null {
  const parse = (v: unknown): ChatSummary | null => {
    const o = typeof v === 'string' ? (() => { try { return JSON.parse(v) } catch { return null } })() : v
    return o && typeof o === 'object' && typeof (o as ChatSummary).text === 'string' && typeof (o as ChatSummary).through === 'string' ? o as ChatSummary : null
  }
  let local: ChatSummary | null = null
  try { if (profileId && typeof localStorage !== 'undefined') local = parse(localStorage.getItem(key(profileId))) } catch { /* private mode */ }
  const remote = parse(fromProfile)
  if (local && remote) return local.through >= remote.through ? local : remote
  return local ?? remote
}

export function saveChatSummaryLocally(profileId: string, summary: ChatSummary | null): void {
  try {
    if (summary) localStorage.setItem(key(profileId), JSON.stringify(summary))
    else localStorage.removeItem(key(profileId))
  } catch { /* quota or private mode: the summary is rebuilt from the next batch */ }
}
