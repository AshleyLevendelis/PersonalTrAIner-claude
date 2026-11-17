// SUGGESTED STARTERS ON AN EMPTY CHAT (17 Nov 2026, the chat review, his "Build it all"). A chat with nothing but the
// coach's greeting gave no hint of what to ask. Four taps, each something the coach does with this person's own plan,
// sent as his words when tapped. Shown only until he has said anything, and never over chips the greeting brought.
export const CHAT_STARTERS = [
  "What's my session today?",
  'What should I eat today?',
  "How's my week going?",
  'Swap an exercise for me',
] as const

export function chatStarters(messages: readonly { role: string; quickReplies?: string[] }[]): string[] {
  const last = messages[messages.length - 1]
  const own = last && last.role === 'assistant' ? last.quickReplies ?? [] : []
  // Once he has said anything, the coach's own chips are the only ones (an empty list stays empty).
  if (own.length > 0 || messages.some(m => m.role === 'user')) return own
  return [...CHAT_STARTERS]
}
