import type { ApiError, HeatmapResponse, LonLat, PlanRequest, PlanResponse } from './types'

/** Empty in dev (Vite proxy) and in single-service deploys; set for split hosting. */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export class RequestError extends Error {
  code: string
  details?: ApiError['details']
  status: number

  constructor(status: number, err: ApiError) {
    super(err.message)
    this.status = status
    this.code = err.code
    this.details = err.details
  }

  /** Flatten DRF field errors into one readable sentence. */
  get friendly(): string {
    if (!this.details) return this.message
    return Object.entries(this.details)
      .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(' ') : msgs}`)
      .join(' ')
  }
}

async function request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err: ApiError = body?.error ?? { code: 'http_error', message: `HTTP ${res.status}` }
    throw new RequestError(res.status, err)
  }
  return body as T
}

export const api = {
  plan: (payload: PlanRequest, signal?: AbortSignal) =>
    request<PlanResponse>('/api/plan', { method: 'POST', body: JSON.stringify(payload) }, signal),

  heatmap: (bbox: PlanResponse['bbox'], corridor: LonLat[], signal?: AbortSignal) =>
    request<HeatmapResponse>('/api/heatmap', { method: 'POST', body: JSON.stringify({ bbox, corridor }) }, signal),

  health: () => request<{ status: string; routing_provider: string; weather_provider: string }>('/api/health', { method: 'GET' }),
}
