import React from 'react';
import { Bot, Cpu, Server, Activity, Terminal } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'guide', label: '1. Arquitectura Móvil', icon: Cpu },
    { id: 'brain', label: '2. Cerebro AI Studio', icon: Bot },
    { id: 'python', label: '3. Ejecutor Python', icon: Server },
    { id: 'deriv', label: '4. Conexión Deriv', icon: Activity },
    { id: 'simulator', label: '5. Probador en Vivo', icon: Terminal },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-white font-mono">
              DERIV <span className="text-emerald-400">AI</span> TRADING HUB
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs text-slate-400 font-sans">
              Google AI Studio + Python Cloud + Deriv WS
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links / Segmented Buttons */}
        <nav className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
