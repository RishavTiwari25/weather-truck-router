import { useCallback, useState } from 'react'

import { Header } from './components/Header'
import { MapOverlays } from './components/MapOverlays'
import { MapView } from './components/MapView'
import { RecommendationCard } from './components/RecommendationCard'
import { RouteCard } from './components/RouteCard'
import { TimeDock } from './components/TimeDock'
import { TripForm } from './components/TripForm'
import { providerName } from './lib/format'
import { useStore } from './store'

export default function App() {
  const plan = useStore((s) => s.plan)
  const planning = useStore((s) => s.planning)
  const selectedId = useStore((s) => s.selectedRouteId)
  const [truckMile, setTruckMile] = useState<number | null>(null)
  const onTruckMile = useCallback((m: number | null) => setTruckMile(m), [])

  const fastest = plan ? Math.min(...plan.routes.map((r) => r.duration_s)) : 0

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="flex h-[52vh] w-full shrink-0 flex-col border-b border-line bg-paper lg:h-full lg:w-[400px] lg:border-b-0 lg:border-r xl:w-[440px]">
        <Header />
        <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3">
          <TripForm />

          {planning && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card space-y-3 p-4">
                  <div className="skeleton h-4 w-40 rounded" />
                  <div className="skeleton h-2 w-full rounded" />
                  <div className="skeleton h-3 w-3/4 rounded" />
                </div>
              ))}
            </div>
          )}

          {!planning && plan && (
            <>
              <RecommendationCard plan={plan} />
              <h2 className="px-1 pt-1 text-xs font-medium text-muted">All options</h2>
              {plan.routes.map((r) => (
                <RouteCard key={r.id} route={r} selected={r.id === selectedId} fastestDuration={fastest} truckMile={truckMile} />
              ))}
              <p className="px-1 pb-2 text-[11px] leading-relaxed text-muted">
                Forecast from {providerName(plan.weather_provider)}, read at each checkpoint's ETA. Routing from{' '}
                {plan.routes[0]?.provider === 'osrm' ? 'OSRM, with car durations scaled 1.15x for trucks' : 'OpenRouteService (truck profile)'}. The
                stretch between two checkpoints takes the worse of their two ratings. Planned in {(plan.timing_ms.total / 1000).toFixed(1)} s.
              </p>
            </>
          )}

          {!planning && !plan && (
            <div className="px-1 text-xs leading-relaxed text-muted">
              <p className="font-medium text-ink-soft">What this does</p>
              <p className="mt-1">
                Builds three routes, checks the hourly forecast at the time your truck reaches each 10, 25 or 50 mile mark, rates every
                stretch from Low to No Travel using wind, rain, snow and your load, and picks the route with the fewest bad miles. Ties go to
                the faster route.
              </p>
            </div>
          )}
        </div>
      </aside>

      <main className="relative min-h-0 flex-1 bg-[#eef0ec]">
        <MapView onTruckMile={onTruckMile} />
        <MapOverlays />
        <TimeDock truckMile={truckMile} />
      </main>
    </div>
  )
}
