import { motion } from 'framer-motion'
import { AlertOctagon, AlertTriangle, CheckCircle2, ListOrdered, ShieldCheck } from 'lucide-react'

import type { PlanResponse } from '../api/types'
import { fmtFull } from '../lib/format'
import { routeColor } from '../lib/risk'
import { useStore } from '../store'

export function RecommendationCard({ plan }: { plan: PlanResponse }) {
  const rec = plan.recommendation
  const route = plan.routes.find((r) => r.id === rec.route_id)
  const selectRoute = useStore((s) => s.selectRoute)
  if (!route) return null
  const color = routeColor(route.id)

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
      style={{ background: `linear-gradient(135deg, ${color}22, rgba(17,26,46,0.9) 55%)` }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ background: `${color}33` }} />
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: color }}>
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

      {rec.comparisons.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
          {rec.comparisons.map((c) => (
            <p key={c.route_id} className="flex items-center gap-2 text-xs text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ background: routeColor(c.route_id) }} />
              {c.reason}
            </p>
          ))}
        </div>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
        <ListOrdered className="h-3 w-3" />
        Ranked by {rec.criteria.join(' > ')}
      </p>
    </motion.section>
  )
}
