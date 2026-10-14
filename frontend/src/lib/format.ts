const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayTimeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const fullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
export const fmtTime = (unix: number) => timeFmt.format(new Date(unix * 1000))
export const fmtDay = (unix: number) => dayFmt.format(new Date(unix * 1000))
export const fmtDayTime = (unix: number) => dayTimeFmt.format(new Date(unix * 1000))
export const fmtFull = (unix: number) => fullFmt.format(new Date(unix * 1000))

export function fmtDuration(seconds: number): string {
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export function fmtDurationDelta(seconds: number): string {
  const sign = seconds > 0 ? '+' : seconds < 0 ? '-' : ''
  return `${sign}${fmtDuration(Math.abs(seconds))}`
}

export const fmtMiles = (mi: number, digits = 0) =>
  `${mi.toLocaleString(undefined, { maximumFractionDigits: digits })} mi`

export const fmtLb = (lb: number) => `${lb.toLocaleString()} lb`
export const fmtKm = (mi: number) => `${Math.round(mi * 1.609344).toLocaleString()} km`
export const fmtTonnes = (lb: number) => `${(lb * 0.000453592).toFixed(1)} t`

export const fmtRelHours = (h: number) => (h === 0 ? 'Now' : `+${Math.round(h)}h`)

/** Local "YYYY-MM-DDTHH:MM" for <input type="datetime-local">. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Convert the datetime-local string back to an ISO-8601 string with offset. */
export function localInputToISO(value: string): string {
  const d = new Date(value)
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const pad = (n: number) => Math.abs(n).toString().padStart(2, '0')
  const base = toLocalInputValue(d)
  return `${base}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
}

export const WEATHER_CODES: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ hail',
  99: 'Thunderstorm w/ hail',
}
export const weatherText = (code: number) => WEATHER_CODES[code] ?? 'Unknown'

export const providerName = (p: string) => (p === 'metno' ? 'MET Norway' : p === 'open-meteo' ? 'Open-Meteo' : p)
