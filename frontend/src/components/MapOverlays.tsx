import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CalendarClock, CloudSun, Loader2, Scale, Sparkles } from 'lucide-react'

import { fmtFull, fmtLb, fmtTonnes } from '../lib/format'
import { LEVEL_COLORS, LEVEL_LABELS } from '../lib/risk'
import type { RiskLevel } from '../api/types'
import { useStore } from '../store'

const STEPS = ['Geocoding origin and destination', 'Generating 3 route options', 'Sampling forecast at every checkpoint', 'Scoring risk and ranking routes']

/** Floating cards drawn over the map: welcome state, loading state, trip pill and risk legend. */
export function MapOverlays() {
  const plan = useStore((s) => s.plan)
  const planning = useStore((s) => s.planning)

  return (
    <>
      {/* Top-left: trip summary + legend */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-120px)] flex-col gap-2 sm:left-4 sm:top-4">
        <AnimatePresence>
          {plan && !planning && (
            <motion.div
              key="pill"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="glass-strong pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3.5 py-2 text-xs text-slate-200"
            >
              <span className="flex items-center gap-1.5 font-semibold text-white">
                {plan.request.origin.label.split(',')[0]}
                <ArrowRight className="h-3.5 w-3.5 text-sky-300" />
                {plan.request.destination.label.split(',')[0]}
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <CalendarClock className="h-3.5 w-3.5" /> {fmtFull(plan.request.departure)}
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <Scale className="h-3.5 w-3.5" /> {fmtLb(plan.request.load_lb)} ({fmtTonnes(plan.request.load_lb)})
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="glass pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl px-2.5 py-1.5">
          {LEVEL_LABELS.map((label, level) => (
            <span key={label} className="flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/20" style={{ background: LEVEL_COLORS[level as RiskLevel] }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Centre: welcome / loading */}
      <AnimatePresence>
        {!plan && !planning && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6"
          >
            <div className="glass-strong pointer-events-auto max-w-md rounded-3xl p-6 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-glow">
                <CloudSun className="h-7 w-7 text-ink-950" strokeWidth={2.2} />
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-white">Plan a safer haul across India</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Pick a trip, departure time and load. ClearHaul compares three routes by the wind, rain and snow your truck will meet at
                every checkpoint, then recommends the safest one.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-slate-400">
                <span className="chip">3 route options</span>
                <span className="chip">Weather at each ETA</span>
                <span className="chip">0-48 h heatmap</span>
                <span className="chip">Load-aware rules</span>
              </div>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-sky-200">
                <Sparkles className="h-3.5 w-3.5" /> Try the Delhi to Mumbai sample in the panel
              </p>
            </div>
          </motion.div>
        )}

        {planning && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6"
          >
            <div className="glass-strong w-full max-w-sm rounded-3xl p-5">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
                <p className="text-sm font-bold text-white">Planning your trip</p>
              </div>
              <ul className="mt-4 space-y-2.5">
                {STEPS.map((step, i) => (
                  <motion.li
                    key={step}
                    initial={{ opacity: 0.35, x: -4 }}
                    animate={{ opacity: [0.35, 1, 0.35], x: 0 }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                    className="flex items-center gap-2.5 text-xs text-slate-200"
                  >
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-sky-400/15 font-mono text-[10px] font-bold text-sky-200 ring-1 ring-sky-400/40">
                      {i + 1}
                    </span>
                    {step}
                  </motion.li>
                ))}
              </ul>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="skeleton h-full w-full" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
