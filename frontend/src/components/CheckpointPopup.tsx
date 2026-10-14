import { X } from 'lucide-react'

import type { Checkpoint, PlannedRoute } from '../api/types'
import { fmtFull, weatherText } from '../lib/format'
import { LEVEL_BG, LEVEL_TEXT, routeColor } from '../lib/risk'

interface Props {
  route: PlannedRoute
  checkpoint: Checkpoint
  pinned: boolean
  onClose: () => void
}

export function CheckpointPopup({ route, checkpoint: cp, pinned, onClose }: Props) {
  const w = cp.weather
  return (
    <div className="float w-[240px] p-3 text-xs text-ink" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: routeColor(route.id) }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            Route {route.id}, mile {cp.mile.toFixed(0)}
          </p>
          <p className="text-muted">{fmtFull(cp.eta)}</p>
        </div>
        {pinned && (
          <button type="button" onClick={onClose} className="rounded p-0.5 text-muted hover:bg-paper hover:text-ink" aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className={`mt-2 rounded-md px-2 py-1 font-medium ring-1 ${LEVEL_BG[cp.risk.level]}`}>{cp.risk.label}</p>

      <table className="mt-2 w-full">
        <tbody>
          <Row label="Wind" value={`${w.wind_mph.toFixed(0)} mph, gusts ${w.gust_mph.toFixed(0)}`} tone={LEVEL_TEXT[cp.risk.wind_level]} />
          <Row label="Rain" value={`${w.rain_in_hr.toFixed(2)} in/hr`} tone={LEVEL_TEXT[cp.risk.rain_level]} />
          <Row label="Snow" value={`${w.snow_in_hr.toFixed(1)} in/hr`} tone={LEVEL_TEXT[cp.risk.snow_level]} />
          <Row label="Sky" value={`${weatherText(w.weather_code)}, ${w.temp_f.toFixed(0)} F`} />
        </tbody>
      </table>

      <p className="mt-2 border-t border-line pt-2 leading-snug text-ink-soft">{cp.risk.drivers.join('. ')}.</p>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <tr>
      <td className="py-0.5 pr-2 text-muted">{label}</td>
      <td className={`py-0.5 font-mono ${tone ?? ''}`}>{value}</td>
    </tr>
  )
}
