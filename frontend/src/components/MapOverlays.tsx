import { Loader2 } from 'lucide-react'

import type { RiskLevel } from '../api/types'
import { LEVEL_COLORS, LEVEL_LABELS } from '../lib/risk'
import { useStore } from '../store'

/** Small overlays on the map: a risk legend and a quiet loading notice. */
export function MapOverlays() {
  const planning = useStore((s) => s.planning)
  const plan = useStore((s) => s.plan)

  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
        <div className="float pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 text-xs text-ink-soft">
          {LEVEL_LABELS.map((label, level) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLORS[level as RiskLevel] }} />
              {label}
            </span>
          ))}
        </div>
        {planning && (
          <div className="float pointer-events-auto flex items-center gap-2 px-3 py-2 text-xs text-ink-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Finding routes and checking the forecast along them. Usually 10 to 20 seconds.
          </div>
        )}
        {!planning && !plan && (
          <div className="float pointer-events-auto max-w-xs px-3 py-2 text-xs leading-relaxed text-ink-soft">
            Enter a trip on the left. Routes, checkpoints and the 48-hour weather corridor will appear here.
          </div>
        )}
      </div>
    </>
  )
}
