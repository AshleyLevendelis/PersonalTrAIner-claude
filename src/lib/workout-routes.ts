// ---------------------------------------------------------------------------
// THE ROUTE OF A WALK, JOG OR RUN RECORDED ON THE WATCH (his request 28 Nov 2026: "While recording a jog run or walk the
// watch should record your location and map out your journey"; his ruling "Save the route": kept with the workout,
// his alone, deleted with "Delete route" or with his account). Migration 20261128120000.
//
// The watch sends its GPS points every half minute while he is on foot ("route" events, WorkoutService.java), each
// [ms, lat, lng] at five decimal places, one only once he has moved about five metres. They are kept on the phone first
// (a run with the phone in a locker, a database before the migration) and saved whole to the route's row each time; a
// route is found again by its activity and the watch's own start, which the logged walk carries as started_at.
// Where he lives is in these points, so nothing here is ever logged, sent to the coach or shown to anyone else. The
// streets under the line (his ruling "Streets, OpenStreetMap") are fetched as map squares by area, never by route.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'

export type RoutePoint = [number, number, number] // [ms, lat, lng]

export interface WorkoutRoute {
  activity: string
  startedAt: number // ms, the watch's own start
  date: string
  points: RoutePoint[]
}

const STORE = 'fitplan_routes_v1'
/** Two minutes either side: the start the watch sent and the one on the log are the same instant, give or take a sync. */
const SAME_START_MS = 120_000
const listeners = new Set<() => void>()

const isPoint = (p: unknown): p is RoutePoint => Array.isArray(p) && p.length === 3
  && p.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(p[1]) <= 90 && Math.abs(p[2]) <= 180
  && !(p[1] === 0 && p[2] === 0)

function readStore(): WorkoutRoute[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '[]')
    return Array.isArray(v) ? v.filter((r): r is WorkoutRoute => !!r && typeof r.activity === 'string' && typeof r.startedAt === 'number' && Array.isArray(r.points)) : []
  } catch { return [] }
}
function writeStore(routes: WorkoutRoute[]): void {
  // The newest thirty routes only: the database holds the rest.
  try { localStorage.setItem(STORE, JSON.stringify(routes.slice(-30))) } catch { /* the database still has it */ }
}

const rowId = (profileId: string, r: Pick<WorkoutRoute, 'activity' | 'startedAt'>) => `${profileId}:${r.startedAt}:${r.activity}`

/** A route from the watch: added to the kept route of the same workout (oldest first, each time once), then saved. */
export async function noteWatchRoute(profileId: string, e: Record<string, unknown>): Promise<boolean> {
  const startedAt = typeof e.startedAt === 'number' && Number.isFinite(e.startedAt) ? e.startedAt : null
  const activity = typeof e.activity === 'string' && e.activity ? e.activity : null
  const date = typeof e.date === 'string' ? e.date : null
  const incoming = Array.isArray(e.points) ? (e.points as unknown[]).filter(isPoint) : []
  if (startedAt == null || !activity || !date || incoming.length === 0) return false
  const routes = readStore()
  let route = routes.find(r => r.activity === activity && r.startedAt === startedAt)
  if (!route) { route = { activity, startedAt, date, points: [] }; routes.push(route) }
  const seen = new Set(route.points.map(p => p[0]))
  for (const p of incoming) if (!seen.has(p[0])) { route.points.push(p); seen.add(p[0]) }
  route.points.sort((a, b) => a[0] - b[0])
  writeStore(routes)
  listeners.forEach(l => l())
  try {
    const { error } = await supabase.from('workout_routes').upsert({
      id: rowId(profileId, route), user_id: profileId, activity, started_at: new Date(startedAt).toISOString(), date,
      points: route.points, updated_at: new Date().toISOString(),
    })
    return !error
  } catch { return false }
}

/** The route of a logged workout: the phone's copy, else the database's. Null when there is none (under two points). */
export async function readRoute(profileId: string, activity: string, startedAtIso: string): Promise<WorkoutRoute | null> {
  const start = Date.parse(startedAtIso)
  if (!Number.isFinite(start)) return null
  const local = readStore().find(r => r.activity === activity && Math.abs(r.startedAt - start) < SAME_START_MS)
  if (local && local.points.length >= 2) return local
  try {
    const { data, error } = await supabase.from('workout_routes').select('*').eq('user_id', profileId)
      .gte('started_at', new Date(start - SAME_START_MS).toISOString()).lte('started_at', new Date(start + SAME_START_MS).toISOString())
    if (error || !Array.isArray(data)) return null
    const row = (data as { activity?: string; started_at?: string; date?: string; points?: unknown }[]).find(r => r.activity === activity)
    const points = Array.isArray(row?.points) ? (row!.points as unknown[]).filter(isPoint) : []
    return row && points.length >= 2 ? { activity, startedAt: Date.parse(row.started_at ?? '') || start, date: row.date ?? '', points } : null
  } catch { return null }
}

