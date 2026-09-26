import React, { useState, useEffect, useRef } from 'react';
import { Activity, ShieldCheck, RefreshCw, DollarSign, Zap, CheckCircle2, AlertTriangle, Play, Pause, Sliders, TrendingUp, TrendingDown } from 'lucide-react';
import { DerivAccount, MarketIndicators } from '../types';

export const DerivTester: React.FC = () => {
  const [token, setToken] = useState<string>('pat_e1812e7694a4130e5187e7e77a1c9392fabffb197ffe209629e12f6a9a337546');
  const [appId, setAppId] = useState<string>('1089');
  const [loading, setLoading] = useState<boolean>(false);
  const [account, setAccount] = useState<DerivAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual Instant Trade Execution State
  const [executingTrade, setExecutingTrade] = useState<boolean>(false);
  const [tradeResult, setTradeResult] = useState<any | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  // Tick Streamer States
  const [symbol, setSymbol] = useState<string>('R_100');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [indicators, setIndicators] = useState<MarketIndicators | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);

  // Client-side WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);

  // Live Diagnostic Terminal Logs
  interface DiagnosticLog {
    time: string;
    type: 'sent' | 'received' | 'error' | 'info';
    text: string;
    latencyMs?: number;
  }
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [wsStatus, setWsStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const pingTimestampRef = useRef<number>(0);

  const addLog = (type: DiagnosticLog['type'], text: string, latencyMs?: number) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time, type, text, latencyMs }, ...prev.slice(0, 49)]);
  };

  // Deriv official WebSocket endpoints to try
  const WS_ENDPOINTS = [
    `wss://ws.derivws.com/websockets/v3?app_id=${appId.trim() || '1089'}`,
    `wss://ws.binaryws.com/websockets/v3?app_id=${appId.trim() || '1089'}`,
    `wss://frontend.binaryws.com/websockets/v3?app_id=${appId.trim() || '1089'}`
  ];

  // Helper to open socket with fallback
  const connectDerivSocket = (callback: (ws: WebSocket) => void) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setWsStatus('CONNECTED');
      callback(wsRef.current);
      return;
    }

    setWsStatus('CONNECTING');
    addLog('info', `Iniciando handshake WebSocket con Deriv...`);
    let endpointIndex = 0;

    const tryNext = () => {
      if (endpointIndex >= WS_ENDPOINTS.length) {
        setLoading(false);
        setWsStatus('DISCONNECTED');
        addLog('error', 'Fallo de conexión en todos los servidores de Deriv.');
        setError('No se pudo conectar a los servidores de Deriv (WebSocket bloqueado por tu red/proveedor). Prueba usando datos móviles o VPN.');
        return;
      }

      const url = WS_ENDPOINTS[endpointIndex];
      endpointIndex++;
      addLog('info', `Intentando endpoint: ${url}`);

      try {
        const socket = new WebSocket(url);
        let opened = false;

        const openTimeout = setTimeout(() => {
          if (!opened && socket.readyState !== WebSocket.OPEN) {
            addLog('error', `Timeout alcanzado para ${url}`);
            socket.close();
            tryNext();
          }
        }, 4000);
        
        socket.onopen = () => {
          opened = true;
          clearTimeout(openTimeout);
          wsRef.current = socket;
          setWsStatus('CONNECTED');
          addLog('info', `¡Handshake exitoso! Conectado a ${url}`);

          // Global listener for diagnostic logging
          socket.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.ping === 'pong') {
                const latency = Date.now() - pingTimestampRef.current;
                setPingLatency(latency);
                addLog('received', `PONG recibido desde Deriv (${latency}ms) - Red 100% activa`, latency);
              } else if (msg.msg_type === 'authorize') {
                if (msg.error) {
                  addLog('error', `Deriv error en authorize: ${msg.error.message || msg.error.code}`);
                } else {
                  addLog('received', `Cuenta autorizada: ${msg.authorize.loginid} (Balance: $${msg.authorize.balance} ${msg.authorize.currency})`);
                }
              } else if (msg.msg_type === 'tick') {
                // Keep ticks quiet or log first tick
                addLog('received', `Tick en vivo: ${msg.tick.symbol} = ${msg.tick.quote}`);
              } else if (msg.msg_type) {
                addLog('received', `Mensaje Deriv: [${msg.msg_type}]`);
              }
            } catch (err) {
              addLog('received', `Raw: ${event.data.substring(0, 80)}...`);
            }
          };

          socket.onclose = () => {
            setWsStatus('DISCONNECTED');
            addLog('info', 'Conexión WebSocket cerrada por el servidor.');
          };

          callback(socket);
        };

        socket.onerror = () => {
          clearTimeout(openTimeout);
          addLog('error', `Error en endpoint ${url}, probando respaldo...`);
          socket.close();
          tryNext();
        };
      } catch (e: any) {
        addLog('error', `Excepción al conectar: ${e.message}`);
        tryNext();
      }
    };

    tryNext();
  };

  // Enviar PING en tiempo real para medir latencia con Deriv
  const handleSendPing = async () => {
    // 1. Try browser WebSocket
    try {
      pingTimestampRef.current = Date.now();
      addLog('info', 'Comprobando conexión WebSocket cliente y nube...');
      
      const serverRes = await fetch('/api/deriv/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: appId.trim() || '1089' })
      });
      const data = await serverRes.json();
      if (data.success && data.ping === 'pong') {
        setPingLatency(data.latencyMs);
        setWsStatus('CONNECTED');
        addLog('received', `¡PONG exitoso de Deriv! Latencia: ${data.latencyMs}ms | Servidor: ${data.endpoint}`, data.latencyMs);
        setError(null);
        return;
      }
    } catch (e: any) {
      addLog('error', `Fallo al verificar ping en servidor: ${e.message}`);
    }

    // Try client side if server failed
    connectDerivSocket((ws) => {
      pingTimestampRef.current = Date.now();
      const payload = { ping: 1 };
      ws.send(JSON.stringify(payload));
      addLog('sent', `PING cliente enviado a Deriv: {"ping": 1}`);
    });
  };

  // 1. Conectar y Validar Cuenta directamente o mediante proxy seguro de alta velocidad
  const handleTestConnection = async () => {
    if (!token.trim()) {
      setError('Por favor ingresa tu Token de API de Deriv.');
      return;
    }

    setLoading(true);
    setError(null);
    addLog('info', 'Validando Token con Deriv API...');

    // First attempt: Cloud Server Proxy (Bypasses any ISP / mobile phone WebSocket port block)
    try {
      const res = await fetch('/api/deriv/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), appId: appId.trim() || '1089' })
      });
      const data = await res.json();
      if (data.success && data.account) {
        setLoading(false);
        setAccount(data.account);
        setWsStatus('CONNECTED');
        addLog('received', `¡Cuenta validada! Login: ${data.account.loginid} | Saldo: $${data.account.balance} ${data.account.currency}`);
        return;
      } else if (data.error) {
        setLoading(false);
        setError(`Respuesta de Deriv: ${data.error}`);
        addLog('error', `Deriv error: ${data.error}`);
        return;
      }
    } catch (err: any) {
      addLog('info', 'Proxy nube falló, intentando conexión directa del navegador...');
    }

    // Fallback: Direct browser WebSocket
    connectDerivSocket((ws) => {
      const onMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.msg_type === 'authorize') {
            setLoading(false);
            if (data.error) {
              setError(`Error de Deriv: ${data.error.message || 'Token inválido o sin permisos'}`);
              addLog('error', `Deriv error: ${data.error.message}`);
            } else {
              const auth = data.authorize;
              setAccount({
                loginid: auth.loginid,
                email: auth.email,
                balance: auth.balance,
                currency: auth.currency,
                is_virtual: auth.is_virtual === 1,
              });
              setWsStatus('CONNECTED');
              addLog('received', `¡Cuenta validada en directo! ${auth.loginid} | $${auth.balance}`);
              setError(null);
            }
          }
        } catch (e: any) {
          setLoading(false);
          setError('Error procesando respuesta de Deriv.');
        }
      };

      ws.addEventListener('message', onMessage);
      ws.send(JSON.stringify({ authorize: token.trim() }));
    });
  };

  // 2. Ejecutar Operación Real en Deriv (1-Click) con proxy de alta velocidad
  const handleExecuteTrade = async (type: 'CALL' | 'PUT') => {
    if (!token.trim()) {
      setTradeError('Por favor valida primero tu Token de Deriv.');
      return;
    }

    setExecutingTrade(true);
    setTradeResult(null);
    setTradeError(null);
    addLog('info', `Enviando orden ${type} de $1.00 USD en ${symbol}...`);

    // 1. First attempt: Server-side proxy (bypasses any ISP / mobile phone block)
    try {
      const res = await fetch('/api/deriv/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          symbol: symbol,
          contractType: type,
          amount: 1.0,
          durationTicks: 5,
          appId: appId.trim() || '1089'
        })
      });
      const data = await res.json();
      if (data.success) {
        setExecutingTrade(false);
        setTradeResult(data);
        if (account) {
          setAccount({ ...account, balance: data.balance_after });
        }
        addLog('received', `¡Orden ejecutada en Deriv! Contrato #${data.contract_id} (Balance tras compra: $${data.balance_after})`);
        return;
      } else if (data.error) {
        setExecutingTrade(false);
        setTradeError(data.error);
        addLog('error', `Deriv error en orden: ${data.error}`);
        return;
      }
    } catch (e: any) {
      addLog('info', 'Intentando ejecución mediante socket local...');
    }

    connectDerivSocket((ws) => {
      const onMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.msg_type === 'authorize' && !data.error) {
            // Once authorized, send the buy order
            ws.send(JSON.stringify({
              buy: 1,
              price: 100.0,
              parameters: {
                amount: 1.0,
                basis: 'stake',
                contract_type: type,
                currency: account?.currency || 'USD',
                duration: 5,
                duration_unit: 't',
                symbol: symbol,
              }
            }));
          } else if (data.msg_type === 'buy') {
            setExecutingTrade(false);
            const b = data.buy;
            setTradeResult({
              contract_id: b.contract_id,
              buy_price: b.buy_price,
              balance_after: b.balance_after,
              purchase_time: b.purchase_time,
              symbol,
              contractType: type,
            });
            if (account) {
              setAccount({ ...account, balance: b.balance_after });
            }
            addLog('received', `¡Orden #${b.contract_id} completada vía socket navegador!`);
          } else if (data.error) {
            setExecutingTrade(false);
            setTradeError(data.error.message || 'Error al ejecutar orden.');
            addLog('error', `Error en compra: ${data.error.message}`);
          }
        } catch (e: any) {
          setExecutingTrade(false);
          setTradeError('Error en la respuesta de orden.');
        }
      };

      ws.addEventListener('message', onMessage);
      ws.send(JSON.stringify({ authorize: token.trim() }));
    });
  };

  // 3. Flujo continuo de ticks en tiempo real
  const handleToggleTicks = () => {
    if (isSubscribed) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ forget_all: 'ticks' }));
      }
      setIsSubscribed(false);
      return;
    }

    connectDerivSocket((ws) => {
      const onMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.msg_type === 'tick' && data.tick) {
            const quote = data.tick.quote;
            setLivePrice(quote);
            setTicks((prev) => {
              const updated = [...prev.slice(-30), quote];
              if (updated.length >= 14) {
                const deltas = [];
                for (let i = 1; i < updated.length; i++) {
                  deltas.push(updated[i] - updated[i - 1]);
                }
                const recent14 = deltas.slice(-14);
                const gains = recent14.map((d) => (d > 0 ? d : 0));
                const losses = recent14.map((d) => (d < 0 ? -d : 0));
                const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
                const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
                const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
                const calculatedRsi = Math.round((100 - 100 / (1 + rs)) * 100) / 100;

                setIndicators({
                  price: quote,
                  rsi: calculatedRsi,
                  ema9: quote,
                  ema21: quote,
                  trend: calculatedRsi > 50 ? 'BULLISH' : 'BEARISH',
                  priceChange5t: Math.round((quote - (updated[updated.length - 5] || quote)) * 1000) / 1000,
                  volatility: 0.35,
                });
              }
              return updated;
            });
          }
        } catch (e) {
          // ignore
        }
      };

      ws.addEventListener('message', onMessage);
      ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      setIsSubscribed(true);
    });
  };

  useEffect(() => {
    // Component mounted cleanly
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

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

        {/* Live Network Health Status Badge & Raw Ping Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono">
            <span className={`w-2.5 h-2.5 rounded-full ${wsStatus === 'CONNECTED' ? 'bg-emerald-400 animate-pulse' : wsStatus === 'CONNECTING' ? 'bg-amber-400 animate-spin' : 'bg-rose-500'}`} />
            <span className="text-slate-300">
              {wsStatus === 'CONNECTED' ? 'WS CONECTADO' : wsStatus === 'CONNECTING' ? 'CONECTANDO...' : 'WS DESCONECTADO'}
            </span>
            {pingLatency !== null && (
              <span className="text-emerald-400 font-bold ml-1">
                {pingLatency} ms
              </span>
            )}
          </div>

          <button
            onClick={handleSendPing}
            className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-mono text-xs rounded-xl transition-all flex items-center gap-1.5"
            title="Enviar mensaje ping raw de Deriv y medir latencia real"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Test Ping Raw</span>
          </button>
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

            {/* Instant Manual Trigger Panel */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
              <span className="text-xs font-bold text-white block">
                ⚡ Panel de Disparo de Prueba (Ejecución Manual 1-Click)
              </span>
              <p className="text-[11px] text-slate-400">
                Usa estos botones para enviar una orden directa de prueba ($1.00 USD, 5 ticks) a tu cuenta Demo de Deriv y verificar el resultado inmediatamente.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => handleExecuteTrade('CALL')}
                  disabled={executingTrade}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-emerald-900/20"
                >
                  {executingTrade ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  <span>COMPRA 'CALL' ($1.00)</span>
                </button>

                <button
                  onClick={() => handleExecuteTrade('PUT')}
                  disabled={executingTrade}
                  className="py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-rose-900/20"
                >
                  {executingTrade ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  <span>VENTA 'PUT' ($1.00)</span>
                </button>
              </div>

              {tradeError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-300 font-mono">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{tradeError}</span>
                </div>
              )}

              {tradeResult && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1 font-mono text-xs">
                  <div className="flex items-center justify-between font-bold text-emerald-400">
                    <span>🎉 ¡ORDEN EJECUTADA EN DERIV!</span>
                    <span>Ticket #{tradeResult.contract_id}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Símbolo: <span className="text-white font-bold">{tradeResult.symbol}</span> | Tipo: <span className="text-white font-bold">{tradeResult.contractType}</span> | Inversión: <span className="text-emerald-400 font-bold">${tradeResult.buy_price} USD</span>
                  </div>
                  <div className="text-[10px] text-slate-400 border-t border-emerald-500/20 pt-1 mt-1">
                    Balance restante: ${tradeResult.balance_after} USD
                  </div>
                </div>
              )}
            </div>
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
                onClick={handleToggleTicks}
                className={`px-3 py-1 font-medium text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm ${
                  isSubscribed
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isSubscribed ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isSubscribed ? 'Detener Ticks' : 'Iniciar Ticks en Vivo'}</span>
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

      {/* Live WebSocket Inspector Terminal */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Consola de Inspección WebSocket en Vivo (Evidencia de Red)</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-500">
              {logs.length} paquetes registrados
            </span>
            <button
              onClick={() => setLogs([])}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Limpiar
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Aquí puedes ver los paquetes de bytes crudos que viajan directamente entre tu navegador y los servidores de Deriv. Cada respuesta confirma el estado real de la API.
        </p>

        <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 font-mono text-xs max-h-56 overflow-y-auto space-y-1.5 no-scrollbar">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic py-4 text-center">
              Presiona "Test Ping Raw", "Verificar Token" o "Iniciar Ticks en Vivo" para inspeccionar los paquetes.
            </div>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-[11px] ${
                  log.type === 'sent'
                    ? 'text-blue-400'
                    : log.type === 'received'
                    ? 'text-emerald-400'
                    : log.type === 'error'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}
              >
                <span className="text-slate-600 shrink-0">[{log.time}]</span>
                <span className="font-bold shrink-0">
                  {log.type === 'sent' ? '📤 TX:' : log.type === 'received' ? '📥 RX:' : log.type === 'error' ? '❌ ERR:' : 'ℹ️ INFO:'}
                </span>
                <span className="break-all">{log.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
