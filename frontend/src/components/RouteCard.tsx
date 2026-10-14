import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import type { PlannedRoute, RiskLevel } from '../api/types'
import { fmtDay, fmtDayTime, fmtDuration, fmtDurationDelta, fmtKm, fmtMiles, fmtTime } from '../lib/format'
import { LEVEL_BG, LEVEL_COLORS, LEVEL_LABELS, LEVEL_TEXT, routeColor } from '../lib/risk'
import { useStore } from '../store'
import { RiskRibbon } from './RiskRibbon'

interface Props {
  route: PlannedRoute
  selected: boolean
  fastestDuration: number
  truckMile: number | null
}

export function RouteCard({ route, selected, fastestDuration, truckMile }: Props) {
  const [expanded, setExpanded] = useState(false)
  const selectRoute = useStore((s) => s.selectRoute)
  const hoverRoute = useStore((s) => s.hoverRoute)
  const setActive = useStore((s) => s.setActiveCheckpoint)
  const activeCp = useStore((s) => s.activeCheckpoint)
  const color = routeColor(route.id)
  const s = route.summary
  const isFastest = route.duration_s === fastestDuration
  const delta = route.duration_s - fastestDuration
  const worst = route.checkpoints[s.worst_checkpoint_index] ?? route.checkpoints[0]

  const tags: string[] = []
  if (route.recommended) tags.push('Recommended')
  if (isFastest) tags.push('Fastest')
  if (route.synthetic) tags.push('Via-point alternative')

  return (
    <article
      onMouseEnter={() => hoverRoute(route.id)}
      onMouseLeave={() => hoverRoute(null)}
      onClick={() => selectRoute(route.id)}
      className={`card cursor-pointer p-4 transition ${selected ? 'border-ink' : 'hover:border-line-strong'}`}
      aria-selected={selected}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold text-ink">{route.name}</h3>
            {tags.length > 0 && <span className="text-xs text-muted">{tags.join(' · ')}</span>}
          </div>
          <p className="text-xs text-muted">
            Ranked #{route.rank} · worst stretch <span className={`font-medium ${LEVEL_TEXT[s.max_level]}`}>{s.max_label}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm text-ink">{fmtDuration(route.duration_s)}</p>
          <p className="text-xs text-muted">{isFastest ? 'fastest' : fmtDurationDelta(delta)}</p>
        </div>
      </div>

      <div className="mt-3">
        <RiskRibbon checkpoints={route.checkpoints} totalMiles={s.total_miles} marker={selected ? truckMile : null} height={8} />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>{fmtTime(route.departure)}</span>
          <span>
            {fmtMiles(route.distance_mi)} · {fmtKm(route.distance_mi)}
          </span>
          <span>
            arrive {fmtTime(route.eta)} {fmtDay(route.eta)}
          </span>
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {s.miles_by_level.map((miles, level) =>
          miles > 0 ? (
            <div key={level} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: LEVEL_COLORS[level as RiskLevel] }} />
              <dt className="text-muted">{LEVEL_LABELS[level]}</dt>
              <dd className="font-mono text-ink">{miles.toFixed(0)} mi</dd>
            </div>
          ) : null,
        )}
        <div className="flex items-center gap-1.5">
          <dt className="text-muted">Avg risk</dt>
          <dd className="font-mono text-ink">{s.avg_risk.toFixed(2)}</dd>
        </div>
      </dl>

      {worst.risk.level >= 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            selectRoute(route.id)
            setActive({ routeId: route.id, index: worst.index, pinned: true, focus: true })
          }}
          className={`mt-3 w-full rounded-md px-3 py-2 text-left text-xs ring-1 ${LEVEL_BG[worst.risk.level]}`}
          title="Show this checkpoint on the map"
        >
          Worst: {worst.risk.label} at mile {worst.mile.toFixed(0)}, {fmtDayTime(worst.eta)}. {worst.risk.drivers[0]}.
        </button>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setExpanded((v) => !v)
        }}
        className="mt-3 flex w-full items-center justify-between text-xs text-ink-soft hover:text-ink"
        aria-expanded={expanded}
      >
        <span>
          {s.checkpoint_count} checkpoints{expanded ? '' : ' - show table'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="scroll-thin mt-2 max-h-72 overflow-y-auto rounded-md border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-paper text-[11px] text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Mile</th>
                <th className="px-2 py-1.5 font-medium">ETA</th>
                <th className="px-2 py-1.5 text-right font-medium">Wind</th>
                <th className="px-2 py-1.5 text-right font-medium">Rain</th>
                <th className="px-2 py-1.5 text-right font-medium">Snow</th>
                <th className="px-2 py-1.5 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {route.checkpoints.map((cp) => {
                const active = activeCp?.routeId === route.id && activeCp.index === cp.index
                return (
                  <tr
                    key={cp.index}
                    className={`cursor-pointer border-t border-line font-mono hover:bg-paper ${active ? 'bg-paper' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      selectRoute(route.id)
                      setActive({ routeId: route.id, index: cp.index, pinned: true, focus: true })
                    }}
                  >
                    <td className="px-2 py-1.5">{cp.mile.toFixed(0)}</td>
                    <td className="px-2 py-1.5">{fmtDayTime(cp.eta)}</td>
                    <td className="px-2 py-1.5 text-right">{cp.weather.wind_mph.toFixed(0)}</td>
                    <td className="px-2 py-1.5 text-right">{cp.weather.rain_in_hr.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right">{cp.weather.snow_in_hr.toFixed(1)}</td>
                    <td className={`px-2 py-1.5 font-sans font-medium ${LEVEL_TEXT[cp.risk.level]}`}>{cp.risk.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}
