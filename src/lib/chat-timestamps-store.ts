// ---------------------------------------------------------------------------
// "Show times in chat" — the one setting the grouped-bubbles chat added
// (design handoff, 3 Sep 2026: `chatTimestamps: boolean`, default false, a
// 10px time under each run). Per-profile and stored exactly the way
// reveal-speed-store.ts stores its preference, for the same reason: it is a
// taste preference tied to the person, not the device.
// ---------------------------------------------------------------------------

export const DEFAULT_CHAT_TIMESTAMPS = false

function storageKey(profileId: string): string {
  return `fitplan_chat_timestamps_v1:${profileId}`
}

export function getChatTimestamps(profileId: string | undefined): boolean {
  if (!profileId || typeof localStorage === 'undefined') return DEFAULT_CHAT_TIMESTAMPS
  try {
    const raw = localStorage.getItem(storageKey(profileId))
    return raw === '1' ? true : raw === '0' ? false : DEFAULT_CHAT_TIMESTAMPS
  } catch {
    return DEFAULT_CHAT_TIMESTAMPS
  }
}

export function saveChatTimestamps(profileId: string, on: boolean): void {
  try {
    localStorage.setItem(storageKey(profileId), on ? '1' : '0')
  } catch {
    // Quota/private-mode failures are non-fatal — the in-memory state still drives this session.
  }
}
