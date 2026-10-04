import React, { useState } from 'react';
import { Mt5MinimalDesk } from './components/Mt5MinimalDesk';
import { Zap, Smartphone } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Header Minimalista */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white font-mono">
                DERIV <span className="text-emerald-400">MT5</span> CLOUD DESK
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block text-xs text-slate-400">Control Central MT5</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>En Línea</span>
            </div>
          </div>
        </div>
      </header>

      {/* Área Principal de Control */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <Mt5MinimalDesk />
      </main>

      {/* Footer Minimalista */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <span>Deriv MT5 Cloud Bridge · Conectado a Winlator</span>
          <span className="text-slate-400 font-mono">Cuenta 41255620</span>
        </div>
      </footer>
    </div>
  );
}
