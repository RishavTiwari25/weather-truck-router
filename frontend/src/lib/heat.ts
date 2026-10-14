import type { HeatVariable, HeatmapResponse } from '../api/types'
import { invMercatorY, mercatorY } from './geo'
import { scoreToRGBA, variableScore } from './risk'

export const PX_PER_CELL = 10

/**
 * Pre-computed per-hour value grids for one variable. Masked cells are NaN.
 * Values are already converted to the shared 0..4.5 risk score so the colour
 * ramp means the same thing for every variable.
 */
export interface HeatField {
  nx: number
  ny: number
  frames: Float32Array[] // frames[hour][j * nx + i]
}

export function buildField(hm: HeatmapResponse, variable: HeatVariable): HeatField {
  const nHours = hm.hours.length
  const size = hm.nx * hm.ny
  const source = hm[variable]
  const frames: Float32Array[] = []
  for (let h = 0; h < nHours; h++) {
    const frame = new Float32Array(size).fill(NaN)
    for (let c = 0; c < hm.cells.length; c++) {
      frame[hm.cells[c]] = variableScore(variable, source[c][h])
    }
    frames.push(frame)
  }
  return { nx: hm.nx, ny: hm.ny, frames }
}

/** Bilinear sample with NaN-aware weights. Returns NaN when nothing is nearby. */
function sample(frame: Float32Array, nx: number, ny: number, fx: number, fy: number): [number, number] {
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  let acc = 0
  let wsum = 0
  for (let dy = 0; dy <= 1; dy++) {
    const y = y0 + dy
    if (y < 0 || y >= ny) continue
    const wy = dy ? ty : 1 - ty
    for (let dx = 0; dx <= 1; dx++) {
      const x = x0 + dx
      if (x < 0 || x >= nx) continue
      const v = frame[y * nx + x]
      if (Number.isNaN(v)) continue
      const w = wy * (dx ? tx : 1 - tx)
      acc += v * w
      wsum += w
    }
  }
  return wsum === 0 ? [NaN, 0] : [acc / wsum, wsum]
}

/**
 * Paint one (possibly fractional) hour of the field onto a canvas whose pixel
 * grid is linear in Web-Mercator, so MapLibre can drape it without distortion.
 */
export function renderHeat(
  canvas: HTMLCanvasElement,
  hm: HeatmapResponse,
  field: HeatField,
  hour: number,
  opacity: number,
): void {
  const W = hm.nx * PX_PER_CELL
  const H = hm.ny * PX_PER_CELL
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W
    canvas.height = H
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(W, H)
  const data = img.data

  const h0 = Math.min(field.frames.length - 1, Math.max(0, Math.floor(hour)))
  const h1 = Math.min(field.frames.length - 1, h0 + 1)
  const ft = Math.min(1, Math.max(0, hour - h0))
  const f0 = field.frames[h0]
  const f1 = field.frames[h1]

  const [, south, , north] = hm.bbox
  const yTop = mercatorY(north)
  const yBottom = mercatorY(south)

  for (let py = 0; py < H; py++) {
    // Pixel row -> latitude via inverse Mercator, then fractional grid row (row 0 = south).
    const my = yTop + ((py + 0.5) / H) * (yBottom - yTop)
    const lat = invMercatorY(my)
    const fy = (lat - south) / hm.cell_lat - 0.5
    for (let px = 0; px < W; px++) {
      const fx = ((px + 0.5) / W) * hm.nx - 0.5
      const [v0, w0] = sample(f0, hm.nx, hm.ny, fx, fy)
      const [v1, w1] = sample(f1, hm.nx, hm.ny, fx, fy)
      let value: number
      let coverage: number
      if (Number.isNaN(v0) && Number.isNaN(v1)) continue
      if (Number.isNaN(v0)) {
        value = v1
        coverage = w1
      } else if (Number.isNaN(v1)) {
        value = v0
        coverage = w0
      } else {
        value = v0 + (v1 - v0) * ft
        coverage = Math.max(w0, w1)
      }
      const [r, g, b, a] = scoreToRGBA(value)
      const o = (py * W + px) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      // Soft edge where the corridor mask ends.
      data[o + 3] = Math.round(255 * a * opacity * Math.min(1, coverage * 1.4))
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** Nearest-cell value lookup for tooltips (raw units, not score). */
export function valueAt(hm: HeatmapResponse, variable: HeatVariable, lon: number, lat: number, hour: number): number | null {
  const [west, south] = hm.bbox
  const i = Math.floor((lon - west) / hm.cell_lon)
  const j = Math.floor((lat - south) / hm.cell_lat)
  if (i < 0 || j < 0 || i >= hm.nx || j >= hm.ny) return null
  const flat = j * hm.nx + i
  const c = hm.cells.indexOf(flat)
  if (c < 0) return null
  const h = Math.min(hm.hours.length - 1, Math.max(0, Math.round(hour)))
  return hm[variable][c][h]
}
