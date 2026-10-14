import { CloudLightning } from 'lucide-react'

export function Header() {
  return (
    <header className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-glow">
        <CloudLightning className="h-5 w-5 text-ink-950" strokeWidth={2.4} />
      </div>
      <div className="min-w-0">
        <h1 className="text-[17px] font-bold leading-tight tracking-tight text-white">ClearHaul</h1>
        <p className="truncate text-xs text-slate-400">Weather-aware truck routing</p>
      </div>
      <div className="ml-auto hidden items-center gap-1.5 sm:flex">
        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-slate-400">
          0-48h forecast
        </span>
      </div>
    </header>
  )
}
