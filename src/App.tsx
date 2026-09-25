import React, { useState } from 'react';
import { Header } from './components/Header';
import { ArchitectureGuide } from './components/ArchitectureGuide';
import { AiStudioBrain } from './components/AiStudioBrain';
import { PythonExecutorCode } from './components/PythonExecutorCode';
import { DerivTester } from './components/DerivTester';
import { StrategySimulator } from './components/StrategySimulator';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('guide');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Bar Header */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'guide' && <ArchitectureGuide onGoToTab={setActiveTab} />}
        {activeTab === 'brain' && <AiStudioBrain />}
        {activeTab === 'python' && <PythonExecutorCode />}
        {activeTab === 'deriv' && <DerivTester />}
        {activeTab === 'simulator' && <StrategySimulator />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Deriv AI Trading Hub &copy; {new Date().getFullYear()} — Control Móvil con Google AI Studio</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Deriv WebSocket API</span>
            <span>·</span>
            <span>Gemini 3.8 Flash</span>
            <span>·</span>
            <span>Render / Cloud 24/7</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
