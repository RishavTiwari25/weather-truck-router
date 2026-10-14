import { Eye, EyeOff, Layers, Pause, Play, Truck } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { HeatVariable } from '../api/types'
import { fmtDayTime, fmtRelHours } from '../lib/format'
import { LEVEL_COLORS, LEVEL_LABELS, VARIABLE_META, routeColor } from '../lib/risk'
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

  // Smooth playback driven by requestAnimationFrame.
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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3 sm:p-4">
      <div className="glass-strong pointer-events-auto w-full max-w-4xl rounded-2xl px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-ink-950 shadow-glow transition hover:brightness-110 active:scale-95"
            aria-label={playing ? 'Pause forecast playback' : 'Play forecast playback'}
          >
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-px fill-current" />}
          </button>

          <div className="min-w-[120px]">
            <p className="font-mono text-base font-semibold leading-none text-white">{fmtRelHours(hour)}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{fmtDayTime(ts)}</p>
          </div>

          <div className="relative min-w-[200px] flex-1 pt-1">
            <input
              type="range"
              className="slider relative z-10"
              min={0}
              max={48}
              step={0.25}
              value={hour}
              onChange={(e) => {
                setPlaying(false)
                setHour(Number(e.target.value))
              }}
              aria-label="Forecast hour (0 to 48 hours from now)"
            />
            {/* Departure + ETA ticks */}
            <div className="relative mt-1 h-3.5">
              <Tick pct={departurePct} color="#fff" label="Dep" title="Departure" />
              {plan.routes.map((r, i) => {
                const pct = ((r.eta - base) / 3600 / 48) * 100
                return pct <= 100 ? <Tick key={r.id} pct={pct} color={routeColor(r.id)} label={r.id} title={`ETA route ${r.id}`} stagger={i} /> : null
              })}
            </div>
          </div>

          {selected && (
            <div className="hidden min-w-[150px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 md:flex">
              <Truck className="h-4 w-4 text-sky-300" />
              <div className="text-xs leading-tight">
                <p className="font-semibold text-slate-100">Route {selected.id}</p>
                <p className="text-slate-400">
                  {truckMile == null
                    ? ts < selected.departure
                      ? 'Not departed'
                      : 'Arrived'
                    : `mile ${truckMile.toFixed(0)} of ${selected.distance_mi.toFixed(0)}`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariable(v)}
                title={VARIABLE_META[v].hint}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  variable === v ? 'bg-sky-400/15 text-sky-200 shadow-[inset_0_0_0_1px_rgb(56_189_248/0.45)]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {VARIABLE_META[v].label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <ToggleChip on={showHeatmap} onClick={() => toggle('showHeatmap')} label="Heatmap" />
            <ToggleChip on={showCheckpoints} onClick={() => toggle('showCheckpoints')} label="Checkpoints" />
            <ToggleChip on={showAllRoutes} onClick={() => toggle('showAllRoutes')} label="All routes" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {heatmapLoading && (
              <span className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="skeleton h-2 w-24 rounded-full" /> loading 48h corridor forecast
              </span>
            )}
            {heatmapError && <span className="text-[11px] text-red-300">{heatmapError}</span>}
            {!heatmapLoading && !heatmapError && (
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-slate-500" />
                <div
                  className="h-2.5 w-28 rounded-full sm:w-40"
                  style={{
                    background: `linear-gradient(90deg, ${LEVEL_COLORS[0]}, ${LEVEL_COLORS[1]}, ${LEVEL_COLORS[2]}, ${LEVEL_COLORS[3]}, ${LEVEL_COLORS[4]})`,
                  }}
                />
                <div className="hidden text-[10px] text-slate-400 sm:block">
                  {LEVEL_LABELS[0]} &rarr; {LEVEL_LABELS[4]}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Tick({ pct, color, label, title, stagger = 0 }: { pct: number; color: string; label: string; title: string; stagger?: number }) {
  return (
    <div
      className="absolute flex -translate-x-1/2 items-center gap-0.5"
      style={{ left: `${Math.max(0, Math.min(100, pct))}%`, top: 0, transform: `translate(-50%, ${stagger % 2 ? 7 : 0}px)` }}
      title={title}
    >
      <div className="h-0 w-0 border-x-[4px] border-b-[5px] border-x-transparent" style={{ borderBottomColor: color }} />
      <span className="text-[9px] font-bold leading-none" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

function ToggleChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`chip ${on ? '!border-sky-400/50 !text-sky-200' : 'opacity-70'}`} aria-pressed={on}>
      {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      {label}
    </button>
  )
}
