import { CloudRain, Snowflake, Thermometer, Wind, X } from 'lucide-react'

import type { Checkpoint, PlannedRoute } from '../api/types'
import { fmtFull, weatherText } from '../lib/format'
import { LEVEL_BG, LEVEL_COLORS, routeColor } from '../lib/risk'

interface Props {
  route: PlannedRoute
  checkpoint: Checkpoint
  pinned: boolean
  onClose: () => void
}

export function CheckpointPopup({ route, checkpoint: cp, pinned, onClose }: Props) {
  const w = cp.weather
  return (
    <div className="glass-strong w-[260px] rounded-2xl p-3 text-slate-100" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-extrabold text-ink-950" style={{ background: routeColor(route.id) }}>
          {route.id}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">Mile {cp.mile.toFixed(0)}</p>
          <p className="text-[11px] text-slate-400">ETA {fmtFull(cp.eta)}</p>
        </div>
        {pinned && (
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className={`mt-2 flex items-center justify-between rounded-lg px-2.5 py-1.5 ring-1 ${LEVEL_BG[cp.risk.level]}`}>
        <span className="text-xs font-bold uppercase tracking-wide">{cp.risk.label}</span>
        <span className="font-mono text-[11px] opacity-80">score {cp.risk.score.toFixed(2)}</span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
        <Row icon={Wind} label="Wind" value={`${w.wind_mph.toFixed(0)} mph`} sub={`gust ${w.gust_mph.toFixed(0)}`} color={LEVEL_COLORS[cp.risk.wind_level]} />
        <Row icon={CloudRain} label="Rain" value={`${w.rain_in_hr.toFixed(2)} in/hr`} color={LEVEL_COLORS[cp.risk.rain_level]} />
        <Row icon={Snowflake} label="Snow" value={`${w.snow_in_hr.toFixed(1)} in/hr`} color={LEVEL_COLORS[cp.risk.snow_level]} />
        <Row icon={Thermometer} label="Temp" value={`${w.temp_f.toFixed(0)} F`} sub={weatherText(w.weather_code)} />
      </dl>

      <ul className="mt-2 space-y-0.5 border-t border-white/10 pt-2 text-[11px] leading-snug text-slate-300">
        {cp.risk.drivers.map((d) => (
          <li key={d}>&bull; {d}</li>
        ))}
      </ul>
    </div>
  )
}

function Row({ icon: Icon, label, value, sub, color }: { icon: typeof Wind; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2 py-1.5">
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" style={{ color }} /> {label}
      </dt>
      <dd className="font-semibold text-slate-100">
        {value} {sub && <span className="block text-[10px] font-normal text-slate-500">{sub}</span>}
      </dd>
    </div>
  )
}
