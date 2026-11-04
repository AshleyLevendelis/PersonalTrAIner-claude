// ---------------------------------------------------------------------------
// THE NEAR-COPY TABLE, FETCHED WHEN NEEDED (4 Nov 2026). ~860 log-only names (her ruling "Searchable, log-only") are
// their own chunk: the app starts the fetch once it has opened, and the logging box waits for it, so first paint never
// carries them. One promise for everybody, so the table is fetched once.
// ---------------------------------------------------------------------------
import { registerNearCopies } from './exercise-db'

let loading: Promise<void> | null = null

export function ensureNearCopies(): Promise<void> {
  loading ??= import('./exercise-near-copies')
    .then(m => registerNearCopies(m.NEAR_COPIES))
    // A failed fetch (offline on a first open) is retried next time anything asks, never cached as done.
    .catch(() => { loading = null })
  return loading
}
