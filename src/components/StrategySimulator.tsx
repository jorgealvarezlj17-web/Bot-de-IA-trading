import React, { useState } from 'react';
import { Terminal, Bot, Zap, Play, RefreshCw, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, PauseCircle } from 'lucide-react';
import { TradingDecision } from '../types';

export const StrategySimulator: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [decision, setDecision] = useState<TradingDecision | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Market Conditions Input
  const [symbol, setSymbol] = useState<string>('R_100');
  const [price, setPrice] = useState<number>(10245.5);
  const [rsi, setRsi] = useState<number>(24.2);
  const [ema9, setEma9] = useState<number>(10246.1);
  const [ema21, setEma21] = useState<number>(10242.3);
  const [trend, setTrend] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL'>('BULLISH');
  const [stake, setStake] = useState<number>(1.0);

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setDecision(null);

    try {
      const response = await fetch('/api/gemini/evaluate-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          price,
          rsi,
          ema9,
          ema21,
          trend,
          priceChange5t: price - (price - 1.5),
          volatility: 0.45,
          ticks: [price - 4, price - 3, price - 2, price - 1, price],
          stake,
        }),
      });

      const data = await response.json();

      if (data.success && data.decision) {
        setDecision(data.decision);
        setRawText(data.rawText || '');
      } else {
        setError(data.error || 'Error al obtener respuesta de Gemini API.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-yellow-400">
            <Terminal className="w-4 h-4" />
            <span>PILAR 5: SIMULADOR DE DECISIONES DE IA EN TIEMPO REAL</span>
          </div>
          <h2 className="text-xl font-bold text-white">Probar la Evaluación de Gemini Server Engine</h2>
          <p className="text-xs text-slate-400">
            Simula las condiciones del mercado y observa la llamada a función JSON que Gemini envía al bot ejecutor.
          </p>
        </div>

        <button
          onClick={handleSimulate}
          disabled={loading}
          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          <span>{loading ? 'Evaluando con IA...' : 'Ejecutar Evaluación de IA'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Controls */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span>Escenario de Mercado Simulado</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Símbolo Activo:</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono outline-none"
              >
                <option value="R_100">Volatility 100 Index</option>
                <option value="R_50">Volatility 50 Index</option>
                <option value="BOOM500">Boom 500 Index</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Precio Actual:</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 10000)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono outline-none"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">RSI (14):</label>
              <input
                type="number"
                value={rsi}
                onChange={(e) => setRsi(parseFloat(e.target.value) || 50)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono outline-none"
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">&lt; 30 (Sobrevendido), &gt; 70 (Sobrecomprado)</span>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Tendencia EMA:</label>
              <select
                value={trend}
                onChange={(e) => setTrend(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono outline-none"
              >
                <option value="BULLISH">BULLISH (Alcista)</option>
                <option value="BEARISH">BEARISH (Bajista)</option>
                <option value="NEUTRAL">NEUTRAL (Lateral)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">EMA 9 / EMA 21:</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={ema9}
                  onChange={(e) => setEma9(parseFloat(e.target.value) || 10000)}
                  className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono outline-none"
                />
                <input
                  type="number"
                  value={ema21}
                  onChange={(e) => setEma21(parseFloat(e.target.value) || 10000)}
                  className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Stake Base ($USD):</label>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(parseFloat(e.target.value) || 1.0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSimulate}
              disabled={loading}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              <span>Consultar a Gemini Server Engine</span>
            </button>
          </div>
        </div>

        {/* AI Output Result Box */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Bot className="w-4 h-4 text-purple-400" />
            <span>Respuesta Estructurada de Gemini API</span>
          </h3>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {decision ? (
            <div className="space-y-4">
              {/* Decision Badge */}
              <div className="p-4 rounded-2xl border flex items-center justify-between bg-slate-950 border-slate-800">
                <div className="flex items-center gap-3">
                  {decision.action === 'BUY_CALL' && (
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <ArrowUpRight className="w-6 h-6" />
                    </div>
                  )}
                  {decision.action === 'BUY_PUT' && (
                    <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                      <ArrowDownRight className="w-6 h-6" />
                    </div>
                  )}
                  {decision.action === 'HOLD' && (
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                      <PauseCircle className="w-6 h-6" />
                    </div>
                  )}
                  {decision.action === 'PAUSE' && (
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] text-slate-400 block font-mono">ACCIÓN RECOMENDADA</span>
                    <span
                      className={`text-lg font-bold font-mono ${
                        decision.action === 'BUY_CALL'
                          ? 'text-emerald-400'
                          : decision.action === 'BUY_PUT'
                          ? 'text-red-400'
                          : decision.action === 'PAUSE'
                          ? 'text-amber-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {decision.action}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-mono">CONFIANZA DE IA</span>
                  <span className="text-lg font-bold text-white font-mono">
                    {Math.round((decision.confidence || 0) * 100)}%
                  </span>
                </div>
              </div>

              {/* Technical Reasoning */}
              <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-1">
                <span className="text-[10px] text-purple-400 font-mono font-semibold">RAZONAMIENTO TÉCNICO:</span>
                <p className="text-xs text-slate-300 leading-relaxed">{decision.reasoning}</p>
              </div>

              {/* JSON Function Call Raw */}
              <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 font-mono">LLAMADA A FUNCIÓN JSON RECIBIDA:</span>
                <pre className="text-xs font-mono text-emerald-300 overflow-x-auto p-2 bg-slate-900 rounded-lg">
                  {JSON.stringify(decision, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-950/50 border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
              Haz clic en "Ejecutar Evaluación de IA" para probar cómo responde Gemini ante este escenario de mercado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
