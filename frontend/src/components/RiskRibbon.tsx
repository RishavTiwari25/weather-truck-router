import type { Checkpoint, RiskLevel } from '../api/types'
import { LEVEL_COLORS } from '../lib/risk'

interface Props {
  checkpoints: Checkpoint[]
  totalMiles: number
  height?: number
  /** Optional truck mile marker (0..total) */
  marker?: number | null
}

/**
 * A horizontal strip showing the risk level of each segment between
 * checkpoints, in proportion to its mileage.
 */
export function RiskRibbon({ checkpoints, totalMiles, height = 10, marker }: Props) {
  const segments = checkpoints.slice(0, -1).map((cp, i) => {
    const next = checkpoints[i + 1]
    const level = Math.max(cp.risk.level, next.risk.level) as RiskLevel
    return { x: (cp.mile / totalMiles) * 100, w: ((next.mile - cp.mile) / totalMiles) * 100, level, cp, next }
  })

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
      <rect x={0} y={0} width={100} height={height} rx={height / 2} fill="rgba(255,255,255,0.06)" />
      {segments.map((s, i) => (
        <rect
          key={i}
          x={s.x}
          y={0}
          width={Math.max(s.w, 0.2)}
          height={height}
          fill={LEVEL_COLORS[s.level]}
          opacity={s.level === 0 ? 0.55 : 0.95}
        >
          <title>
            {`Mile ${s.cp.mile.toFixed(0)}-${s.next.mile.toFixed(0)}: ${['Low', 'Moderate', 'High', 'Severe', 'No Travel'][s.level]}`}
          </title>
        </rect>
      ))}
      {typeof marker === 'number' && marker >= 0 && (
        <rect x={(marker / totalMiles) * 100 - 0.4} y={-1} width={0.8} height={height + 2} fill="#fff" />
      )}
    </svg>
  )
}
