import type { Feature, FeatureCollection } from 'geojson'
import {
  type CanvasSource,
  type GeoJSONSource,
  type LayerSpecification,
  Map as MapLibreMap,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl'
// MapLibre 6 resolves its worker relative to import.meta.url, which breaks
// under bundlers. Point it at the file explicitly so dev and prod both work.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { LonLat, PlannedRoute, RiskLevel } from '../api/types'
import { indexRoute, positionAtTime, sliceByMiles, type RouteIndex } from '../lib/geo'
import { buildField, renderHeat } from '../lib/heat'
import { LEVEL_COLORS, routeColor } from '../lib/risk'
import { baseHour, selectRouteById, useStore } from '../store'
import { CheckpointPopup } from './CheckpointPopup'

setWorkerUrl(maplibreWorkerUrl)

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const SRC = { routes: 'routes', risk: 'risk-segments', cps: 'checkpoints', heat: 'heat' } as const
const LYR = {
  heat: 'heat-layer',
  casing: 'route-casing',
  line: 'route-line',
  risk: 'risk-line',
  cpHalo: 'cp-halo',
  cp: 'cp-circle',
} as const

const TRUCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>'

function pinElement(label: string, color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'marker-pin'
  el.style.background = color
  el.textContent = label
  return el
}

/** Refresh a non-animated canvas source after we redraw the canvas. */
function refreshCanvas(map: MapLibreMap, id: string) {
  const src = map.getSource(id) as CanvasSource | undefined
  if (!src) return
  src.play()
  map.once('render', () => src.pause())
  map.triggerRepaint()
}

export function MapView({ onTruckMile }: { onTruckMile: (mile: number | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const markersRef = useRef<Marker[]>([])
  const truckRef = useRef<Marker | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const popupNode = useMemo(() => document.createElement('div'), [])

  const plan = useStore((s) => s.plan)
  const heatmap = useStore((s) => s.heatmap)
  const selectedId = useStore((s) => s.selectedRouteId)
  const hoveredId = useStore((s) => s.hoveredRouteId)
  const hour = useStore((s) => s.hour)
  const variable = useStore((s) => s.heatVariable)
  const showHeatmap = useStore((s) => s.showHeatmap)
  const showCheckpoints = useStore((s) => s.showCheckpoints)
  const showAllRoutes = useStore((s) => s.showAllRoutes)
  const heatOpacity = useStore((s) => s.heatOpacity)
  const active = useStore((s) => s.activeCheckpoint)
  const setActive = useStore((s) => s.setActiveCheckpoint)

  const indexes = useMemo(() => {
    const m = new Map<string, RouteIndex>()
    plan?.routes.forEach((r) => m.set(r.id, indexRoute(r)))
    return m
  }, [plan])

  const field = useMemo(() => (heatmap ? buildField(heatmap, variable) : null), [heatmap, variable])

  // ---------------------------------------------------------------- map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: [-96, 39],
      zoom: 3.6,
      attributionControl: { compact: true },
      maxPitch: 0,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'imperial' }), 'bottom-left')

    map.on('load', () => {
      map.addSource(SRC.routes, { type: 'geojson', data: emptyFC() })
      map.addSource(SRC.risk, { type: 'geojson', data: emptyFC() })
      map.addSource(SRC.cps, { type: 'geojson', data: emptyFC() })

      const firstSymbol = map.getStyle().layers?.find((l: LayerSpecification) => l.type === 'symbol')?.id

      map.addLayer(
        {
          id: LYR.casing,
          type: 'line',
          source: SRC.routes,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0b1120',
            'line-width': ['case', ['get', 'selected'], 11, 7],
            'line-opacity': ['case', ['get', 'selected'], 0.9, 0.5],
          },
        },
        firstSymbol,
      )
      map.addLayer(
        {
          id: LYR.line,
          type: 'line',
          source: SRC.routes,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['case', ['get', 'selected'], 7, ['get', 'hovered'], 5, 3.5],
            'line-opacity': ['case', ['get', 'selected'], 1, ['get', 'hovered'], 0.9, 0.55],
          },
        },
        firstSymbol,
      )
      map.addLayer(
        {
          id: LYR.risk,
          type: 'line',
          source: SRC.risk,
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 1 },
        },
        firstSymbol,
      )
      map.addLayer({
        id: LYR.cpHalo,
        type: 'circle',
        source: SRC.cps,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 7, 8, 11, 12, 16],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['get', 'selected'], 0.25, 0.08],
          'circle-blur': 0.4,
        },
      })
      map.addLayer({
        id: LYR.cp,
        type: 'circle',
        source: SRC.cps,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['get', 'selected'], 4.5, 3], 8, ['case', ['get', 'selected'], 6.5, 4], 12, ['case', ['get', 'selected'], 9, 6]],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['case', ['get', 'selected'], 1.6, 1],
          'circle-opacity': ['case', ['get', 'selected'], 1, 0.75],
          'circle-stroke-opacity': ['case', ['get', 'selected'], 1, 0.6],
        },
      })

      // ----------------------------------------------------- interactions
      const store = useStore.getState
      map.on('mousemove', LYR.line, (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = 'pointer'
        const id = e.features?.[0]?.properties?.id as string | undefined
        if (id && store().hoveredRouteId !== id) store().hoverRoute(id)
      })
      map.on('mouseleave', LYR.line, () => {
        map.getCanvas().style.cursor = ''
        store().hoverRoute(null)
      })
      map.on('click', LYR.line, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined
        if (id) store().selectRoute(id)
      })
      map.on('mousemove', LYR.cp, (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = 'pointer'
        const f = e.features?.[0]
        if (!f) return
        const current = store().activeCheckpoint
        if (current?.pinned) return
        store().setActiveCheckpoint({ routeId: f.properties.routeId, index: f.properties.index, pinned: false })
      })
      map.on('mouseleave', LYR.cp, () => {
        map.getCanvas().style.cursor = ''
        const current = store().activeCheckpoint
        if (current && !current.pinned) store().setActiveCheckpoint(null)
      })
      map.on('click', LYR.cp, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f) return
        e.preventDefault()
        store().selectRoute(f.properties.routeId)
        store().setActiveCheckpoint({ routeId: f.properties.routeId, index: f.properties.index, pinned: true })
      })
      map.on('click', (e: MapMouseEvent) => {
        if (e.defaultPrevented) return
        const hits = map.queryRenderedFeatures(e.point, { layers: [LYR.cp, LYR.line] })
        if (hits.length === 0) store().setActiveCheckpoint(null)
      })

      setReady(true)
    })

    if (import.meta.env.DEV) (window as unknown as { __map?: MapLibreMap }).__map = map
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)
    mapRef.current = map
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ------------------------------------------------------- routes & points
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    if (!plan) {
      ;(map.getSource(SRC.routes) as GeoJSONSource).setData(emptyFC())
      ;(map.getSource(SRC.risk) as GeoJSONSource).setData(emptyFC())
      ;(map.getSource(SRC.cps) as GeoJSONSource).setData(emptyFC())
      return
    }

    const visibleRoutes = plan.routes.filter((r) => showAllRoutes || r.id === selectedId)
    ;(map.getSource(SRC.routes) as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: visibleRoutes
        .slice()
        // Draw the selected route last so it sits on top.
        .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
        .map((r) => ({
          type: 'Feature',
          properties: { id: r.id, color: routeColor(r.id), selected: r.id === selectedId, hovered: r.id === hoveredId },
          geometry: { type: 'LineString', coordinates: r.geometry },
        })),
    })

    const selected = selectRouteById(plan, selectedId)
    const idx = selected ? indexes.get(selected.id) : undefined
    ;(map.getSource(SRC.risk) as GeoJSONSource).setData(selected && idx ? riskSegments(selected, idx) : emptyFC())

    ;(map.getSource(SRC.cps) as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: showCheckpoints
        ? visibleRoutes
            .slice()
            .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
            .flatMap((r) =>
              r.checkpoints.map((cp) => ({
                type: 'Feature' as const,
                properties: {
                  routeId: r.id,
                  index: cp.index,
                  level: cp.risk.level,
                  color: LEVEL_COLORS[cp.risk.level as RiskLevel],
                  selected: r.id === selectedId,
                },
                geometry: { type: 'Point' as const, coordinates: [cp.lon, cp.lat] },
              })),
            )
        : [],
    })

    const o = plan.request.origin
    const d = plan.request.destination
    markersRef.current.push(
      new Marker({ element: pinElement('S', '#22c55e') }).setLngLat([o.lon, o.lat]).addTo(map),
      new Marker({ element: pinElement('E', '#fb7185') }).setLngLat([d.lon, d.lat]).addTo(map),
    )
  }, [plan, ready, selectedId, hoveredId, showAllRoutes, showCheckpoints, indexes])

  // Fit the map whenever a new plan arrives.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !plan) return
    const [w, s, e, n] = plan.bbox
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: { top: 60, right: 60, bottom: 190, left: 60 }, duration: 900, maxZoom: 9 },
    )
  }, [plan, ready])

  // ---------------------------------------------------------------- heatmap
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (map.getLayer(LYR.heat)) map.removeLayer(LYR.heat)
    if (map.getSource(SRC.heat)) map.removeSource(SRC.heat)
    if (!heatmap || !field) return

    const [w, s, e, n] = heatmap.bbox
    renderHeat(canvasRef.current, heatmap, field, useStore.getState().hour, heatOpacity)
    map.addSource(SRC.heat, {
      type: 'canvas',
      canvas: canvasRef.current,
      coordinates: [
        [w, n],
        [e, n],
        [e, s],
        [w, s],
      ],
      animate: false,
    })
    const firstSymbol = map.getStyle().layers?.find((l: LayerSpecification) => l.type === 'symbol')?.id
    map.addLayer(
      {
        id: LYR.heat,
        type: 'raster',
        source: SRC.heat,
        paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
        layout: { visibility: showHeatmap ? 'visible' : 'none' },
      },
      map.getLayer(LYR.casing) ? LYR.casing : firstSymbol,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmap, field, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !heatmap || !field || !map.getSource(SRC.heat)) return
    renderHeat(canvasRef.current, heatmap, field, hour, heatOpacity)
    refreshCanvas(map, SRC.heat)
  }, [hour, heatOpacity, heatmap, field, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer(LYR.heat)) return
    map.setLayoutProperty(LYR.heat, 'visibility', showHeatmap ? 'visible' : 'none')
  }, [showHeatmap, ready, heatmap])

  // ------------------------------------------------------------ truck marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const selected = selectRouteById(plan, selectedId)
    const idx = selected ? indexes.get(selected.id) : undefined
    if (!plan || !selected || !idx) {
      truckRef.current?.remove()
      truckRef.current = null
      onTruckMile(null)
      return
    }
    const ts = baseHour(plan, heatmap) + hour * 3600
    const pos = positionAtTime(selected, idx, ts)
    if (!pos) {
      truckRef.current?.remove()
      truckRef.current = null
      onTruckMile(null)
      return
    }
    if (!truckRef.current) {
      const el = document.createElement('div')
      el.className = 'truck-marker'
      el.innerHTML = TRUCK_SVG
      truckRef.current = new Marker({ element: el }).setLngLat(pos.point).addTo(map)
    } else {
      truckRef.current.setLngLat(pos.point)
    }
    onTruckMile(pos.mile)
  }, [plan, heatmap, selectedId, hour, indexes, ready, onTruckMile])

  // ----------------------------------------------------------------- popup
  const activeRoute = active ? selectRouteById(plan, active.routeId) : null
  const activeCp = activeRoute && active ? activeRoute.checkpoints[active.index] : null

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!activeCp) {
      popupRef.current?.remove()
      popupRef.current = null
      return
    }
    if (!popupRef.current) {
      popupRef.current = new Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: 'none' })
        .setDOMContent(popupNode)
        .addTo(map)
    }
    popupRef.current.setLngLat([activeCp.lon, activeCp.lat])
    if (active?.focus) map.easeTo({ center: [activeCp.lon, activeCp.lat], zoom: Math.max(map.getZoom(), 7), duration: 700 })
  }, [activeCp, active?.focus, ready, popupNode])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {activeCp &&
        activeRoute &&
        active &&
        createPortal(
          <CheckpointPopup route={activeRoute} checkpoint={activeCp} pinned={active.pinned} onClose={() => setActive(null)} />,
          popupNode,
        )}
    </>
  )
}

function emptyFC(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

/** Colour the selected route by the risk of each checkpoint-to-checkpoint segment. */
function riskSegments(route: PlannedRoute, idx: RouteIndex): FeatureCollection {
  const features: Feature[] = []
  const cps = route.checkpoints
  for (let i = 0; i < cps.length - 1; i++) {
    const level = Math.max(cps[i].risk.level, cps[i + 1].risk.level) as RiskLevel
    const coords: LonLat[] = sliceByMiles(idx, cps[i].mile, cps[i + 1].mile)
    features.push({
      type: 'Feature',
      properties: { color: LEVEL_COLORS[level], level },
      geometry: { type: 'LineString', coordinates: coords },
    })
  }
  return { type: 'FeatureCollection', features }
}
