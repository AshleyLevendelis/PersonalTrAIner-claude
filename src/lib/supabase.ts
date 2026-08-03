import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy client behind a Proxy so that importing this module never crashes in a
// non-Vite context (the tsx-run test scripts execute in plain Node, where
// import.meta.env is undefined). The client is only actually constructed on
// first use — by which point either Vite injected the env, or a test has
// swapped in a fake via setSupabaseClient().
let _client: SupabaseClient | null = null

/** Vite's import.meta.env in the browser, or process.env in a plain-Node tsx script — the same dual-context resolution this module already needed for the client itself, exported so other modules doing their own raw fetch() calls (meal-generation.ts's generate-meals request) don't have to duplicate it. */
export function resolveEnv(): Record<string, string> {
  return (typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string> }).env : undefined)
    ?? (globalThis as { process?: { env?: Record<string, string> } }).process?.env
    ?? {}
}

function resolveClient(): SupabaseClient {
  if (!_client) {
    const env = resolveEnv()
    _client = createClient(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_ANON_KEY ?? '')
  }
  return _client
}

/** Test seam — inject a fake client (see scripts/test-logging-roundtrip.ts). */
export function setSupabaseClient(client: SupabaseClient): void {
  _client = client
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = resolveClient()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value
  },
})
