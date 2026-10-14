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
  const ranked = plan.routes.slice().sort((a, b) => a.rank - b.rank)

  return (
    <section className="card p-4">
      <p className="text-xs text-muted">
        {plan.request.origin.label.split(',')[0]} to {plan.request.destination.label.split(',')[0]}, leaving {fmtFull(plan.request.departure)}
      </p>
      <h2 className="mt-1 text-base font-semibold text-ink">
        Take{' '}
        <button type="button" onClick={() => selectRoute(route.id)} className="underline decoration-2 underline-offset-2" style={{ textDecorationColor: routeColor(route.id) }}>
          Route {route.id}
        </button>
      </h2>

      {rec.advisory !== 'ok' && (
        <p className={`mt-2 rounded-md px-3 py-2 text-xs ring-1 ${rec.advisory === 'no_travel' ? 'bg-[#f1e3f7] text-[#6a1890] ring-[#d9b6e8]' : 'bg-[#fbe2df] text-[#9a251d] ring-[#f1b1ab]'}`}>
          {rec.advisory === 'no_travel'
            ? 'Every option crosses No-Travel conditions. Consider leaving later.'
            : 'Severe weather cannot be fully avoided on this trip.'}
        </p>
      )}

      <ul className="mt-2 space-y-1 text-sm leading-snug text-ink-soft">
        {rec.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-muted">
            <th className="py-1 font-medium">Route</th>
            <th className="py-1 text-right font-medium" title="No-Travel miles">
              No travel
            </th>
            <th className="py-1 text-right font-medium">Severe</th>
            <th className="py-1 text-right font-medium">High</th>
            <th className="py-1 text-right font-medium">Avg</th>
            <th className="py-1 text-right font-medium">Time</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {ranked.map((r) => {
            const s = r.summary
            return (
              <tr
                key={r.id}
                onClick={() => selectRoute(r.id)}
                className={`cursor-pointer border-t border-line hover:bg-paper ${r.id === selectedId ? 'bg-paper' : ''}`}
              >
                <td className="py-1.5 font-sans">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: routeColor(r.id) }} />
                  {r.id} <span className="text-muted">#{r.rank}</span>
                </td>
                <Cell value={s.no_travel_miles} />
                <Cell value={s.severe_miles} />
                <Cell value={s.high_miles} />
                <td className="py-1.5 text-right">{s.avg_risk.toFixed(2)}</td>
                <td className="py-1.5 text-right">{fmtDuration(r.duration_s)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-muted">
        Ranked by {rec.criteria.join(', then ').toLowerCase()}. Miles are shown per level.
      </p>
    </section>
  )
}

function Cell({ value }: { value: number }) {
  return <td className={`py-1.5 text-right ${value > 0 ? 'text-ink' : 'text-line-strong'}`}>{value > 0 ? `${value.toFixed(0)} mi` : '0'}</td>
}
