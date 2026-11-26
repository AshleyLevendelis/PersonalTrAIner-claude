// ---------------------------------------------------------------------------
// LIVE HEART RATE FROM A BLUETOOTH STRAP (his "then start working on 3", 24 Nov 2026; docs/plans/live-heart-rate.md).
// This file is the pure half: reading the strap's bytes and keeping a session's readings. No Bluetooth here, so it runs
// in every gate; the plugin is loaded only in the phone app, by the adapter.
//
// The standard every chest strap and broadcasting watch speaks: Heart Rate Service 0x180D, Heart Rate Measurement
// 0x2A37. Its first byte is flags: bit 0 set means the value is two bytes (little-endian), else one; bits 1-2 are the
// sensor contact state (bit 2 says contact is reported, bit 1 says it is in contact). A strap reporting "no contact"
// is sending a number it cannot stand behind, so that reading is dropped.
//
// NOTHING IS PRESCRIBED BY IT (CSCS, mine, and his rulings that effort is in words): the live number is shown, never
// judged.
// ---------------------------------------------------------------------------


export const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb'
export const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb'

const isPlausibleBpm = (n: number) => Number.isFinite(n) && n >= 30 && n <= 230

export interface HeartSummary { avg: number; max: number; readings: number }

/** The average and highest heart rate between two instants, or null with fewer than three believable readings. The
 *  one rule for a session's figure, from a watch (health-heart.ts) or this strap. */
export function summariseHeartRate(samples: { bpm: number; at: string }[], start: Date, end: Date): HeartSummary | null {
  const s = start.getTime(), e = end.getTime()
  const inside = samples.filter(x => isPlausibleBpm(x.bpm) && Date.parse(x.at) >= s && Date.parse(x.at) <= e).map(x => x.bpm)
  if (inside.length < 3) return null
  const avg = Math.round(inside.reduce((a, b) => a + b, 0) / inside.length)
  return { avg, max: Math.round(Math.max(...inside)), readings: inside.length }
}

/** One Heart Rate Measurement notification, or null when it carries nothing to believe. */
export function parseHeartRateMeasurement(value: DataView): number | null {
  if (value.byteLength < 2) return null
  const flags = value.getUint8(0)
  const sixteen = (flags & 0x01) !== 0
  if (sixteen && value.byteLength < 3) return null
  const contactReported = (flags & 0x04) !== 0
  const inContact = (flags & 0x02) !== 0
  if (contactReported && !inContact) return null
  const bpm = sixteen ? value.getUint16(1, true) : value.getUint8(1)
  return isPlausibleBpm(bpm) ? bpm : null
}

/**
 * A session's readings, held on the phone only while it runs: at most one a second (a strap notifies about once a
 * second, some faster), and the summary the session keeps when it is saved, worked out by option 1's own rule so the
 * two sources cannot disagree about what a figure means.
 */
export class StrapReadings {
  private samples: { bpm: number; at: string }[] = []
  private lastAt = 0

  add(bpm: number, at: Date = new Date()): void {
    const t = at.getTime()
    if (!isPlausibleBpm(bpm) || t - this.lastAt < 1000) return
    this.lastAt = t
    this.samples.push({ bpm: Math.round(bpm), at: at.toISOString() })
  }

  /**
   * A reading that may be older than the newest held (the watch app's batch that waited while the phone was out of
   * reach, 27 Nov 2026): filed at its own time, in order, never within a second of one already held.
   */
  insert(bpm: number, at: Date): void {
    const t = at.getTime()
    if (!isPlausibleBpm(bpm) || !Number.isFinite(t)) return
    if (t >= this.lastAt + 1000) { this.add(bpm, at); return }
    let i = this.samples.length
    while (i > 0 && Date.parse(this.samples[i - 1].at) > t) i--
    const near = (j: number) => j >= 0 && j < this.samples.length && Math.abs(Date.parse(this.samples[j].at) - t) < 1000
    if (near(i - 1) || near(i)) return
    this.samples.splice(i, 0, { bpm: Math.round(bpm), at: at.toISOString() })
  }

  get count(): number { return this.samples.length }

  /** The average and highest between two instants (a log's own time), or null with fewer than three readings. */
  summary(start: Date, end: Date): HeartSummary | null {
    return summariseHeartRate(this.samples, start, end)
  }

  /** Every reading held, oldest first (a copy). */
  all(): { bpm: number; at: string }[] { return [...this.samples] }

  /** Readings older than `t` go: once every session that could use them has its figure. */
  dropBefore(t: Date): void {
    const cut = t.getTime()
    this.samples = this.samples.filter(s => Date.parse(s.at) >= cut)
  }

  clear(): void { this.samples = []; this.lastAt = 0 }
}
