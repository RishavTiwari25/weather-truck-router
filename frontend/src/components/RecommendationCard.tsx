import { motion } from 'framer-motion'
import { AlertOctagon, AlertTriangle, CheckCircle2, ListOrdered, ShieldCheck } from 'lucide-react'

import type { PlanResponse } from '../api/types'
import { fmtDuration, fmtFull } from '../lib/format'
import { routeColor } from '../lib/risk'
import { useStore } from '../store'

export function RecommendationCard({ plan }: { plan: PlanResponse }) {
  const rec = plan.recommendation
  const route = plan.routes.find((r) => r.id === rec.route_id)
  const selectRoute = useStore((s) => s.selectRoute)
  const selectedId = useStore((s) => s.selectedRouteId)
  if (!route) return null
  const color = routeColor(route.id)
  const ranked = plan.routes.slice().sort((a, b) => a.rank - b.rank)

  const advisory =
    rec.advisory === 'no_travel'
      ? { icon: AlertOctagon, cls: 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200', text: 'No-Travel conditions on every option. Delay departure or re-plan.' }
      : rec.advisory === 'severe'
        ? { icon: AlertTriangle, cls: 'border-red-400/40 bg-red-500/10 text-red-200', text: 'Severe weather cannot be fully avoided on this trip.' }
        : null

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 p-4"
      style={{ background: `linear-gradient(135deg, ${color}26, rgba(17,26,46,0.92) 55%)` }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ background: `${color}40` }} />
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl shadow-lg" style={{ background: color }}>
          <ShieldCheck className="h-5 w-5 text-ink-950" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Recommended route</p>
          <button
            type="button"
            onClick={() => selectRoute(route.id)}
            className="mt-0.5 text-left text-xl font-extrabold tracking-tight text-white hover:underline"
          >
            Route {route.id}
          </button>
          <p className="truncate text-xs text-slate-300">
            {plan.request.origin.label.split(',')[0]} &rarr; {plan.request.destination.label.split(',')[0]} &middot; depart{' '}
            {fmtFull(plan.request.departure)}
          </p>
        </div>
      </div>

      {advisory && (
        <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${advisory.cls}`}>
          <advisory.icon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{advisory.text}</span>
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {rec.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2 text-[13px] leading-snug text-slate-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      {/* Side-by-side comparison in ranking order */}
      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-ink-950/40">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-slate-500">
              <th className="px-2.5 py-1.5 text-left font-semibold">Rank</th>
              <th className="px-2 py-1.5 text-right font-semibold" title="No-Travel miles">No-Go</th>
              <th className="px-2 py-1.5 text-right font-semibold">Severe</th>
              <th className="px-2 py-1.5 text-right font-semibold">High</th>
              <th className="px-2 py-1.5 text-right font-semibold">Avg</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const s = r.summary
              const active = r.id === selectedId
              return (
                <tr
                  key={r.id}
                  onClick={() => selectRoute(r.id)}
                  className={`cursor-pointer border-t border-white/5 font-mono transition hover:bg-white/[0.05] ${active ? 'bg-white/[0.06]' : ''}`}
                >
                  <td className="px-2.5 py-1.5 font-sans">
                    <span className="flex items-center gap-1.5">
                      <span className="grid h-4 w-4 place-items-center rounded text-[9px] font-extrabold text-ink-950" style={{ background: routeColor(r.id) }}>
                        {r.id}
                      </span>
                      <span className="text-slate-400">#{r.rank}</span>
                    </span>
                  </td>
                  <Cell value={s.no_travel_miles} tone="text-fuchsia-300" />
                  <Cell value={s.severe_miles} tone="text-red-300" />
                  <Cell value={s.high_miles} tone="text-orange-300" />
                  <td className="px-2 py-1.5 text-right text-slate-200">{s.avg_risk.toFixed(2)}</td>
                  <td className="px-2.5 py-1.5 text-right text-slate-200">{fmtDuration(r.duration_s)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
        <ListOrdered className="h-3 w-3" />
        Ranked by {rec.criteria.join(' > ')}; miles shown per level
      </p>
    </motion.section>
  )
}

function Cell({ value, tone }: { value: number; tone: string }) {
  return <td className={`px-2 py-1.5 text-right ${value > 0 ? `font-semibold ${tone}` : 'text-slate-600'}`}>{value > 0 ? `${value.toFixed(0)} mi` : '-'}</td>
}
