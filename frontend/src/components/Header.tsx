import { CloudLightning } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '../api/client'

type Status = 'checking' | 'online' | 'offline'

export function Header() {
  const [status, setStatus] = useState<Status>('checking')
  const [provider, setProvider] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    api
      .health()
      .then((h) => {
        if (cancelled) return
        setStatus('online')
        setProvider(h.routing_provider === 'osrm' ? 'OSRM' : 'ORS truck')
      })
      .catch(() => !cancelled && setStatus('offline'))
    return () => {
      cancelled = true
    }
  }, [])

  const dot = status === 'online' ? 'bg-emerald-400' : status === 'offline' ? 'bg-red-400' : 'bg-slate-500'

  return (
    <header className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-glow">
        <CloudLightning className="h-5 w-5 text-ink-950" strokeWidth={2.4} />
      </div>
      <div className="min-w-0">
        <h1 className="text-[17px] font-bold leading-tight tracking-tight text-white">ClearHaul</h1>
        <p className="truncate text-xs text-slate-400">Weather-aware truck routing for India</p>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <span
          className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-slate-400"
          title={status === 'online' ? `API online - routing via ${provider}, weather via Open-Meteo` : status === 'offline' ? 'API unreachable' : 'Checking API'}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status === 'checking' ? 'animate-pulse' : ''}`} />
          {status === 'online' ? provider : status === 'offline' ? 'offline' : 'api'}
        </span>
      </div>
    </header>
  )
}
