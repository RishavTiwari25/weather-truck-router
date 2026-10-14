import { create } from 'zustand'

import { api, RequestError } from './api/client'
import type { HeatVariable, HeatmapResponse, IntervalMi, PlanResponse } from './api/types'
import { localInputToISO, toLocalInputValue } from './lib/format'

export interface FormState {
  origin: string
  destination: string
  departureLocal: string // value of <input type="datetime-local">
  loadLb: number
  intervalMi: IntervalMi
}

export interface ActiveCheckpoint {
  routeId: string
  index: number
  pinned: boolean // clicked (sticky) vs hovered
  focus?: boolean // selected from the sidebar: map should fly to it
}

interface State {
  form: FormState
  plan: PlanResponse | null
  planning: boolean
  planError: string | null

  heatmap: HeatmapResponse | null
  heatmapLoading: boolean
  heatmapError: string | null

  selectedRouteId: string | null
  hoveredRouteId: string | null
  activeCheckpoint: ActiveCheckpoint | null

  hour: number // 0..48, fractional while playing
  playing: boolean
  heatVariable: HeatVariable
  showHeatmap: boolean
  showCheckpoints: boolean
  showAllRoutes: boolean
  heatOpacity: number

  setForm: (patch: Partial<FormState>) => void
  swapEndpoints: () => void
  submit: () => Promise<void>
  selectRoute: (id: string | null) => void
  hoverRoute: (id: string | null) => void
  setActiveCheckpoint: (cp: ActiveCheckpoint | null) => void
  setHour: (h: number) => void
  setPlaying: (p: boolean) => void
  setHeatVariable: (v: HeatVariable) => void
  toggle: (key: 'showHeatmap' | 'showCheckpoints' | 'showAllRoutes') => void
  setHeatOpacity: (o: number) => void
  reset: () => void
}

const defaultDeparture = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  return toLocalInputValue(d)
}

let planAbort: AbortController | null = null
let heatAbort: AbortController | null = null

export const useStore = create<State>((set, get) => ({
  form: {
    origin: 'Chicago, IL',
    destination: 'Denver, CO',
    departureLocal: defaultDeparture(),
    loadLb: 42000,
    intervalMi: 25,
  },
  plan: null,
  planning: false,
  planError: null,

  heatmap: null,
  heatmapLoading: false,
  heatmapError: null,

  selectedRouteId: null,
  hoveredRouteId: null,
  activeCheckpoint: null,

  hour: 0,
  playing: false,
  heatVariable: 'score',
  showHeatmap: true,
  showCheckpoints: true,
  showAllRoutes: true,
  heatOpacity: 0.85,

  setForm: (patch) => set((s) => ({ form: { ...s.form, ...patch } })),
  swapEndpoints: () =>
    set((s) => ({ form: { ...s.form, origin: s.form.destination, destination: s.form.origin } })),

  submit: async () => {
    const { form } = get()
    planAbort?.abort()
    heatAbort?.abort()
    planAbort = new AbortController()
    set({ planning: true, planError: null, heatmap: null, heatmapError: null, activeCheckpoint: null, playing: false })

    try {
      const plan = await api.plan(
        {
          origin: form.origin.trim(),
          destination: form.destination.trim(),
          departure: localInputToISO(form.departureLocal),
          load_lb: form.loadLb,
          interval_mi: form.intervalMi,
        },
        planAbort.signal,
      )
      set({ plan, planning: false, selectedRouteId: plan.recommendation.route_id, hour: 0 })

      // Heatmap loads after routes are on screen so the map feels instant.
      heatAbort = new AbortController()
      set({ heatmapLoading: true })
      try {
        const heatmap = await api.heatmap(plan.bbox, plan.corridor, heatAbort.signal)
        // Start the slider at the departure hour so the heatmap matches the trip.
        const departureHour = Math.max(0, Math.min(48, Math.round((plan.request.departure - heatmap.hours[0]) / 3600)))
        set({ heatmap, heatmapLoading: false, hour: departureHour })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        set({ heatmapLoading: false, heatmapError: err instanceof RequestError ? err.friendly : 'Heatmap unavailable.' })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const message = err instanceof RequestError ? err.friendly : 'Could not reach the planning service.'
      set({ planning: false, planError: message })
    }
  },

  selectRoute: (id) => set({ selectedRouteId: id }),
  hoverRoute: (id) => set({ hoveredRouteId: id }),
  setActiveCheckpoint: (cp) => set({ activeCheckpoint: cp }),
  setHour: (h) => set({ hour: Math.max(0, Math.min(48, h)) }),
  setPlaying: (p) => set({ playing: p }),
  setHeatVariable: (v) => set({ heatVariable: v }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<State>),
  setHeatOpacity: (o) => set({ heatOpacity: o }),
  reset: () => {
    planAbort?.abort()
    heatAbort?.abort()
    set({ plan: null, heatmap: null, planError: null, heatmapError: null, selectedRouteId: null, activeCheckpoint: null, playing: false, hour: 0 })
  },
}))

/** Derived helpers (kept outside components so they are trivially testable). */
export const selectRouteById = (plan: PlanResponse | null, id: string | null) =>
  plan?.routes.find((r) => r.id === id) ?? null

/** Unix timestamp of slider hour 0: the heatmap's first hour, or "now" floored. */
export const baseHour = (plan: PlanResponse | null, heatmap: HeatmapResponse | null) =>
  heatmap?.hours[0] ?? (plan ? plan.generated_at - (plan.generated_at % 3600) : Math.floor(Date.now() / 3600000) * 3600)

export const PLAYBACK_HOURS_PER_SECOND = 1.6
