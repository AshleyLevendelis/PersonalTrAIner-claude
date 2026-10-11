// ---------------------------------------------------------------------------
// "DID THIS FAIL BECAUSE THERE WAS NO CONNECTION?" — asked in one place.
//
// H20, 9 Oct 2026. Two things needed the same answer and would have drifted
// apart with a copy each: the set queue (a dead connection must never be a
// reason to give up on a set) and the words on the "Didn't save" card (a dead
// connection is described differently from a write the server refused).
//
// THE SUPABASE CLIENT DOES NOT THROW ON A DEAD NETWORK. It resolves with
// `{ data: null, error: { message: "TypeError: Failed to fetch", code: "" } }`
// (postgrest-js, read in the installed package), so there is no error class to
// test — only the message the browser's own fetch produced, which differs by
// engine: Chrome says "Failed to fetch", Firefox "NetworkError when attempting
// to fetch resource", Safari "Load failed". A timeout or an aborted request is
// the same situation from the queue's side: the write never landed and nothing
// is wrong with it.
//
// A REJECTION IS NEVER ONE OF THESE. A Postgres/PostgREST refusal carries a
// `code`, and anything with a code is not a connection failure whatever its
// message says.
// ---------------------------------------------------------------------------

const CONNECTION_PATTERN = /failed to fetch|networkerror|network request failed|network unavailable|load failed|fetch failed|err_network|err_internet|timed? ?out|aborted|econn|enotfound|offline/i

/** True when a failure's own text says the request never reached the server. */
export function isConnectionFailure(error: unknown): boolean {
  if (error == null) return false
  if (typeof error === 'string') return CONNECTION_PATTERN.test(error)
  const e = error as { code?: unknown; message?: unknown; name?: unknown }
  if (typeof e.code === 'string' && e.code.length > 0) return false
  if (e.name === 'AbortError') return true
  return CONNECTION_PATTERN.test(String(e.message ?? ''))
}
