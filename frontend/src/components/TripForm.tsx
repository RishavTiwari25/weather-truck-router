import { ArrowUpDown, Loader2 } from 'lucide-react'

import type { IntervalMi } from '../api/types'
import { useStore } from '../store'

const SAMPLE_TRIPS: [string, string][] = [
  ['New Delhi, India', 'Mumbai, India'],
  ['Bengaluru, India', 'Hyderabad, India'],
  ['Chennai, India', 'Kolkata, India'],
  ['Ahmedabad, India', 'Pune, India'],
  ['Jaipur, India', 'Lucknow, India'],
]

const LOAD_PRESETS = [
  { label: 'Empty (15k)', value: 15000 },
  { label: 'Light (28k)', value: 28000 },
  { label: 'Typical (42k)', value: 42000 },
  { label: 'Max (80k)', value: 80000 },
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
      className="card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="space-y-3">
        <div className="relative">
          <label className="label" htmlFor="origin">
            From
          </label>
          <input
            id="origin"
            className="field"
            placeholder="City, address or lat, lon"
            value={form.origin}
            onChange={(e) => setForm({ origin: e.target.value })}
            required
            autoComplete="off"
          />
          <button
            type="button"
            onClick={swap}
            className="absolute right-2 top-[30px] rounded p-1 text-muted hover:bg-paper hover:text-ink"
            title="Swap"
            aria-label="Swap origin and destination"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div>
          <label className="label" htmlFor="destination">
            To
          </label>
          <input
            id="destination"
            className="field"
            placeholder="City, address or lat, lon"
            value={form.destination}
            onChange={(e) => setForm({ destination: e.target.value })}
            required
            autoComplete="off"
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">
        Examples:{' '}
        {SAMPLE_TRIPS.map(([o, d], i) => (
          <span key={o + d}>
            {i > 0 && ', '}
            <button type="button" className="text-link hover:underline" onClick={() => setForm({ origin: o, destination: d })}>
              {o.split(',')[0]}&ndash;{d.split(',')[0]}
            </button>
          </span>
        ))}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="departure">
            Departure
          </label>
          <input
            id="departure"
            type="datetime-local"
            className="field"
            value={form.departureLocal}
            onChange={(e) => setForm({ departureLocal: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="load">
            Load (lb)
          </label>
          <input
            id="load"
            type="number"
            className="field font-mono"
            min={0}
            max={200000}
            step={500}
            value={form.loadLb}
            onChange={(e) => setForm({ loadLb: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {LOAD_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`btn-ghost ${form.loadLb === p.value ? 'border-ink text-ink' : ''}`}
            onClick={() => setForm({ loadLb: p.value })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {veryHeavy
          ? 'Over 40,000 lb: 35-44 mph wind counts as Severe, 45-54 mph as No Travel.'
          : heavy
            ? 'Over 30,000 lb: 45-54 mph wind counts as No Travel.'
            : 'Under 30,000 lb: only the standard wind, rain and snow thresholds apply.'}
      </p>

      <div className="mt-4">
        <span className="label">Check weather every</span>
        <div className="flex gap-1.5">
          {([10, 25, 50] as IntervalMi[]).map((mi) => (
            <button
              key={mi}
              type="button"
              onClick={() => setForm({ intervalMi: mi })}
              className={`btn-ghost flex-1 justify-center ${form.intervalMi === mi ? 'border-ink bg-paper text-ink' : ''}`}
            >
              {mi} mi
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-md border border-[#f1b1ab] bg-[#fbe2df] px-3 py-2 text-xs leading-snug text-[#9a251d]">
          {error}
        </div>
      )}

      <button type="submit" disabled={planning} className="btn-primary mt-4 w-full">
        {planning && <Loader2 className="h-4 w-4 animate-spin" />}
        {planning ? 'Checking routes and weather' : 'Plan routes'}
      </button>
    </form>
  )
}
