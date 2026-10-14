import type { LonLat, PlannedRoute } from '../api/types'

const R = 6371008.8
const toRad = (d: number) => (d * Math.PI) / 180

export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function cumulativeMiles(coords: LonLat[]): number[] {
  const out = [0]
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversineM(coords[i - 1], coords[i]) / 1609.344)
  return out
}

function locate(cum: number[], target: number): [number, number] {
  if (target <= 0) return [0, 0]
  if (target >= cum[cum.length - 1]) return [cum.length - 2, 1]
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= target) lo = mid
    else hi = mid
  }
  const span = cum[hi] - cum[lo]
  return [lo, span === 0 ? 0 : (target - cum[lo]) / span]
}

const lerp = (a: LonLat, b: LonLat, t: number): LonLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Per-route geometry index: display geometry is simplified, so distances are rescaled to the true length. */
export interface RouteIndex {
  coords: LonLat[]
  cum: number[] // miles, rescaled so the last entry equals route.distance_mi
}

export function indexRoute(route: PlannedRoute): RouteIndex {
  const raw = cumulativeMiles(route.geometry)
  const k = raw[raw.length - 1] > 0 ? route.distance_mi / raw[raw.length - 1] : 1
  return { coords: route.geometry, cum: raw.map((v) => v * k) }
}

export function pointAtMile(idx: RouteIndex, mile: number): LonLat {
  const [i, t] = locate(idx.cum, mile)
  return lerp(idx.coords[i], idx.coords[i + 1], t)
}

/** Slice the polyline between two mileages (inclusive of interpolated endpoints). */
export function sliceByMiles(idx: RouteIndex, from: number, to: number): LonLat[] {
  const [i0, t0] = locate(idx.cum, from)
  const [i1, t1] = locate(idx.cum, to)
  const out: LonLat[] = [lerp(idx.coords[i0], idx.coords[i0 + 1], t0)]
  for (let i = i0 + 1; i <= i1; i++) out.push(idx.coords[i])
  out.push(lerp(idx.coords[i1], idx.coords[i1 + 1], t1))
  return out
}

/**
 * Where is the truck at `ts`? Uses the checkpoint ETA table (piecewise-linear
 * in time) so the marker agrees with the ETAs shown in the UI.
 */
export function positionAtTime(route: PlannedRoute, idx: RouteIndex, ts: number): { point: LonLat; mile: number } | null {
  const cps = route.checkpoints
  if (ts < cps[0].eta || ts > cps[cps.length - 1].eta) return null
  for (let i = 0; i < cps.length - 1; i++) {
    const a = cps[i]
    const b = cps[i + 1]
    if (ts >= a.eta && ts <= b.eta) {
      const t = b.eta === a.eta ? 0 : (ts - a.eta) / (b.eta - a.eta)
      const mile = a.mile + (b.mile - a.mile) * t
      return { point: pointAtMile(idx, mile), mile }
    }
  }
  return null
}

export const mercatorY = (lat: number) => {
  const r = toRad(Math.max(-85.05, Math.min(85.05, lat)))
  return Math.log(Math.tan(Math.PI / 4 + r / 2))
}
export const invMercatorY = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI
