import { ArrowDownUp, CalendarClock, Loader2, MapPin, Navigation, Route, Scale } from 'lucide-react'

import type { IntervalMi } from '../api/types'
import { fmtLb } from '../lib/format'
import { useStore } from '../store'

const SAMPLE_TRIPS: [string, string][] = [
  ['Chicago, IL', 'Denver, CO'],
  ['Dallas, TX', 'Atlanta, GA'],
  ['Seattle, WA', 'Salt Lake City, UT'],
  ['Minneapolis, MN', 'Kansas City, MO'],
]

const LOAD_PRESETS = [
  { label: 'Empty', value: 15000 },
  { label: 'Light', value: 28000 },
  { label: 'Standard', value: 42000 },
  { label: 'Max', value: 80000 },
]

export function TripForm() {
  const form = useStore((s) => s.form)
  const setForm = useStore((s) => s.setForm)
  const swap = useStore((s) => s.swapEndpoints)
  const submit = useStore((s) => s.submit)
  const planning = useStore((s) => s.planning)
  const error = useStore((s) => s.planError)

  const heavy = form.loadLb > 30000
  const veryHeavy = form.loadLb > 40000

  return (
    <form
      className="glass rounded-2xl p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SAMPLE_TRIPS.map(([o, d]) => (
          <button
            key={o + d}
            type="button"
            className="chip"
            onClick={() => setForm({ origin: o, destination: d })}
            title="Fill a sample trip"
          >
            {o.split(',')[0]} <span className="text-slate-500">&rarr;</span> {d.split(',')[0]}
          </button>
        ))}
      </div>

      <div className="relative space-y-2">
        <div>
          <label className="label" htmlFor="origin">
            Origin
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
            <input
              id="origin"
              className="field pl-9"
              placeholder="City, address or lat, lon"
              value={form.origin}
              onChange={(e) => setForm({ origin: e.target.value })}
              required
              autoComplete="off"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={swap}
          className="absolute right-3 top-[52%] z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-ink-800 text-slate-300 shadow transition hover:border-sky-400/50 hover:text-white"
          title="Swap origin and destination"
          aria-label="Swap origin and destination"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
        </button>
        <div>
          <label className="label" htmlFor="destination">
            Destination
          </label>
          <div className="relative">
            <Navigation className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-400" />
            <input
              id="destination"
              className="field pl-9"
              placeholder="City, address or lat, lon"
              value={form.destination}
              onChange={(e) => setForm({ destination: e.target.value })}
              required
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="departure">
          Departure (your local time)
        </label>
        <div className="relative">
          <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-400" />
          <input
            id="departure"
            type="datetime-local"
            className="field pl-9 [color-scheme:dark]"
            value={form.departureLocal}
            onChange={(e) => setForm({ departureLocal: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label !mb-0" htmlFor="load">
            Load weight
          </label>
          <span className="font-mono text-xs text-slate-200">{fmtLb(form.loadLb)}</span>
        </div>
        <div className="flex items-center gap-3">
          <Scale className="h-4 w-4 shrink-0 text-amber-400" />
          <input
            id="load"
            type="range"
            className="slider"
            min={0}
            max={80000}
            step={500}
            value={form.loadLb}
            onChange={(e) => setForm({ loadLb: Number(e.target.value) })}
          />
          <input
            type="number"
            className="field !w-28 !px-2 !py-1.5 text-right font-mono text-xs"
            min={0}
            max={200000}
            step={500}
            value={form.loadLb}
            onChange={(e) => setForm({ loadLb: Math.max(0, Number(e.target.value) || 0) })}
            aria-label="Load weight in pounds"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {LOAD_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip ${form.loadLb === p.value ? '!border-sky-400/60 !bg-sky-400/10 !text-sky-200' : ''}`}
              onClick={() => setForm({ loadLb: p.value })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-1 text-[11px] leading-snug text-slate-400">
          <li className={heavy ? 'text-fuchsia-300' : ''}>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
            {heavy ? 'Active: ' : 'Over 30,000 lb: '}45-54 mph wind becomes <b>No Travel</b>
          </li>
          <li className={veryHeavy ? 'text-red-300' : ''}>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
            {veryHeavy ? 'Active: ' : 'Over 40,000 lb: '}35-44 mph wind becomes <b>Severe</b>
          </li>
        </ul>
      </div>

      <div className="mt-3">
        <label className="label">Weather sampling</label>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {([10, 25, 50] as IntervalMi[]).map((mi) => (
            <button
              key={mi}
              type="button"
              onClick={() => setForm({ intervalMi: mi })}
              className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                form.intervalMi === mi
                  ? 'bg-sky-400/15 text-sky-200 shadow-[inset_0_0_0_1px_rgb(56_189_248/0.45)]'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              every {mi} mi
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs leading-snug text-red-200"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={planning}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-3 text-sm font-bold text-ink-950 shadow-glow transition hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
      >
        {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
        {planning ? 'Routing & sampling forecast...' : 'Find safest route'}
      </button>
    </form>
  )
}
