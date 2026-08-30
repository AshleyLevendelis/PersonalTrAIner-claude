// ---------------------------------------------------------------------------
// A CEILING ON WHAT THE AI FUNCTIONS CAN COST — audit §1.3.
//
// The four edge functions are gated by exactly one thing: a valid key. The
// only key is the anon key, which ships inside the app's JavaScript because
// it has to. So anyone who opens the app and copies one string can call the
// coach in a loop, and there was no rate limit, per-user quota or spend cap
// anywhere. The exposure is a bill rather than data, but it is an uncapped
// bill on Ashley's account.
//
// TWO LAYERS, DELIBERATELY, because they fail in opposite directions.
//
//   BURST (in-memory, always on, no storage). A short sliding window per
//   caller, held in the isolate. It needs nothing to work, so it is still
//   standing when the database is slow or down — which is exactly when a
//   storage-backed limiter would be failing open. It does not survive a cold
//   start and is per-instance, so it is a speed bump, not an accountant.
//
//   DAILY (durable, per-profile and global). The actual ceiling. Counted
//   through one atomic Postgres function so two concurrent requests cannot
//   both read "99" and both proceed.
//
// FAIL-OPEN, ON PURPOSE, AND ONLY FOR THE DAILY LAYER. If the counter store
// is unreachable the request goes through. The alternative — refusing every
// request whenever a count can't be read — turns a transient database blip
// into "your coach is broken" for every paying user at once, which is a
// worse outcome than one uncounted day of spend. The burst layer keeps
// working regardless, so failing open is not the same as no protection.
//
// The daily layer is a no-op until the ai_usage_daily migration is applied.
// That is intentional: this ships useful on its own, rather than waiting on
// a production migration to be run before ANY cap exists.
// ---------------------------------------------------------------------------

export interface SpendCapConfig {
  /** Which function is asking — counted separately so one runaway surface is visible on its own. */
  functionName: string
  /** Bytes. A body over this is refused before any model call, and before parsing. */
  maxBodyBytes: number
  /** In-memory sliding window. */
  burstWindowMs: number
  burstMax: number
  /** Durable per-caller daily ceiling. */
  dailyPerCaller: number
  /** Durable ceiling across every caller — the number that actually bounds the bill. */
  dailyGlobal: number
}

/** Sensible defaults per surface. The chat is conversational and gets more headroom than a one-shot generator. */
export const CHAT_CAP: SpendCapConfig = {
  functionName: 'chat-gemini',
  maxBodyBytes: 256 * 1024,
  burstWindowMs: 60_000,
  burstMax: 20,
  dailyPerCaller: 300,
  dailyGlobal: 20_000,
}

export const ONBOARDING_CAP: SpendCapConfig = {
  functionName: 'onboarding-chat',
  maxBodyBytes: 128 * 1024,
  burstWindowMs: 60_000,
  burstMax: 25,
  // Onboarding happens once. A caller sending hundreds of turns is not
  // onboarding, whatever else they are doing.
  dailyPerCaller: 200,
  dailyGlobal: 10_000,
}

export const MEALS_CAP: SpendCapConfig = {
  functionName: 'generate-meals',
  maxBodyBytes: 64 * 1024,
  burstWindowMs: 60_000,
  burstMax: 8,
  dailyPerCaller: 60,
  dailyGlobal: 5_000,
}

export const CALIBRATION_CAP: SpendCapConfig = {
  functionName: 'macro-calibration',
  maxBodyBytes: 64 * 1024,
  burstWindowMs: 60_000,
  burstMax: 15,
  dailyPerCaller: 150,
  dailyGlobal: 8_000,
}

// --- burst layer -----------------------------------------------------------

const hits = new Map<string, number[]>()

function burstExceeded(key: string, windowMs: number, max: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs
  const recent = (hits.get(key) ?? []).filter(t => t > cutoff)
  recent.push(now)
  hits.set(key, recent)
  // The map is per-isolate and isolates are recycled, but a long-lived one
  // serving many callers would otherwise grow without bound.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every(t => t <= cutoff)) hits.delete(k)
    }
  }
  return recent.length > max
}

// --- daily layer -----------------------------------------------------------

/**
 * Increments and reads back today's count in ONE atomic statement.
 *
 * Read-then-write would let two concurrent requests both see the number
 * below the cap and both proceed, which is precisely the shape of traffic a
 * cap exists to stop.
 */
async function incrementDaily(
  supabaseUrl: string,
  serviceKey: string,
  scopeKey: string,
  functionName: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/increment_ai_usage`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_scope: scopeKey, p_function: functionName }),
    })
    if (!res.ok) return null // migration not applied yet, or the store is down
    const value = await res.json()
    return typeof value === 'number' ? value : null
  } catch {
    return null
  }
}

// --- the one entry point ---------------------------------------------------

export interface SpendCapResult {
  /** A ready-to-return 4xx when the caller is over a limit, or null to proceed. */
  response: Response | null
}

/**
 * Call once, first thing in the handler, before reading the body.
 *
 * `callerId` should be the profile id where one exists. Onboarding has no
 * profile yet, so it falls back to the forwarded client IP — imperfect
 * (shared networks, proxies) which is why the onboarding limits are the
 * loosest of the four.
 */
export async function checkSpendCap(
  req: Request,
  config: SpendCapConfig,
  corsHeaders: Record<string, string>,
  callerId?: string,
): Promise<SpendCapResult> {
  const deny = (status: number, error: string, retryAfterSeconds?: number) => ({
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        ...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}),
      },
    }),
  })

  // 1. Size, from the header — refused before the body is even read, so an
  //    enormous payload costs nothing to reject.
  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (declaredLength > config.maxBodyBytes) {
    return deny(413, 'That request is too large.')
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const scopeKey = callerId ? `profile:${callerId}` : `ip:${ip}`

  // 2. Burst — no storage, so this is the layer that still works when the
  //    database does not.
  if (burstExceeded(`${config.functionName}:${scopeKey}`, config.burstWindowMs, config.burstMax)) {
    return deny(429, "That's a lot of requests at once — give it a moment and try again.",
      Math.ceil(config.burstWindowMs / 1000))
  }

  // 3. Daily. Absent migration or unreachable store => null => allowed, see
  //    the module comment on why this direction is the right one.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return { response: null }

  const callerCount = await incrementDaily(supabaseUrl, serviceKey, scopeKey, config.functionName)
  if (callerCount != null && callerCount > config.dailyPerCaller) {
    return deny(429, "You've hit today's limit for this — it resets tomorrow.")
  }

  const globalCount = await incrementDaily(supabaseUrl, serviceKey, 'global', config.functionName)
  if (globalCount != null && globalCount > config.dailyGlobal) {
    // Deliberately NOT "you've used too much" — the user has done nothing
    // wrong, and blaming them for a service-wide ceiling would be a lie.
    return deny(503, 'This is temporarily unavailable — try again later.')
  }

  return { response: null }
}
