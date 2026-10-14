import type { HeatVariable, RiskLevel } from '../api/types'

/** Same thresholds as backend/routing/services/risk.py (kept in sync by /api/rules). */
export const WIND_BOUNDS = [25, 35, 45, 55] as const
export const RAIN_BOUNDS = [0.1, 0.25, 0.5, 1.0] as const
export const SNOW_BOUNDS = [0.5, 1.0, 2.0, 3.0] as const

export const LEVEL_LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'] as const

export const LEVEL_COLORS: Record<RiskLevel, string> = {
  0: '#22c55e',
  1: '#eab308',
  2: '#f97316',
  3: '#ef4444',
  4: '#d946ef',
}

export const LEVEL_TEXT: Record<RiskLevel, string> = {
  0: 'text-emerald-400',
  1: 'text-yellow-400',
  2: 'text-orange-400',
  3: 'text-red-400',
  4: 'text-fuchsia-400',
}

export const LEVEL_BG: Record<RiskLevel, string> = {
  0: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  1: 'bg-yellow-500/15 text-yellow-300 ring-yellow-400/30',
  2: 'bg-orange-500/15 text-orange-300 ring-orange-400/30',
  3: 'bg-red-500/15 text-red-300 ring-red-400/30',
  4: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/30',
}

export const ROUTE_COLORS: Record<string, string> = {
  A: '#60a5fa',
  B: '#c084fc',
  C: '#2dd4bf',
}
export const routeColor = (id: string) => ROUTE_COLORS[id] ?? '#94a3b8'

/** Piecewise-linear 0..4.5 score, identical to the backend implementation. */
export function continuousScore(value: number, bounds: readonly number[]): number {
  if (value <= 0) return 0
  let prev = 0
  for (let level = 0; level < bounds.length; level++) {
    const bound = bounds[level]
    if (value < bound) return level + (value - prev) / (bound - prev)
    prev = bound
  }
  const overshoot = (value - bounds[bounds.length - 1]) / bounds[bounds.length - 1]
  return Math.min(4.5, 4 + overshoot)
}

export const VARIABLE_META: Record<HeatVariable, { label: string; unit: string; bounds: readonly number[] | null; hint: string }> = {
  score: { label: 'Combined risk', unit: '', bounds: null, hint: 'Worst of wind, rain and snow at each cell' },
  wind: { label: 'Wind', unit: 'mph', bounds: WIND_BOUNDS, hint: 'Sustained 10 m wind speed' },
  rain: { label: 'Rain', unit: 'in/hr', bounds: RAIN_BOUNDS, hint: 'Liquid precipitation rate' },
  snow: { label: 'Snow', unit: 'in/hr', bounds: SNOW_BOUNDS, hint: 'Snowfall rate' },
}

/** Map a raw variable value to the shared 0..4.5 score so colours are comparable. */
export function variableScore(variable: HeatVariable, value: number): number {
  const meta = VARIABLE_META[variable]
  return meta.bounds ? continuousScore(value, meta.bounds) : value
}

/**
 * Colour ramp for continuous scores. Low risk is nearly transparent so the
 * basemap stays legible; the ramp passes through the five level colours.
 */
const STOPS: [number, [number, number, number], number][] = [
  [0.0, [16, 185, 129], 0.1],
  [0.5, [34, 197, 94], 0.3],
  [1.0, [234, 179, 8], 0.5],
  [2.0, [249, 115, 22], 0.66],
  [3.0, [239, 68, 68], 0.8],
  [4.0, [217, 70, 239], 0.9],
  [4.5, [168, 85, 247], 0.95],
]

export function scoreToRGBA(score: number): [number, number, number, number] {
  if (!Number.isFinite(score) || score <= 0) return [0, 0, 0, 0]
  for (let i = 1; i < STOPS.length; i++) {
    const [s1, c1, a1] = STOPS[i]
    if (score <= s1) {
      const [s0, c0, a0] = STOPS[i - 1]
      const t = (score - s0) / (s1 - s0)
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
        a0 + (a1 - a0) * t,
      ]
    }
  }
  const [, c, a] = STOPS[STOPS.length - 1]
  return [c[0], c[1], c[2], a]
}

export const scoreToLevel = (score: number): RiskLevel => Math.min(4, Math.max(0, Math.floor(score))) as RiskLevel
