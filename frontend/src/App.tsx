import { AnimatePresence, motion } from 'framer-motion'
import { Compass, Timer } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Header } from './components/Header'
import { MapView } from './components/MapView'
import { RecommendationCard } from './components/RecommendationCard'
import { RouteCard } from './components/RouteCard'
import { TimeDock } from './components/TimeDock'
import { TripForm } from './components/TripForm'
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
      <aside className="flex h-[52vh] w-full shrink-0 flex-col border-b border-white/5 bg-ink-900/90 lg:h-full lg:w-[420px] lg:border-b-0 lg:border-r xl:w-[460px]">
        <Header />
        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
          <TripForm />

          <AnimatePresence mode="wait">
            {planning && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <LoadingSteps />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="glass space-y-3 rounded-2xl p-4">
                    <div className="skeleton h-5 w-40 rounded" />
                    <div className="skeleton h-2.5 w-full rounded-full" />
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 1, 2, 3].map((j) => (
                        <div key={j} className="skeleton h-10 rounded-lg" />
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {!planning && plan && (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <RecommendationCard plan={plan} />
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Route options</h2>
                  <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
                    <Timer className="h-3 w-3" /> {(plan.timing_ms.total / 1000).toFixed(1)}s
                  </span>
                </div>
                {plan.routes.map((r) => (
                  <RouteCard key={r.id} route={r} selected={r.id === selectedId} fastestDuration={fastest} truckMile={truckMile} />
                ))}
                <p className="px-1 pb-2 text-[10px] leading-relaxed text-slate-500">
                  Weather: Open-Meteo hourly forecast interpolated to each checkpoint's ETA. Routing:{' '}
                  {plan.routes[0]?.provider === 'osrm' ? 'OSRM (car profile, durations scaled for trucks)' : 'OpenRouteService driving-hgv'}.
                  Segment miles take the worse risk of their two endpoint checkpoints.
                </p>
              </motion.div>
            )}

            {!planning && !plan && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl p-5 text-sm text-slate-300">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06]">
                  <Compass className="h-5 w-5 text-sky-300" />
                </div>
                <p className="font-semibold text-white">How it works</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-400">
                  <li>Three route options are generated for your trip.</li>
                  <li>Each route is sampled every 10, 25 or 50 miles at the truck's estimated arrival time.</li>
                  <li>Wind, rain and snow at each checkpoint are classified Low to No Travel, with load-weight rules applied.</li>
                  <li>Routes are ranked by Severe miles, High miles, average risk, then travel time.</li>
                </ol>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      <main className="relative min-h-0 flex-1">
        <MapView onTruckMile={onTruckMile} />
        <TimeDock truckMile={truckMile} />
      </main>
    </div>
  )
}

function LoadingSteps() {
  const steps = ['Geocoding origin & destination', 'Generating 3 route options', 'Sampling forecast at each checkpoint', 'Scoring risk & ranking routes']
  return (
    <div className="glass rounded-2xl p-4">
      <ul className="space-y-2">
        {steps.map((step, i) => (
          <motion.li
            key={step}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.35 }}
            className="flex items-center gap-2 text-xs text-slate-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            {step}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
