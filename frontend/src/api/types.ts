/** Mirrors the Django API payloads (backend/routing/services/*). */

export type RiskLevel = 0 | 1 | 2 | 3 | 4
export type IntervalMi = 10 | 25 | 50
export type HeatVariable = 'score' | 'wind' | 'rain' | 'snow'
export type LonLat = [number, number]

export interface Place {
  query: string
  label: string
  lat: number
  lon: number
  provider: string
}

export interface Weather {
  wind_mph: number
  gust_mph: number
  rain_in_hr: number
  snow_in_hr: number
  temp_f: number
  weather_code: number
  visibility_m: number
  forecast_hour: number
}

export interface Risk {
  level: RiskLevel
  label: string
  score: number
  wind_level: RiskLevel
  rain_level: RiskLevel
  snow_level: RiskLevel
  drivers: string[]
}

export interface Checkpoint {
  index: number
  lon: number
  lat: number
  mile: number
  eta: number
  weather: Weather
  risk: Risk
}

export interface RouteSummary {
  total_miles: number
  duration_s: number
  miles_by_level: number[]
  no_travel_miles: number
  severe_miles: number
  high_miles: number
  moderate_miles: number
  low_miles: number
  avg_risk: number
  max_level: RiskLevel
  max_label: string
  worst_checkpoint_index: number
  checkpoint_count: number
}

export interface PlannedRoute {
  id: string
  name: string
  provider: string
  profile: string | null
  synthetic: boolean
  via: LonLat | null
  distance_mi: number
  duration_s: number
  departure: number
  eta: number
  geometry: LonLat[]
  checkpoints: Checkpoint[]
  summary: RouteSummary
  rank: number
  recommended: boolean
}

export interface Recommendation {
  route_id: string
  reasons: string[]
  comparisons: { route_id: string; reason: string }[]
  advisory: 'ok' | 'severe' | 'no_travel'
  criteria: string[]
}

export interface PlanRequest {
  origin: string
  destination: string
  departure: string
  load_lb: number
  interval_mi: IntervalMi
}

export type WeatherProvider = 'open-meteo' | 'metno'

export interface PlanResponse {
  request: {
    origin: Place
    destination: Place
    departure: number
    load_lb: number
    interval_mi: IntervalMi
  }
  routes: PlannedRoute[]
  recommendation: Recommendation
  weather_provider: WeatherProvider
  bbox: [number, number, number, number]
  corridor: LonLat[]
  timing_ms: { geocoding: number; routing: number; weather: number; total: number }
  generated_at: number
}

export interface HeatmapResponse {
  bbox: [number, number, number, number]
  nx: number
  ny: number
  cell_lon: number
  cell_lat: number
  hours: number[]
  cells: number[]
  wind: number[][]
  rain: number[][]
  snow: number[][]
  score: number[][]
  generated_at: number
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, string[] | string>
}
