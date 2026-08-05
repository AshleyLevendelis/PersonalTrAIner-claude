// ---------------------------------------------------------------------------
// Cleanup round, defect 2 — a chat-rendered link showed up as
// "https://https//www.youtube.com/results?..." on a real device: the model
// emitted a URL that already carried a protocol-shaped fragment ("https//",
// missing its colon) and the render path applied its own https:// on top,
// producing a link that doesn't parse and can't open. Single source of
// truth going forward: the system prompt asks the model for a BARE URL (no
// protocol at all — see chat-gemini/index.ts's system prompt), and this is
// the one place that turns a bare (or malformed-prefixed) URL into a real,
// openable link. Pure, sync — no React import, testable without a DOM.
// ---------------------------------------------------------------------------

/**
 * Strips any number of leading protocol-shaped fragments (repeats until
 * stable, so a doubled "https://https//..." collapses in one call rather
 * than needing the caller to know how many layers exist), then applies
 * exactly one https://. Returns null — never a broken href — if the result
 * still doesn't parse as a URL, so the caller can render the link text
 * plainly instead of an unopenable anchor.
 */
export function normalizeExternalUrl(rawHref: string | null | undefined): string | null {
  if (!rawHref) return null
  let stripped = rawHref.trim()
  if (!stripped) return null

  // A "protocol-shaped fragment" is a scheme name followed by ':' and/or
  // '//' — "https://", "https//" (the exact malformed shape this defect
  // reproduced with — colon dropped, slashes kept), "http:", "https:/".
  // The colon-or-double-slash requirement is load-bearing: without it this
  // would also match the start of an ordinary bare domain like
  // "www.youtube.com" (a run of [a-z0-9+.-] with zero following separators
  // is a match for an unanchored optional group), stripping real hostname
  // text instead of leaving it alone. Looping until the string stops
  // changing handles an arbitrary number of stacked fragments, not just the
  // one doubling this defect happened to surface.
  const PROTOCOL_FRAGMENT_RE = /^[a-z][a-z0-9+.-]*(?::\/{0,2}|\/\/)/i
  for (;;) {
    const next = stripped.replace(PROTOCOL_FRAGMENT_RE, '')
    if (next === stripped) break
    stripped = next
  }
  if (!stripped) return null

  try {
    return new URL(`https://${stripped}`).href
  } catch {
    return null
  }
}
