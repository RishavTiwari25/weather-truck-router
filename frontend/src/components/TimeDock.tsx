import { Pause, Play } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { HeatVariable } from '../api/types'
import { fmtDayTime, fmtRelHours } from '../lib/format'
import { LEVEL_COLORS, VARIABLE_META, routeColor } from '../lib/risk'
import { PLAYBACK_HOURS_PER_SECOND, baseHour, selectRouteById, useStore } from '../store'

const VARIABLES: HeatVariable[] = ['score', 'wind', 'rain', 'snow']

export function TimeDock({ truckMile }: { truckMile: number | null }) {
  const plan = useStore((s) => s.plan)
  const heatmap = useStore((s) => s.heatmap)
  const heatmapLoading = useStore((s) => s.heatmapLoading)
  const heatmapError = useStore((s) => s.heatmapError)
  const hour = useStore((s) => s.hour)
  const setHour = useStore((s) => s.setHour)
  const playing = useStore((s) => s.playing)
  const setPlaying = useStore((s) => s.setPlaying)
  const variable = useStore((s) => s.heatVariable)
  const setVariable = useStore((s) => s.setHeatVariable)
  const showHeatmap = useStore((s) => s.showHeatmap)
  const showCheckpoints = useStore((s) => s.showCheckpoints)
  const showAllRoutes = useStore((s) => s.showAllRoutes)
  const toggle = useStore((s) => s.toggle)
  const selectedId = useStore((s) => s.selectedRouteId)

  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!playing) {
      last.current = null
      return
    }
    let raf = 0
    const tick = (t: number) => {
      if (last.current != null) {
        const dt = (t - last.current) / 1000
        const next = useStore.getState().hour + dt * PLAYBACK_HOURS_PER_SECOND
        setHour(next >= 48 ? 0 : next)
      }
      last.current = t
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, setHour])

  if (!plan) return null

  const base = baseHour(plan, heatmap)
  const ts = base + hour * 3600
  const selected = selectRouteById(plan, selectedId)
  const departurePct = Math.max(0, Math.min(100, ((plan.request.departure - base) / 3600 / 48) * 100))

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
      <div className="float pointer-events-auto w-full max-w-3xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white hover:bg-black"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 translate-x-px fill-current" />}
          </button>

          <div className="min-w-[128px] leading-tight">
            <p className="font-mono text-sm text-ink">{fmtRelHours(hour)}</p>
            <p className="text-xs text-muted">{fmtDayTime(ts)}</p>
          </div>

          <div className="min-w-[200px] flex-1 pt-1">
            <input
              type="range"
              className="slider"
              min={0}
              max={48}
              step={0.25}
              value={hour}
              onChange={(e) => {
                setPlaying(false)
                setHour(Number(e.target.value))
              }}
              aria-label="Forecast hour, 0 to 48 hours from now"
            />
            <div className="relative mt-1 h-3">
              <Tick pct={departurePct} color="#1d1d1b" label="dep" />
              {plan.routes.map((r, i) => {
                const pct = ((r.eta - base) / 3600 / 48) * 100
                return pct <= 100 ? <Tick key={r.id} pct={pct} color={routeColor(r.id)} label={r.id} stagger={i} /> : null
              })}
            </div>
          </div>

          {selected && (
            <p className="hidden min-w-[130px] text-xs leading-tight text-muted md:block">
              <span className="font-medium text-ink">Route {selected.id}</span>
              <br />
              {truckMile == null ? (ts < selected.departure ? 'not departed yet' : 'arrived') : `at mile ${truckMile.toFixed(0)} of ${selected.distance_mi.toFixed(0)}`}
            </p>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2.5 text-xs">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-muted">Heatmap</span>
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariable(v)}
                title={VARIABLE_META[v].hint}
                className={`rounded px-2 py-1 ${variable === v ? 'bg-ink text-white' : 'text-ink-soft hover:bg-paper'}`}
              >
                {VARIABLE_META[v].label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-ink-soft">
            <Check on={showHeatmap} onChange={() => toggle('showHeatmap')} label="heatmap" />
            <Check on={showCheckpoints} onChange={() => toggle('showCheckpoints')} label="checkpoints" />
            <Check on={showAllRoutes} onChange={() => toggle('showAllRoutes')} label="all routes" />
          </div>

          <div className="ml-auto flex items-center gap-2 text-muted">
            {heatmapLoading && <span>loading 48 h forecast&hellip;</span>}
            {heatmapError && <span className="text-risk-severe">{heatmapError}</span>}
            {!heatmapLoading && !heatmapError && (
              <>
                <span>low</span>
                <span
                  className="h-2 w-24 rounded-sm"
                  style={{
                    background: `linear-gradient(90deg, ${LEVEL_COLORS[0]}, ${LEVEL_COLORS[1]}, ${LEVEL_COLORS[2]}, ${LEVEL_COLORS[3]}, ${LEVEL_COLORS[4]})`,
                  }}
                />
                <span>no travel</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Tick({ pct, color, label, stagger = 0 }: { pct: number; color: string; label: string; stagger?: number }) {
  return (
    <div
      className="absolute flex items-center gap-0.5"
      style={{ left: `${Math.max(0, Math.min(100, pct))}%`, transform: `translate(-50%, ${stagger % 2 ? 6 : 0}px)` }}
    >
      <span className="h-0 w-0 border-x-[3px] border-b-[4px] border-x-transparent" style={{ borderBottomColor: color }} />
      <span className="font-mono text-[9px] leading-none" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

function Check({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={on} onChange={onChange} className="h-3.5 w-3.5 accent-ink" />
      {label}
    </label>
  )
}
