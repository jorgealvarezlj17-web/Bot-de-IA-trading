import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  DollarSign, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw,
  Sliders,
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';

interface ScalpTrade {
  id: string;
  contractId: number | string;
  type: 'CALL' | 'PUT';
  stake: number;
  entryPrice: number;
  exitPrice?: number;
  payout?: number;
  profit?: number;
  status: 'OPEN' | 'WON' | 'LOST';
  timestamp: string;
  durationTicks: number;
  ticksLeft: number;
}

export const ScalpingEngine: React.FC = () => {
  // Configuración y credenciales persistidas
  const [token, setToken] = useState<string>(() => localStorage.getItem('deriv_api_token') || 'pat_2942a0d125fe788c777be6c39ed580936e87de0700ae87928aeaea0e52c1e824');
  const [appId, setAppId] = useState<string>(() => localStorage.getItem('deriv_app_id') || '34wcFYGbcorxKULpg0XQb');
  const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const [realAccountId, setRealAccountId] = useState<string>('ROT92650273');
  const [demoAccountId, setDemoAccountId] = useState<string>('DOT94563623');
  
  // Parámetros de Scalping
  const [symbol, setSymbol] = useState<string>('R_100');
  const [stake, setStake] = useState<number>(1.0);
  const [durationTicks, setDurationTicks] = useState<number>(5);
  const [strategy, setStrategy] = useState<'AUTO_RSI' | 'MOMENTUM' | 'ALTERNO'>('AUTO_RSI');
  
  // Gestión de Capital
  const [takeProfit, setTakeProfit] = useState<number>(20.0);
  const [stopLoss, setStopLoss] = useState<number>(15.0);
  const [useMartingale, setUseMartingale] = useState<boolean>(false);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState<number>(2.0);

  // Estados del Bot en vivo
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStake, setCurrentStake] = useState<number>(1.0);
  const [balance, setBalance] = useState<number>(9998.00);
  const [currency, setCurrency] = useState<string>('USD');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [rsi, setRsi] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('Listo para iniciar operaciones de scalping');

  // Historial de Operaciones
  const [trades, setTrades] = useState<ScalpTrade[]>([]);
  const [totalProfit, setTotalProfit] = useState<number>(0);
  const [winCount, setWinCount] = useState<number>(0);
  const [lossCount, setLossCount] = useState<number>(0);

  // Pestaña visual: "app_trades" (sesión actual) o "deriv_live" (directo de Deriv oficial)
  const [viewTab, setViewTab] = useState<'current' | 'deriv'>('current');
  const [derivHistory, setDerivHistory] = useState<any[]>([]);
  const [derivOpenPositions, setDerivOpenPositions] = useState<any[]>([]);
  const [loadingDeriv, setLoadingDeriv] = useState<boolean>(false);

  // Referencias para el loop automático sin problemas de closure
  const isRunningRef = useRef<boolean>(false);
  const isProcessingTradeRef = useRef<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const tickBufferRef = useRef<number[]>([]);
  const lastSignalRef = useRef<'CALL' | 'PUT'>('CALL');
  const tradesRef = useRef<ScalpTrade[]>([]);
  const currentStakeRef = useRef<number>(1.0);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  useEffect(() => {
    currentStakeRef.current = currentStake;
  }, [currentStake]);

  // Consultar posiciones reales y contratos de Deriv
  const fetchDerivPositions = async (targetType = accountType) => {
    setLoadingDeriv(true);
    try {
      const res = await fetch('/api/deriv/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, appId, accountType: targetType })
      });
      const data = await res.json();
      if (data.success) {
        setDerivOpenPositions(data.openPositions || []);
        setDerivHistory(data.history || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDeriv(false);
    }
  };

  // Conectar WebSocket de Ticks con fallback a Polling instantáneo
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: any = null;
    let pollInterval: any = null;
    let lastTickTime = Date.now();

    const updatePrice = (price: number) => {
      lastTickTime = Date.now();
      setLivePrice(price);

      tickBufferRef.current = [...tickBufferRef.current.slice(-25), price];
      setPriceHistory([...tickBufferRef.current]);

      // Calcular RSI rápido (7 períodos para scalping)
      if (tickBufferRef.current.length >= 8) {
        const buf = tickBufferRef.current;
        let gains = 0;
        let losses = 0;
        for (let i = buf.length - 7; i < buf.length; i++) {
          const diff = buf[i] - buf[i - 1];
          if (diff >= 0) gains += diff;
          else losses += Math.abs(diff);
        }
        const avgGain = gains / 7;
        const avgLoss = losses / 7;
        if (avgLoss === 0) setRsi(100);
        else {
          const rs = avgGain / avgLoss;
          setRsi(Math.round(100 - (100 / (1 + rs))));
        }
      }

      // Decrementar conteo de ticks en operaciones abiertas
      setTrades(prevTrades => {
        const updated = prevTrades.map(trade => {
          if (trade.status === 'OPEN') {
            const newLeft = trade.ticksLeft - 1;
            if (newLeft <= 0) {
              const won = trade.type === 'CALL' ? price > trade.entryPrice : price < trade.entryPrice;
              const pnl = won ? Number((trade.stake * 0.92).toFixed(2)) : -trade.stake;
              
              if (won) {
                setWinCount(w => w + 1);
                setTotalProfit(tp => Number((tp + pnl).toFixed(2)));
                setBalance(b => Number((b + pnl).toFixed(2)));
                setCurrentStake(stake);
              } else {
                setLossCount(l => l + 1);
                setTotalProfit(tp => Number((tp + pnl).toFixed(2)));
                setBalance(b => Number((b + pnl).toFixed(2)));
                if (useMartingale) {
                  setCurrentStake(s => Number((s * martingaleMultiplier).toFixed(2)));
                }
              }

              return {
                ...trade,
                status: won ? 'WON' : 'LOST',
                exitPrice: price,
                profit: pnl,
                ticksLeft: 0
              };
            }
            return { ...trade, ticksLeft: newLeft };
          }
          return trade;
        });
        return updated;
      });

      // Si el bot automático está corriendo, verificar si disparamos la siguiente operación
      if (isRunningRef.current && !isProcessingTradeRef.current) {
        checkAndExecuteNextTrade(price);
      }
    };

    const fetchSnapshot = async () => {
      try {
        const start = performance.now();
        const res = await fetch('/api/deriv/fetch-ticks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, count: 10, appId: appId || '1089' })
        });
        const data = await res.json();
        if (data.success && data.latestPrice) {
          setLatency(Math.round(performance.now() - start));
          updatePrice(data.latestPrice);
        }
      } catch (err) {}
    };

    fetchSnapshot();

    // Conexión WebSocket
    try {
      ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
      wsRef.current = ws;

      ws.onopen = () => {
        ws?.send(JSON.stringify({ ticks: symbol }));
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            const start = performance.now();
            ws.send(JSON.stringify({ ping: 1 }));
            (ws as any)._pingStart = start;
          }
        }, 10000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.msg_type === 'ping' && (ws as any)?._pingStart) {
            setLatency(Math.round(performance.now() - (ws as any)._pingStart));
          }
          if (data.msg_type === 'tick' && data.tick) {
            updatePrice(Number(data.tick.quote));
          }
        } catch (e) {}
      };
    } catch (e) {}

    // Polling respaldo
    pollInterval = setInterval(() => {
      if (Date.now() - lastTickTime > 1800) {
        fetchSnapshot();
      }
    }, 1200);

    // Actualizar balance inicial desde backend
    fetch('/api/deriv/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, appId })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.accounts) {
          const selected = data.accounts.find((a: any) => a.is_virtual === (accountType === 'demo'));
          if (selected) {
            setBalance(selected.balance);
            setCurrency(selected.currency);
            if (accountType === 'real') setRealAccountId(selected.loginid);
            else setDemoAccountId(selected.loginid);
          } else if (data.account) {
            setBalance(data.account.balance);
            setCurrency(data.account.currency);
          }
        } else if (data.success && data.account) {
          setBalance(data.account.balance);
          setCurrency(data.account.currency);
        }
      })
      .catch(() => {});

    // Cargar historial de Deriv al arrancar
    fetchDerivPositions(accountType);

    return () => {
      clearInterval(pingInterval);
      clearInterval(pollInterval);
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
    };
  }, [symbol, appId, token]);

  // Lógica de Scalping continuo
  const checkAndExecuteNextTrade = async (currentPrice: number) => {
    const hasOpenTrade = tradesRef.current.some(t => t.status === 'OPEN');
    if (hasOpenTrade) return;

    if (totalProfit >= takeProfit) {
      setIsRunning(false);
      setStatusMsg(`🎯 META ALCANZADA: +$${totalProfit.toFixed(2)} USD ganados. Scalper detenido.`);
      return;
    }
    if (totalProfit <= -stopLoss) {
      setIsRunning(false);
      setStatusMsg(`🛑 STOP LOSS ACTIVADO: -$${Math.abs(totalProfit).toFixed(2)} USD. Scalper detenido.`);
      return;
    }

    let direction: 'CALL' | 'PUT' = 'CALL';
    const buf = tickBufferRef.current;

    if (strategy === 'AUTO_RSI') {
      const currentRsi = rsi || 50;
      if (currentRsi <= 45) {
        direction = 'CALL';
      } else if (currentRsi >= 55) {
        direction = 'PUT';
      } else {
        const lastDelta = buf.length >= 2 ? buf[buf.length - 1] - buf[buf.length - 2] : 0;
        direction = lastDelta >= 0 ? 'CALL' : 'PUT';
      }
    } else if (strategy === 'MOMENTUM') {
      if (buf.length >= 3) {
        const trend = buf[buf.length - 1] - buf[buf.length - 3];
        direction = trend >= 0 ? 'CALL' : 'PUT';
      }
    } else if (strategy === 'ALTERNO') {
      direction = lastSignalRef.current === 'CALL' ? 'PUT' : 'CALL';
    }

    lastSignalRef.current = direction;
    await executeScalpTrade(direction, currentPrice);
  };

  // Enviar orden a la API de Deriv
  const executeScalpTrade = async (direction: 'CALL' | 'PUT', entryPrice: number) => {
    if (isProcessingTradeRef.current) return;
    isProcessingTradeRef.current = true;
    setStatusMsg(`🚀 Abriendo ${direction} de $${currentStakeRef.current} USD en ${symbol}...`);

    try {
      const res = await fetch('/api/deriv/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          appId,
          symbol,
          contractType: direction,
          amount: currentStakeRef.current,
          durationTicks,
          accountType,
          accountId: accountType === 'real' ? realAccountId : demoAccountId
        })
      });

      const data = await res.json();
      if (data.success) {
        const newTrade: ScalpTrade = {
          id: Math.random().toString(36).substring(2, 9),
          contractId: data.contract_id,
          type: direction,
          stake: currentStakeRef.current,
          entryPrice: entryPrice,
          status: 'OPEN',
          timestamp: new Date().toLocaleTimeString(),
          durationTicks: durationTicks,
          ticksLeft: durationTicks
        };

        setTrades(prev => [newTrade, ...prev.slice(0, 49)]);
        if (data.balance_after) {
          setBalance(data.balance_after);
        }
        setStatusMsg(`⚡ Orden #${newTrade.contractId} activa en Deriv (${durationTicks} ticks)...`);
        
        // Actualizar posiciones de Deriv tras breve instante
        setTimeout(fetchDerivPositions, 2000);
      } else {
        setStatusMsg(`⚠️ Error al abrir orden: ${data.error || 'Respuesta fallida'}`);
        setTimeout(() => {
          isProcessingTradeRef.current = false;
        }, 2000);
        return;
      }
    } catch (e: any) {
      setStatusMsg(`Error de red con Deriv: ${e.message}`);
    } finally {
      setTimeout(() => {
        isProcessingTradeRef.current = false;
      }, 1000);
    }
  };

  const startBot = () => {
    if (!livePrice) {
      setStatusMsg('Esperando precio en vivo antes de arrancar...');
      return;
    }
    setCurrentStake(stake);
    setIsRunning(true);
    setStatusMsg('🟢 BOT SCALPER ACTIVADO — Ejecutando operaciones continuas en Deriv...');
  };

  const stopBot = () => {
    setIsRunning(false);
    setStatusMsg('⏸️ Bot Scalper pausado por el usuario.');
    fetchDerivPositions();
  };

  const resetStats = () => {
    setTrades([]);
    setTotalProfit(0);
    setWinCount(0);
    setLossCount(0);
    setCurrentStake(stake);
    setStatusMsg('Estadísticas reiniciadas.');
  };

  const totalTrades = winCount + lossCount;
  const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Selector de Modo: Cuenta Demo vs Cuenta Real */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${accountType === 'real' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Modo de Operación</div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>{accountType === 'real' ? '🔴 CUENTA REAL (Dinero Real)' : '🟢 CUENTA DEMO (Práctica)'}</span>
              <span className="font-mono text-xs text-slate-400">({accountType === 'real' ? realAccountId : demoAccountId})</span>
            </div>
          </div>
        </div>

        {/* Botones de Cambio Demo / Real */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              if (isRunning) return;
              setAccountType('demo');
              fetchDerivPositions('demo');
            }}
            disabled={isRunning}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              accountType === 'demo'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            DEMO ($9,997.96)
          </button>
          <button
            onClick={() => {
              if (isRunning) return;
              setAccountType('real');
              fetchDerivPositions('real');
            }}
            disabled={isRunning}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              accountType === 'real'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-amber-400'
            }`}
          >
            REAL ($0.00 USD)
          </button>
        </div>
      </div>

      {/* Barra Superior de Estado y Saldo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Saldo de Cuenta */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="text-xs text-slate-400 font-medium">
            {accountType === 'real' ? 'Saldo Cuenta Real (ROT)' : 'Saldo Cuenta Demo (DOT)'}
          </div>
          <div className={`text-2xl font-bold font-mono mt-1 ${accountType === 'real' ? 'text-amber-400' : 'text-emerald-400'}`}>
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs text-slate-400 ml-1.5">{currency}</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            Deriv ID: {accountType === 'real' ? realAccountId : demoAccountId}
          </div>
        </div>

        {/* Ganancia Acumulada */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="text-xs text-slate-400 font-medium">Beneficio Neto Scalping</div>
          <div className={`text-2xl font-bold font-mono mt-1 ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalProfit >= 0 ? `+$${totalProfit.toFixed(2)}` : `-$${Math.abs(totalProfit).toFixed(2)}`}
            <span className="text-xs text-slate-400 ml-1.5">{currency}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Efectividad: <strong className="text-white">{winRate}%</strong> ({winCount}W / {lossCount}L)
          </div>
        </div>

        {/* Precio en Vivo & RSI */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>{symbol} en Vivo</span>
            <span className="text-emerald-400 font-mono text-[10px]">{latency ? `${latency}ms` : 'en línea'}</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {livePrice ? livePrice.toFixed(2) : 'Conectando...'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
            <span>RSI(7): <strong className={rsi && rsi < 40 ? 'text-emerald-400' : rsi && rsi > 60 ? 'text-rose-400' : 'text-amber-400'}>{rsi ?? '--'}</strong></span>
            <span>·</span>
            <span>{rsi && rsi < 40 ? 'Sobreventa 🟢' : rsi && rsi > 60 ? 'Sobrecompra 🔴' : 'Neutral 🟡'}</span>
          </div>
        </div>

        {/* Botón Principal de Acción Grande */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col justify-center">
          {!isRunning ? (
            <button
              onClick={startBot}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-base shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>ACTIVAR SCALPING AUTOMÁTICO</span>
            </button>
          ) : (
            <button
              onClick={stopBot}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-base shadow-lg shadow-rose-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 animate-pulse"
            >
              <Square className="w-5 h-5 fill-current" />
              <span>DETENER SCALPER</span>
            </button>
          )}
          <div className="text-[10px] text-center text-slate-400 mt-2 truncate">
            {statusMsg}
          </div>
        </div>
      </div>

      {/* Enlaces directos a Deriv para verificar en su plataforma oficial */}
      <div className="bg-slate-900/60 border border-slate-800 px-4 py-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Todas las operaciones se ejecutan directamente en tu cuenta <strong>Deriv Demo (DOT94563623)</strong>.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://app.deriv.com/reports/positions"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-white rounded-lg font-medium transition-colors"
          >
            <span>Ver en Deriv App (Posiciones)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={fetchDerivPositions}
            disabled={loadingDeriv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDeriv ? 'animate-spin' : ''}`} />
            <span>Sincronizar Deriv</span>
          </button>
        </div>
      </div>

      {/* Panel de Controles Rápidos y Disparo Manual */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Parámetros del Scalper */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>Parámetros del Scalper</span>
            </h3>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
              Alta Frecuencia
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Índice Sintético</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="R_100">Volatility 100 (R_100)</option>
                <option value="R_75">Volatility 75 (R_75)</option>
                <option value="R_50">Volatility 50 (R_50)</option>
                <option value="R_25">Volatility 25 (R_25)</option>
                <option value="R_10">Volatility 10 (R_10)</option>
                <option value="1HZ100V">Volatility 100 (1s)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Monto Inicial (USD)</label>
              <input
                type="number"
                min="0.35"
                step="0.5"
                value={stake}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 1;
                  setStake(val);
                  if (!isRunning) setCurrentStake(val);
                }}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Duración (Ticks)</label>
              <select
                value={durationTicks}
                onChange={(e) => setDurationTicks(parseInt(e.target.value, 10))}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              >
                <option value={1}>1 Tick (Ultra Scalp)</option>
                <option value={2}>2 Ticks (Rápido)</option>
                <option value={5}>5 Ticks (Recomendado)</option>
                <option value={10}>10 Ticks</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Algoritmo de Entrada</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as any)}
                disabled={isRunning}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="AUTO_RSI">RSI Reversal (Inteligente)</option>
                <option value="MOMENTUM">Momentum (Seguir Ticks)</option>
                <option value="ALTERNO">Alterno (Call/Put Continuo)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[10px] text-emerald-400 font-bold block mb-1">Take Profit (+USD)</label>
                <input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 10)}
                  disabled={isRunning}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-emerald-400 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-rose-400 font-bold block mb-1">Stop Loss (-USD)</label>
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(parseFloat(e.target.value) || 10)}
                  disabled={isRunning}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-rose-400 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="martingale"
                  checked={useMartingale}
                  onChange={(e) => setUseMartingale(e.target.checked)}
                  disabled={isRunning}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <label htmlFor="martingale" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Martingala al perder (x{martingaleMultiplier})
                </label>
              </div>
              {useMartingale && (
                <span className="text-[10px] text-amber-400 font-mono">Próxima: ${currentStake.toFixed(2)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Disparo Manual Instantáneo */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Disparo Manual Inmediato</span>
              </h3>
              <span className="text-xs font-mono text-slate-400">1-Click</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Haz clic directamente en uno de los dos botones para abrir una orden en Deriv en menos de 300ms:
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => livePrice && executeScalpTrade('CALL', livePrice)}
              disabled={!livePrice}
              className="py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl text-sm shadow-lg shadow-emerald-600/30 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5"
            >
              <TrendingUp className="w-6 h-6" />
              <span>SUBE (CALL)</span>
              <span className="text-[10px] font-mono font-normal opacity-80">${currentStake.toFixed(2)} USD</span>
            </button>

            <button
              onClick={() => livePrice && executeScalpTrade('PUT', livePrice)}
              disabled={!livePrice}
              className="py-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black rounded-xl text-sm shadow-lg shadow-rose-600/30 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5"
            >
              <TrendingDown className="w-6 h-6" />
              <span>BAJA (PUT)</span>
              <span className="text-[10px] font-mono font-normal opacity-80">${currentStake.toFixed(2)} USD</span>
            </button>
          </div>

          {/* Mini gráfico */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Últimos Ticks ({symbol})</div>
            <div className="flex items-end gap-1 h-12">
              {priceHistory.map((p, idx) => {
                const min = Math.min(...priceHistory);
                const max = Math.max(...priceHistory);
                const range = max - min || 1;
                const heightPct = Math.max(15, Math.min(100, ((p - min) / range) * 100));
                const isLast = idx === priceHistory.length - 1;
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-t transition-all ${isLast ? 'bg-emerald-400' : 'bg-slate-700'}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${p}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Resumen de Desempeño */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Rendimiento de la Sesión</span>
              </h3>
              <button
                onClick={resetStats}
                className="text-slate-400 hover:text-white text-xs flex items-center gap-1 transition-colors"
                title="Limpiar historial"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reiniciar</span>
              </button>
            </div>

            <div className="space-y-3 mt-3">
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Total Operaciones:</span>
                <span className="text-white font-mono font-bold">{totalTrades}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Ganadas:</span>
                <span className="text-emerald-400 font-mono font-bold">{winCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Perdidas:</span>
                <span className="text-rose-400 font-mono font-bold">{lossCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Tasa de Efectividad:</span>
                <span className="text-amber-400 font-mono font-bold">{winRate}%</span>
              </div>
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-xs text-slate-300">
            <span className="font-semibold text-emerald-400">💡 Modo Continuo Activado:</span>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              El bot ejecuta las operaciones una tras otra directamente en el libro de órdenes oficial de Deriv con contrato real y retorno del 92%.
            </p>
          </div>
        </div>
      </div>

      {/* Historial en Vivo de Operaciones: Conmutable entre "Sesión Actual" y "Historial Deriv Oficial" */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Monitor de Operaciones</h3>
          </div>

          {/* Segmented Tab */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setViewTab('current')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewTab === 'current'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sesión Actual ({trades.length})
            </button>
            <button
              onClick={() => {
                setViewTab('deriv');
                fetchDerivPositions();
              }}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                viewTab === 'deriv'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Historial Deriv Oficial ({derivHistory.length})</span>
              {derivOpenPositions.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
          </div>
        </div>

        {/* Vista 1: Sesión Actual */}
        {viewTab === 'current' && (
          <>
            {trades.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <Activity className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
                <div className="text-sm">Aún no hay operaciones en esta sesión.</div>
                <div className="text-xs text-slate-500">
                  Toca <strong>"ACTIVAR SCALPING AUTOMÁTICO"</strong> o haz clic en <strong>SUBE/BAJA</strong> para abrir una.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2.5 font-medium">Hora</th>
                      <th className="pb-2.5 font-medium">Contrato Deriv #</th>
                      <th className="pb-2.5 font-medium">Tipo</th>
                      <th className="pb-2.5 font-medium">Inversión</th>
                      <th className="pb-2.5 font-medium">Entrada</th>
                      <th className="pb-2.5 font-medium">Salida / Estado</th>
                      <th className="pb-2.5 font-medium text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {trades.map((trade) => (
                      <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 text-slate-400">{trade.timestamp}</td>
                        <td className="py-3 text-slate-300 font-bold">{trade.contractId}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                            trade.type === 'CALL' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {trade.type === 'CALL' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {trade.type}
                          </span>
                        </td>
                        <td className="py-3 text-white font-bold">${trade.stake.toFixed(2)}</td>
                        <td className="py-3 text-slate-300">{trade.entryPrice.toFixed(2)}</td>
                        <td className="py-3">
                          {trade.status === 'OPEN' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[11px] font-bold animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>EN VIVO ({trade.ticksLeft} ticks)</span>
                            </span>
                          ) : (
                            <span className="text-slate-300">{trade.exitPrice?.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {trade.status === 'OPEN' ? (
                            <span className="text-slate-500 italic">calculando...</span>
                          ) : trade.status === 'WON' ? (
                            <span className="text-emerald-400 font-bold inline-flex items-center gap-1 justify-end">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              +${trade.profit?.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-rose-400 font-bold inline-flex items-center gap-1 justify-end">
                              <XCircle className="w-3.5 h-3.5" />
                              -${Math.abs(trade.profit || 0).toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Vista 2: Historial Oficial de Deriv desde su Servidor */}
        {viewTab === 'deriv' && (
          <div className="space-y-4">
            {derivOpenPositions.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-2">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>CONTRATO ACTIVO EN DERIV AHORA MISMO</span>
                </div>
                {derivOpenPositions.map((pos, idx) => (
                  <div key={`open-${pos.contract_id || pos.id || idx}`} className="text-xs font-mono text-slate-200 flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/20 pt-2">
                    <span>ID: <strong>{pos.contract_id || pos.id}</strong> ({pos.contract_type})</span>
                    <span>Entrada: <strong>{pos.entry_spot}</strong></span>
                    <span>Actual: <strong className="text-emerald-400">{pos.current_spot}</strong></span>
                    <span>Inversión: <strong>${pos.buy_price} USD</strong></span>
                    <span>Pago Potencial: <strong className="text-emerald-400">${pos.payout} USD</strong></span>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2.5 font-medium">Hora de Compra</th>
                    <th className="pb-2.5 font-medium">Contrato #</th>
                    <th className="pb-2.5 font-medium">Inversión</th>
                    <th className="pb-2.5 font-medium">Precio Venta</th>
                    <th className="pb-2.5 font-medium text-right">Ganancia Neta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {derivHistory.map((item, idx) => {
                    const profit = Number((item.sell_price - item.buy_price).toFixed(2));
                    const won = profit > 0;
                    const itemKey = `hist-${item.transaction_id || item.contract_id || idx}`;
                    return (
                      <tr key={itemKey} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 text-slate-400">
                          {new Date(item.purchase_time * 1000).toLocaleTimeString()}
                        </td>
                        <td className="py-3 text-slate-300 font-bold">{item.contract_id}</td>
                        <td className="py-3 text-white font-bold">${item.buy_price} USD</td>
                        <td className="py-3 text-slate-300">${item.sell_price} USD</td>
                        <td className="py-3 text-right">
                          {won ? (
                            <span className="text-emerald-400 font-bold inline-flex items-center gap-1 justify-end">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              +${profit.toFixed(2)} USD
                            </span>
                          ) : (
                            <span className="text-rose-400 font-bold inline-flex items-center gap-1 justify-end">
                              <XCircle className="w-3.5 h-3.5" />
                              -${Math.abs(profit).toFixed(2)} USD
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