/** "Delete route": gone from the phone and the database; the walk itself stays logged. True once the database agrees. */
export async function deleteRoute(profileId: string, route: Pick<WorkoutRoute, 'activity' | 'startedAt'>): Promise<boolean> {
  writeStore(readStore().filter(r => !(r.activity === route.activity && Math.abs(r.startedAt - route.startedAt) < SAME_START_MS)))
  // The screens are told only once the database has answered: told before, a map re-reads the row still there and
  // draws the route straight back (found by verify:watch-sets 8c, 28 Nov 2026).
  try {
    const { error } = await supabase.from('workout_routes').delete().eq('user_id', profileId).eq('activity', route.activity)
      .gte('started_at', new Date(route.startedAt - SAME_START_MS).toISOString()).lte('started_at', new Date(route.startedAt + SAME_START_MS).toISOString())
    return !error
  } catch { return false } finally { listeners.forEach(l => l()) }
}

export function subscribeRoutes(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** Metres between two points (haversine). */
function metresBetween(a: RoutePoint, b: RoutePoint): number {
  const R = 6_371_000, rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad, dLng = (b[2] - a[2]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The route's length in kilometres, along its points. */
export function routeKm(points: RoutePoint[]): number {
  let m = 0
  for (let i = 1; i < points.length; i++) m += metresBetween(points[i - 1], points[i])
  return m / 1000
}

/** One OpenStreetMap map square, placed in the box. */
interface MapTile { url: string; x: number; y: number; size: number }

/** The map squares come from OpenStreetMap (his ruling 28 Nov 2026, "Streets, OpenStreetMap"). */
const TILE_HOST = 'https://tile.openstreetmap.org'
const TILE = 256

/** A point's place on the Web Mercator world at `zoom`, in map pixels (the projection every street map uses). */
function worldPx(lat: number, lng: number, zoom: number): [number, number] {
  const n = TILE * 2 ** zoom
  const s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180)
  return [(lng + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]
}

/**
 * The route laid on a street map in a w x h box with `pad` around it: the closest zoom (up to 17) at which the whole
 * route fits, centred, north up, the line and its two ends in the box's own units, and the map squares that cover the
 * box. A square's address names only its zoom and place on the grid, so OpenStreetMap is asked for an area of the
 * map, never sent the route, the time or who is asking.
 */
export function mapLayout(points: RoutePoint[], w: number, h: number, pad = 14): {
  zoom: number; tiles: MapTile[]; line: string; start: [number, number]; end: [number, number]
} | null {
  if (points.length < 2) return null
  let zoom = 17
  let px: [number, number][] = []
  for (; zoom >= 2; zoom--) {
    px = points.map(p => worldPx(p[1], p[2], zoom))
    const xs = px.map(p => p[0]), ys = px.map(p => p[1])
    if (Math.max(...xs) - Math.min(...xs) <= w - 2 * pad && Math.max(...ys) - Math.min(...ys) <= h - 2 * pad) break
  }
  const xs = px.map(p => p[0]), ys = px.map(p => p[1])
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2, oy = (Math.min(...ys) + Math.max(...ys)) / 2 - h / 2
  const at = (p: [number, number]): [number, number] => [+(p[0] - ox).toFixed(1), +(p[1] - oy).toFixed(1)]
  const out = px.map(at)
  const tiles: MapTile[] = []
  const count = 2 ** zoom
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + h) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
      const wx = ((tx % count) + count) % count
      tiles.push({ url: `${TILE_HOST}/${zoom}/${wx}/${ty}.png`, x: +(tx * TILE - ox).toFixed(1), y: +(ty * TILE - oy).toFixed(1), size: TILE })
    }
  }
  return { zoom, tiles, line: out.map(p => `${p[0]},${p[1]}`).join(' '), start: out[0], end: out[out.length - 1] }
}
