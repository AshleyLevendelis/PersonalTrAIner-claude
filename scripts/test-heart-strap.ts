// test:heart-strap — LIVE HEART RATE FROM A STRAP, the pure half (docs/plans/live-heart-rate.md, src/lib/heart-strap.ts).
// 1. the bytes: an 8-bit and a 16-bit reading, contact reported and lost, a short packet, an impossible number;
// 2. a session's readings: one a second at most, the summary by option 1's own rule, cleared after;
// 3. nothing judges the number.
import { readFileSync } from 'fs'
import { parseHeartRateMeasurement, StrapReadings, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT } from '../src/lib/heart-strap'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const dv = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)
// A short packet must come back null, never throw (a throw inside a notification stops the live number).
const safe = (v: DataView): number | null | 'threw' => { try { return parseHeartRateMeasurement(v) } catch { return 'threw' } }

console.log('\n1. The bytes')
check('an 8-bit reading (flags 0x00): 72', parseHeartRateMeasurement(dv(0x00, 72)) === 72)
check('a 16-bit reading (flags 0x01) is little-endian: 0x9A 0x00 is 154, not 39424', parseHeartRateMeasurement(dv(0x01, 0x9a, 0x00)) === 154)
check('a 16-bit reading above 255 is read whole (flags 0x01, 0x04 0x01 is 260, dropped as impossible; 0xC8 0x00 is 200)',
  parseHeartRateMeasurement(dv(0x01, 0x04, 0x01)) === null && parseHeartRateMeasurement(dv(0x01, 0xc8, 0x00)) === 200)
check('contact reported and in contact (flags 0x06): kept', parseHeartRateMeasurement(dv(0x06, 140)) === 140)
check('contact reported and LOST (flags 0x04): dropped', parseHeartRateMeasurement(dv(0x04, 140)) === null)
check('contact not reported at all (flags 0x02 alone): kept, the strap makes no claim', parseHeartRateMeasurement(dv(0x02, 140)) === 140)
check('extra fields after the value (energy, RR intervals, flags 0x18) do not move it', parseHeartRateMeasurement(dv(0x18, 130, 0x10, 0x00, 0x20, 0x03)) === 130)
check('a short packet is nothing: one byte, or a 16-bit flag with one value byte', safe(dv(0x00)) === null && safe(dv(0x01, 0x90)) === null, [safe(dv(0x00)), safe(dv(0x01, 0x90))])
check('an impossible number is nothing (0 and 20)', parseHeartRateMeasurement(dv(0x00, 0)) === null && parseHeartRateMeasurement(dv(0x00, 20)) === null)
check('the standard service and characteristic', HEART_RATE_SERVICE.startsWith('0000180d') && HEART_RATE_MEASUREMENT.startsWith('00002a37'))

console.log('\n2. A session\'s readings')
const r = new StrapReadings()
const t0 = Date.parse('2026-11-24T10:00:00Z')
for (let i = 0; i < 60; i++) r.add(140 + (i % 10), new Date(t0 + i * 500)) // a strap notifying twice a second
check('at most one reading a second (60 notifications over 30s keep 30)', r.count === 30, r.count)
r.add(400, new Date(t0 + 40000))
check('an impossible number is never kept', r.count === 30)
const s = r.summary(new Date(t0), new Date(t0 + 30000))
check('the summary is option 1\'s rule over the session\'s own time', !!s && s.max === 148 && s.avg >= 142 && s.avg <= 146 && s.readings === 30, s)
check('readings outside the time asked are not counted', r.summary(new Date(t0 + 60000), new Date(t0 + 90000)) === null)
r.clear()
check('cleared after the session is saved', r.count === 0)

console.log('\n3. Nothing judges the number')
const src = readFileSync('src/lib/heart-strap.ts', 'utf8').replace(/\/\/.*$/gm, '')
check('no zone, target or "too high" in the strap code', !/\b(zone|target|too high|too low|max heart|% of)/i.test(src))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('test:heart-strap passed: a strap\'s bytes are read as the standard says, kept one a second, never judged.')
