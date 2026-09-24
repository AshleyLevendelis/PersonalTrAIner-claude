// ---------------------------------------------------------------------------
// The push key pair the coach-reach-out function signs notifications with.
//
// Run ONCE per project, on Ashley's machine, and hand the output straight to
// `supabase secrets set` — the private half must never be committed, pasted
// into a chat, or put anywhere a browser can read. See the handover prompt.
//
// Same format as jsr:@negrel/webpush's own generate-vapid-keys (JWK pair,
// ECDSA P-256), produced with Node's built-in WebCrypto so no Deno is needed:
//   node scripts/generate-vapid-keys.mjs
// prints the JSON on stdout and the public "application server key" on stderr.
// ---------------------------------------------------------------------------
const { subtle } = globalThis.crypto
const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwks = {
  publicKey: await subtle.exportKey('jwk', keys.publicKey),
  privateKey: await subtle.exportKey('jwk', keys.privateKey),
}
const raw = Buffer.from(await subtle.exportKey('raw', keys.publicKey)).toString('base64url')
console.log(JSON.stringify(jwks))
console.error(`application server key (public, safe to share): ${raw}`)
