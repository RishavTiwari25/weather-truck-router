import type { HeatVariable, RiskLevel } from '../api/types'

/** Same thresholds as backend/routing/services/risk.py (kept in sync by /api/rules). */
export const WIND_BOUNDS = [25, 35, 45, 55] as const
export const RAIN_BOUNDS = [0.1, 0.25, 0.5, 1.0] as const
export const SNOW_BOUNDS = [0.5, 1.0, 2.0, 3.0] as const

export const LEVEL_LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'] as const

export const LEVEL_COLORS: Record<RiskLevel, string> = {
  0: '#2e9e5b',
  1: '#d6a400',
  2: '#e2731b',
  3: '#d1352b',
  4: '#8c2bb8',
}

export const LEVEL_TEXT: Record<RiskLevel, string> = {
  0: 'text-[#2e9e5b]',
  1: 'text-[#a67f00]',
  2: 'text-[#c25f0f]',
  3: 'text-[#b52a21]',
  4: 'text-[#7a1fa3]',
}

/** Tinted chip styles per level (light theme). */
export const LEVEL_BG: Record<RiskLevel, string> = {
  0: 'bg-[#e8f5ec] text-[#22703f] ring-[#bfe3cb]',
  1: 'bg-[#fbf3d6] text-[#7a5e00] ring-[#efdc8f]',
  2: 'bg-[#fdeadb] text-[#9a4a0a] ring-[#f4c6a0]',
  3: 'bg-[#fbe2df] text-[#9a251d] ring-[#f1b1ab]',
  4: 'bg-[#f1e3f7] text-[#6a1890] ring-[#d9b6e8]',
}

export const ROUTE_COLORS: Record<string, string> = {
  A: '#1f4fd6',
  B: '#7a3fb8',
  C: '#0e8a7a',
}
export const routeColor = (id: string) => ROUTE_COLORS[id] ?? '#6b6b66'

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
  [0.0, [46, 158, 91], 0.08],
  [0.5, [46, 158, 91], 0.28],
  [1.0, [214, 164, 0], 0.5],
  [2.0, [226, 115, 27], 0.66],
  [3.0, [209, 53, 43], 0.8],
  [4.0, [140, 43, 184], 0.88],
  [4.5, [110, 30, 150], 0.92],
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
