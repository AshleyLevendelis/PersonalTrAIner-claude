// ---------------------------------------------------------------------------
// Synchronous, same-tick mirror of the visible chat — written on every
// `messages` state change in ChatAssistant. Exists because the Supabase
// persistence (chat_messages table, insert/update) is fire-and-forget: a
// user tapping a chat-suggested external link can background or get the tab
// discarded by the OS before that network write lands, so a reload restores
// stale/incomplete server state — the assistant's just-sent reply (and
// whatever it was about) silently vanishes. localStorage writes complete
// synchronously in the same tick as the state update, so this can never be
// behind what the user actually saw on screen.
// ---------------------------------------------------------------------------

import type { ChatMessage } from './types'

const CHAT_CACHE_PREFIX = "chat_history_cache_"
const MAX_CACHED_MESSAGES = 50

function cacheKey(profileId: string): string {
  return `${CHAT_CACHE_PREFIX}${profileId}`
}

export function saveChatCache(profileId: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(cacheKey(profileId), JSON.stringify(messages.slice(-MAX_CACHED_MESSAGES)))
  } catch {
    // localStorage full/unavailable/private-browsing — the Supabase-backed
    // history is still the fallback, just without the same-tick guarantee.
  }
}

export function loadChatCache(profileId: string): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

export function clearChatCache(profileId: string): void {
  try {
    localStorage.removeItem(cacheKey(profileId))
  } catch {
    // ignore
  }
}
