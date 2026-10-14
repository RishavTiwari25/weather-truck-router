import { useEffect, useState } from 'react'

import { api } from '../api/client'
import { providerName } from '../lib/format'

type Status = 'checking' | 'online' | 'offline'

export function Header() {
  const [status, setStatus] = useState<Status>('checking')
  const [provider, setProvider] = useState<string>('')
  const [weather, setWeather] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    api
      .health()
      .then((h) => {
        if (cancelled) return
        setStatus('online')
        setProvider(h.routing_provider === 'osrm' ? 'OSRM' : 'OpenRouteService')
        setWeather(providerName(h.weather_provider))
      })
      .catch(() => !cancelled && setStatus('offline'))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3.5">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="shrink-0">
        <rect width="28" height="28" rx="6" fill="#1d1d1b" />
        <path d="M6 19c3-6 6-7 9-3s5 3 7-3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="6" cy="19" r="2" fill="#2e9e5b" />
        <circle cx="22" cy="13" r="2" fill="#d1352b" />
      </svg>
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold leading-tight text-ink">ClearHaul</h1>
        <p className="truncate text-xs text-muted">Truck routing that checks the forecast along the way</p>
      </div>
      <div
        className="ml-auto flex items-center gap-1.5 text-xs text-muted"
        title={status === 'online' ? `Routing via ${provider}, weather via ${weather}` : status === 'offline' ? 'API unreachable' : 'Checking API'}
      >
        <span
          className={`h-2 w-2 rounded-full ${status === 'online' ? 'bg-risk-low' : status === 'offline' ? 'bg-risk-severe' : 'bg-line-strong'}`}
        />
        {status === 'online' ? 'Live' : status === 'offline' ? 'Offline' : 'Connecting'}
      </div>
    </header>
  )
}
