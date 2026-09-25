import React, { useState } from 'react';
import { Activity, ShieldCheck, RefreshCw, DollarSign, Zap, CheckCircle2, AlertTriangle, Play, Sliders } from 'lucide-react';
import { DerivAccount, MarketIndicators } from '../types';

export const DerivTester: React.FC = () => {
  const [token, setToken] = useState<string>('');
  const [appId, setAppId] = useState<string>('1089');
  const [loading, setLoading] = useState<boolean>(false);
  const [account, setAccount] = useState<DerivAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tick Streamer States
  const [symbol, setSymbol] = useState<string>('R_100');
  const [fetchingTicks, setFetchingTicks] = useState<boolean>(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [indicators, setIndicators] = useState<MarketIndicators | null>(null);

  const handleTestConnection = async () => {
    if (!token.trim()) {
      setError('Por favor ingresa tu Token de API de Deriv.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/deriv/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), appId }),
      });

      const data = await response.json();

      if (data.success) {
        setAccount(data.account);
      } else {
        setError(data.error || 'No se pudo autorizar el Token.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de red al conectar con Deriv.');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchTicks = async () => {
    setFetchingTicks(true);
    try {
      const response = await fetch('/api/deriv/fetch-ticks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, count: 25, appId }),
      });

      const data = await response.json();

      if (data.success && data.prices) {
        const pricesList: number[] = data.prices;
        setTicks(pricesList);

        // Compute local indicators
        if (pricesList.length >= 14) {
          const lastPrice = pricesList[pricesList.length - 1];
          const deltas = [];
          for (let i = 1; i < pricesList.length; i++) {
            deltas.push(pricesList[i] - pricesList[i - 1]);
          }
          const recent14 = deltas.slice(-14);
          const gains = recent14.map((d) => (d > 0 ? d : 0));
          const losses = recent14.map((d) => (d < 0 ? -d : 0));
          const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
          const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          const calculatedRsi = round(100 - 100 / (1 + rs), 2);

          // EMA 9 & EMA 21
          const ema9Val = calcEMA(pricesList, 9);
          const ema21Val = calcEMA(pricesList, 21);
          const trendDir = ema9Val > ema21Val ? 'BULLISH' : ema9Val < ema21Val ? 'BEARISH' : 'NEUTRAL';
          const pDiff5 = round(lastPrice - pricesList[pricesList.length - 5], 4);

          setIndicators({
            price: lastPrice,
            rsi: calculatedRsi,
            ema9: ema9Val,
            ema21: ema21Val,
            trend: trendDir,
            priceChange5t: pDiff5,
            volatility: 0.35,
          });
        }
      } else {
        setError(data.error || 'Error obteniendo ticks de Deriv.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setFetchingTicks(false);
    }
  };

  const calcEMA = (prices: number[], period: number) => {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return round(ema, 4);
  };

  const round = (val: number, decimals: number) => {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400">
            <Activity className="w-4 h-4" />
            <span>PILAR 3: LA CONEXIÓN AL MERCADO (DERIV WEBSOCKET API)</span>
          </div>
          <h2 className="text-xl font-bold text-white">Probador de Conexión & Streamer de Ticks</h2>
          <p className="text-xs text-slate-400">
            Prueba tu API Token de Deriv y verifica el balance de cuenta y flujo de ticks en tiempo real.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Form */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Validar Token de Cuenta Deriv</span>
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Deriv API Token (Demo o Real):
              </label>
              <input
                type="password"
                placeholder="Ej. w8Xa9yZ... (Obtenlo en Deriv -> Token de API)"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Deriv App ID:
                </label>
                <input
                  type="text"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleTestConnection}
                  disabled={loading}
                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  <span>{loading ? 'Validando...' : 'Verificar Token'}</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {account && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-xs text-white">Cuenta Conectada con Éxito</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                      account.is_virtual
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {account.is_virtual ? 'CUENTA DEMO' : 'CUENTA REAL'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-emerald-500/20">
                  <div>
                    <span className="text-slate-400 block text-[10px]">ID de Cuenta:</span>
                    <span className="text-white font-bold">{account.loginid}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Balance en Vivo:</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ${account.balance.toLocaleString()} {account.currency}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Market Ticks Streamer */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>Simulador de Mercado (Ticks en Vivo)</span>
            </h3>

            <div className="flex items-center gap-2">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-white outline-none"
              >
                <option value="R_100">Volatility 100 Index (R_100)</option>
                <option value="R_50">Volatility 50 Index (R_50)</option>
                <option value="R_10">Volatility 10 Index (R_10)</option>
                <option value="BOOM500">Boom 500 Index</option>
                <option value="CRASH500">Crash 500 Index</option>
              </select>

              <button
                onClick={handleFetchTicks}
                disabled={fetchingTicks}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition-all flex items-center gap-1 disabled:opacity-50"
              >
                {fetchingTicks ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>Obtener Ticks</span>
              </button>
            </div>
          </div>

          {indicators ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-mono">PRECIO ACTUAL</span>
                  <span className="text-sm font-bold text-white font-mono">{indicators.price}</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-mono">RSI (14)</span>
                  <span
                    className={`text-sm font-bold font-mono ${
                      indicators.rsi < 30
                        ? 'text-emerald-400'
                        : indicators.rsi > 70
                        ? 'text-red-400'
                        : 'text-white'
                    }`}
                  >
                    {indicators.rsi}
                  </span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-mono">EMA (9 / 21)</span>
                  <span className="text-xs font-bold text-white font-mono">
                    {indicators.ema9} / {indicators.ema21}
                  </span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-mono">TENDENCIA</span>
                  <span
                    className={`text-xs font-bold font-mono ${
                      indicators.trend === 'BULLISH'
                        ? 'text-emerald-400'
                        : indicators.trend === 'BEARISH'
                        ? 'text-red-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {indicators.trend}
                  </span>
                </div>
              </div>

              {/* Ticks List */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="text-[10px] font-mono text-slate-400 block mb-1">
                  ÚLTIMOS 20 TICKS OBTENIDOS DE DERIV WEBSOCKET:
                </span>
                <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                  {ticks.slice(-20).map((t, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-950/50 border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
              Haz clic en "Obtener Ticks" para consultar precios e indicadores en tiempo real desde los servidores de Deriv.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
