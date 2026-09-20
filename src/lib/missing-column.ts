// ---------------------------------------------------------------------------
// A DATABASE THAT HAS NOT RUN THE MIGRATION YET
// ---------------------------------------------------------------------------
// Migrations here are applied by hand, on another machine, at a time the
// deployed client cannot know (CLAUDE.md: db:push-both needs a typed phrase
// and a terminal). So there is no deploy order that guarantees the column a
// payload names already exists, and a client that assumes it does is one
// unapplied migration away from a dead feature.
//
// PostgREST resolves column names against its schema cache at PARSE time, so
// naming an unknown column is rejected whichever operator follows it — in a
// select, in an insert, in a filter. That is why reads here use `select('*')`
// and map fields in JS rather than naming the new column: `*` needs no column
// to exist, and `row.newCol ?? fallback` reads correctly on both sides of the
// migration. Writes cannot do that (a payload key IS the column name), so
// they retry once without the key.
//
// The shape of the error, which is the whole reason this file exists rather
// than the check being inlined twice: PostgREST reports a missing column as
// PGRST204 with the column named in the message, but older/other paths report
// it as a plain message mentioning the column and the schema cache. Matching
// only the code misses half of them.
// ---------------------------------------------------------------------------

/** True when `error` is the database saying it has never heard of `column`. */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string): boolean {
  if (!error) return false
  const msg = String(error.message ?? '')
  return error.code === 'PGRST204' || (msg.includes(column) && /column|schema cache/i.test(msg))
}
