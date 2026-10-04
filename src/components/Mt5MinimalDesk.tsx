import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  RefreshCw,
  Sliders,
  DollarSign,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Globe2,
  Radio,
  Eye,
  Filter
} from 'lucide-react';

interface CommandLog {
  id: string;
  time: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'CLOSE_ALL';
  volume: number;
  status: string;
  reason?: string;
  ticket?: number;
}

interface MarketAssetAnalysis {
  price: number;
  prevPrice: number;
  ticks: number[];
  rsi: number;
  ema9: number;
  ema21: number;
  trend: 'ALCISTA' | 'BAJISTA' | 'LATERAL';
  signal: 'BUY' | 'SELL' | 'ESPERAR';
  confidence: number;
  lastUpdate: number;
}

export const Mt5MinimalDesk: React.FC = () => {
  // Configuración de activos
  const [selectedAsset, setSelectedAsset] = useState<string>('Volatility 100 Index');
  const [lotSize, setLotSize] = useState<number>(0.20);
  const [slPoints, setSlPoints] = useState<number>(30);
  const [tpPoints, setTpPoints] = useState<number>(60);
  
  // Estado del Scalper Automático Inteligente
  const [isAutoScalper, setIsAutoScalper] = useState<boolean>(false);
  const [targetAssets, setTargetAssets] = useState<string[]>([
    'Volatility 100 Index', 
    'Volatility 10 Index', 
    'Volatility 75 Index', 
    'Volatility 50 Index', 
    'Volatility 25 Index'
  ]);

  // Registro de última orden disparada por símbolo para evitar sobre-operar
  const lastTradedTimeRef = useRef<Record<string, number>>({});
  
  // Cotizaciones y Análisis Real en la Nube (Deriv WebSocket Directo 24/7)
  const [cloudMarkets, setCloudMarkets] = useState<Record<string, MarketAssetAnalysis>>({});
  const [cloudSource, setCloudSource] = useState<string>('Conectando a Deriv Cloud...');

  // Estado y diagnósticos del puente MT5
  const [bridgeStatus, setBridgeStatus] = useState<{
    isOnline: boolean;
    health: 'HEALTHY' | 'WARNING' | 'DISCONNECTED';
    message: string;
    solution: string | null;
    lastSeenSecondsAgo: number | null;
    lastError: string | null;
  }>({
    isOnline: true,
    health: 'HEALTHY',
    message: 'Puente MT5 enlazado y activo.',
    solution: null,
    lastSeenSecondsAgo: 0,
    lastError: null
  });

  const [balance, setBalance] = useState<number>(8900.00);
  const [equity, setEquity] = useState<number>(8900.00);
  const [lastLog, setLastLog] = useState<string>('Puente MT5 enlazado y listo.');
  const [commandHistory, setCommandHistory] = useState<CommandLog[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [showTroubleshooter, setShowTroubleshooter] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // 1. Consulta en vivo del análisis de mercado directo de la nube (Deriv WebSocket)
  const fetchMarketAnalysis = async () => {
    try {
      const res = await fetch('/api/market/analysis');
      const data = await res.json();
      if (data.success && data.markets) {
        setCloudMarkets(data.markets);
        setCloudSource(data.source);
      }
    } catch (e) {
      // Ignorar fallos de red esporádicos
    }
  };

  // 2. Consulta en vivo del estado del puente MT5 cada 2 segundos
  const fetchBridgeStatus = async () => {
    try {
      const res = await fetch('/api/mt5/status');
      const data = await res.json();
      if (data.success) {
        setBridgeStatus({
          isOnline: data.isOnline,
          health: data.health || (data.isOnline ? 'HEALTHY' : 'DISCONNECTED'),
          message: data.message,
          solution: data.solution,
          lastSeenSecondsAgo: data.lastSeenSecondsAgo,
          lastError: data.lastError
        });
        if (data.account?.balance) setBalance(data.account.balance);
        if (data.account?.equity) setEquity(data.account.equity);
      }
    } catch (e) {
      setBridgeStatus(prev => ({
        ...prev,
        health: 'DISCONNECTED',
        message: 'No se puede contactar al servidor en la nube.',
        solution: 'Comprueba tu conexión a internet.'
      }));
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchMarketAnalysis(), fetchBridgeStatus()]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  useEffect(() => {
    fetchMarketAnalysis();
    fetchBridgeStatus();
    const marketTimer = setInterval(fetchMarketAnalysis, 1000);
    const bridgeTimer = setInterval(fetchBridgeStatus, 2000);
    return () => {
      clearInterval(marketTimer);
      clearInterval(bridgeTimer);
    };
  }, []);

  // Función para despachar orden directa a MetaTrader 5
  const sendMt5Order = async (action: 'BUY' | 'SELL' | 'CLOSE_ALL', symbolOverride?: string, reason?: string) => {
    const symbol = symbolOverride || selectedAsset;
    setIsSending(true);
    const newId = 'cmd_' + Date.now();
    const timeStr = new Date().toLocaleTimeString();

    try {
      const res = await fetch('/api/mt5/queue-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'winlator-mali-1',
          action,
          symbol,
          volume: lotSize,
          sl: slPoints,
          tp: tpPoints
        })
      });
      const data = await res.json();

      if (data.success) {
        setLastLog(`⚡ Disparada a MT5: ${action} en ${symbol} (${reason || 'Manual'})`);
        setCommandHistory(prev => [
          {
            id: newId,
            time: timeStr,
            symbol,
            action,
            volume: lotSize,
            status: 'ENVIADA A MT5',
            reason: reason || 'Disparo Manual'
          },
          ...prev.slice(0, 19)
        ]);
      } else {
        setLastLog(`Error al enviar: ${data.error}`);
      }
    } catch (err: any) {
      setLastLog(`Fallo de conexión al enviar orden.`);
    } finally {
      setIsSending(false);
    }
  };

  // 3. MOTOR INTELIGENTE: ESCANEA 1 A 5 MERCADOS Y SOLO DISPARA SI EL MERCADO CONCRETO TIENE SETUP VÁLIDO
  useEffect(() => {
    if (!isAutoScalper) return;

    setLastLog('🔍 Escáner Activo: Evaluando los 5 mercados independientemente...');

    const interval = setInterval(() => {
      const now = Date.now();
      let triggeredAny = false;

      // Evaluar mercado por mercado individualmente
      for (const symbol of targetAssets) {
        const analysis = cloudMarkets[symbol];
        if (!analysis) continue;

        // Regla de enfriamiento: no disparar el mismo mercado con menos de 45 segundos de diferencia
        const lastTraded = lastTradedTimeRef.current[symbol] || 0;
        if (now - lastTraded < 45000) continue;

        // DISPARO CONDICIONAL ESTRICTO: Solo si cumple con el setup técnico coherente
        if (analysis.signal === 'BUY') {
          lastTradedTimeRef.current[symbol] = now;
          triggeredAny = true;
          sendMt5Order('BUY', symbol, `Tendencia Alcista (EMA9>21, RSI=${analysis.rsi.toFixed(1)})`);
          break; // Dispara una orden coherente por ciclo para no saturar MT5
        } else if (analysis.signal === 'SELL') {
          lastTradedTimeRef.current[symbol] = now;
          triggeredAny = true;
          sendMt5Order('SELL', symbol, `Tendencia Bajista (EMA9<21, RSI=${analysis.rsi.toFixed(1)})`);
          break;
        }
      }

      if (!triggeredAny) {
        setLastLog('💤 Ningún mercado cumple setup de alta probabilidad en este tick. Esperando confirmación...');
      }
    }, 5000); // Evalúa cada 5 segundos todos los mercados

    return () => clearInterval(interval);
  }, [isAutoScalper, targetAssets, cloudMarkets, lotSize]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* SECCIÓN 1: SALUD DEL PUENTE MT5 Y TELEMETRÍA */}
      <div className={`rounded-2xl border p-5 transition-all shadow-xl ${
        bridgeStatus.health === 'HEALTHY'
          ? 'bg-slate-900 border-slate-800'
          : bridgeStatus.health === 'WARNING'
          ? 'bg-amber-950/30 border-amber-500/50'
          : 'bg-red-950/30 border-red-500/50'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
              bridgeStatus.health === 'HEALTHY'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : bridgeStatus.health === 'WARNING'
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {bridgeStatus.health === 'HEALTHY' && <ShieldCheck className="w-6 h-6 text-emerald-400" />}
              {bridgeStatus.health === 'WARNING' && <AlertTriangle className="w-6 h-6 text-amber-400" />}
              {bridgeStatus.health === 'DISCONNECTED' && <AlertCircle className="w-6 h-6 text-red-400" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">Puente MetaTrader 5 (Winlator)</h1>
                <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  bridgeStatus.health === 'HEALTHY'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : bridgeStatus.health === 'WARNING'
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    bridgeStatus.health === 'HEALTHY' ? 'bg-emerald-400 animate-pulse' : bridgeStatus.health === 'WARNING' ? 'bg-amber-400 animate-ping' : 'bg-red-400'
                  }`} />
                  {bridgeStatus.health === 'HEALTHY' ? '🟢 ENLACE ÓPTIMO' : bridgeStatus.health === 'WARNING' ? '🟡 SEÑAL DÉBIL' : '🔴 DESCONECTADO'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 font-mono">
                {bridgeStatus.message}
              </p>
            </div>
          </div>

          {/* Saldo y Equidad en vivo desde el MT5 con botón de actualizar */}
          <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-xl font-mono self-stretch sm:self-auto justify-between sm:justify-start">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-sans">Saldo MT5</span>
              <span className="text-base font-bold text-emerald-400">${balance.toFixed(2)}</span>
            </div>
            <div className="h-7 w-[1px] bg-slate-800 mx-1" />
            <div>
              <span className="text-[10px] text-slate-500 uppercase block font-sans">Equidad</span>
              <span className="text-base font-bold text-slate-200">${equity.toFixed(2)}</span>
            </div>
            <div className="h-7 w-[1px] bg-slate-800 mx-1" />
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title="Actualizar estado de conexión y balance ahora"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 text-xs font-semibold font-sans transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        </div>

        {/* ALERTA Y SOLUCIÓN INMEDIATA SI HAY PROBLEMA O ADVERTENCIA */}
        {bridgeStatus.solution && (
          <div className="mt-4 p-3.5 rounded-xl bg-slate-950/90 border border-amber-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-amber-300 block">¿Cómo solucionarlo en 5 segundos?</span>
              <p className="text-slate-300 leading-relaxed">
                {bridgeStatus.solution}
              </p>
            </div>
          </div>
        )}

        {/* ASISTENTE DESPLEGABLE DE AUTO-DIAGNÓSTICO */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <button
            onClick={() => setShowTroubleshooter(!showTroubleshooter)}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors font-medium"
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
            <span>Guía de Diagnóstico de Errores Comunes de MT5</span>
            {showTroubleshooter ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          
          <button
            onClick={() => { fetchBridgeStatus(); fetchMarketAnalysis(); }}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-mono"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Verificar Ahora</span>
          </button>
        </div>

        {showTroubleshooter && (
          <div className="mt-3 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="font-bold text-indigo-400 block mb-1">1. Error 4014 (WebRequest)</span>
                <p className="text-slate-400 text-[11px]">
                  En MT5 ve a: <strong>Herramientas &gt; Opciones &gt; Asesores Expertos</strong> y marca "Permitir WebRequest para URL listadas".
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="font-bold text-indigo-400 block mb-1">2. Sombrero Gris / Pausado</span>
                <p className="text-slate-400 text-[11px]">
                  Si el sombrerito arriba a la derecha está gris, presiona el botón <strong>AlgoTrading</strong> en la barra superior de MT5 para ponerlo verde.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="font-bold text-indigo-400 block mb-1">3. App en Segundo Plano</span>
                <p className="text-slate-400 text-[11px]">
                  Si minimizas Winlator por mucho tiempo, Android puede congelarlo. Dale permisos de <em>"Batería Sin Restricciones"</em> a Winlator en tu teléfono.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: ESCÁNER Y DIAGNÓSTICO INDEPENDIENTE DE 1 A 5 MERCADOS */}
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Escáner Multi-Mercado Inteligente</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 font-mono">
                  EVALUACIÓN INDEPENDIENTE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Cada mercado se analiza por separado. Solo se dispara orden si el mercado concreto presenta una oportunidad lógica.
              </p>
            </div>
          </div>

          <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5 self-start sm:self-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Precios en Directo
          </span>
        </div>

        {/* Tarjetas de los 5 Mercados con Ticks y Decisión Coherente Individual */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {targetAssets.map((sym) => {
            const data = cloudMarkets[sym];
            const isUp = data ? data.price >= data.prevPrice : true;

            return (
              <div key={sym} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">{sym}</span>
                    <span className="text-[10px] text-slate-400 font-mono">Deriv CFD MT5</span>
                  </div>

                  {data && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      data.signal === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : data.signal === 'SELL'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {data.signal === 'BUY' ? 'COMPRA VÁLIDA' : data.signal === 'SELL' ? 'VENTA VÁLIDA' : 'SIN CONDICIÓN'}
                    </span>
                  )}
                </div>

                {/* Precio en tiempo real parpadeando */}
                <div className="flex items-baseline justify-between pt-0.5">
                  <div>
                    <span className={`text-lg font-mono font-black transition-colors ${
                      isUp ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {data ? data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Cargando...'}
                    </span>
                  </div>

                  {data && (
                    <div className="text-right font-mono text-[11px] space-y-0.5">
                      <div className="text-slate-400">
                        RSI: <strong className={data.rsi > 70 ? 'text-red-400' : data.rsi < 30 ? 'text-emerald-400' : 'text-indigo-300'}>{data.rsi.toFixed(1)}</strong>
                      </div>
                      <div className="text-slate-500 text-[10px]">
                        Tendencia: <strong className="text-slate-300">{data.trend}</strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Botón rápido para disparar si el usuario lo desea manualmente */}
                <button
                  disabled={isSending}
                  onClick={() => sendMt5Order(data?.signal === 'SELL' ? 'SELL' : 'BUY', sym, 'Disparo Directo desde Tarjeta')}
                  className="w-full py-1.5 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 font-bold text-[11px] transition-all active:scale-98 flex items-center justify-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>Operar {sym.split(' ')[0]} {sym.split(' ')[1]}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECCIÓN 3: PILOTO AUTOMÁTICO INTELIGENTE POR CONDICIÓN */}
      <div className={`rounded-2xl border p-6 transition-all ${
        isAutoScalper 
          ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border-emerald-500/50 shadow-lg shadow-emerald-950/50' 
          : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className={`w-5 h-5 ${isAutoScalper ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
              <h2 className="text-base font-bold text-white">Piloto Automático Coherente</h2>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                isAutoScalper ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {isAutoScalper ? 'MONITOREANDO 5 MERCADOS' : 'DETENIDO'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Analiza constantemente los 5 mercados. Si 1 de ellos (o varios) tienen setup claro, ejecuta la orden correspondiente. Si ninguno cumple, <strong>no opera por operar</strong>.
            </p>
          </div>

          <div>
            {isAutoScalper ? (
              <button
                onClick={() => {
                  setIsAutoScalper(false);
                  setLastLog('Scalper pausado.');
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-900/40 transition-all active:scale-95"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>DETENER ESCÁNER</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAutoScalper(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>ACTIVAR ESCÁNER INTELIGENTE EN 5 MERCADOS</span>
              </button>
            )}
          </div>
        </div>

        {/* Criterios de entrada activos */}
        <div className="pt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            Criterios de Coherencia:
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-950 text-slate-300 text-xs font-mono">
            RSI 32-50 + EMA Bajista = <strong>SELL</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-950 text-slate-300 text-xs font-mono">
            RSI 50-68 + EMA Alcista = <strong>BUY</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-950 text-slate-400 text-xs font-mono">
            Rango Lateral o Sobrecompra = <strong>ESPERAR</strong>
          </span>
        </div>
      </div>

      {/* SECCIÓN 4: DISPARADORES MANUALES RÁPIDOS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">Disparador Manual a MT5</h2>
          </div>
          <span className="text-xs text-slate-400">Control Inmediato</span>
        </div>

        {/* Selección de activo y volumen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Activo a Operar</label>
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:border-emerald-500 focus:outline-none"
            >
              <option value="Volatility 100 Index">Volatility 100 Index</option>
              <option value="Volatility 10 Index">Volatility 10 Index</option>
              <option value="Volatility 75 Index">Volatility 75 Index</option>
              <option value="Volatility 50 Index">Volatility 50 Index</option>
              <option value="Volatility 25 Index">Volatility 25 Index</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Volumen de Lote</label>
            <input
              type="number"
              step="0.05"
              min="0.05"
              max="5.0"
              value={lotSize}
              onChange={(e) => setLotSize(parseFloat(e.target.value) || 0.10)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Botones BUY / SELL Gigantes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <button
            disabled={isSending}
            onClick={() => sendMt5Order('BUY')}
            className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-emerald-950/70 to-slate-950 border border-emerald-500/40 hover:border-emerald-400 text-left transition-all active:scale-98 group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-white block">COMPRAR (BUY)</span>
                <span className="text-xs text-slate-400 font-mono">{selectedAsset} · {lotSize} Lot</span>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs">
              BUY AHORA
            </span>
          </button>

          <button
            disabled={isSending}
            onClick={() => sendMt5Order('SELL')}
            className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-red-950/70 to-slate-950 border border-red-500/40 hover:border-red-400 text-left transition-all active:scale-98 group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-white block">VENDER (SELL)</span>
                <span className="text-xs text-slate-400 font-mono">{selectedAsset} · {lotSize} Lot</span>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-bold text-xs">
              SELL AHORA
            </span>
          </button>
        </div>

        {/* Botón de Emergencia: Cerrar Todo */}
        <div className="pt-2 text-center">
          <button
            onClick={() => sendMt5Order('CLOSE_ALL')}
            className="w-full py-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-400 text-xs font-semibold transition-all"
          >
            🛑 CERRAR TODAS LAS POSICIONES ABIERTAS EN MT5
          </button>
        </div>
      </div>

      {/* SECCIÓN 5: REGISTRO DE ÓRDENES ENVIADAS AL PUENTE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white">Registro de Órdenes Despachadas con Justificación</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">{lastLog}</span>
        </div>

        {commandHistory.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">
            Aún no has enviado órdenes en esta sesión. Activa el escáner inteligente o pulsa BUY/SELL.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 text-xs font-mono">
            {commandHistory.map((cmd) => (
              <div key={cmd.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 text-[11px]">{cmd.time}</span>
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                    cmd.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : cmd.action === 'SELL' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-white'
                  }`}>
                    {cmd.action}
                  </span>
                  <span className="text-slate-200 font-semibold">{cmd.symbol}</span>
                  <span className="text-slate-400">{cmd.volume} lot</span>
                  {cmd.reason && (
                    <span className="text-slate-400 text-[10px] hidden md:inline-block font-sans">
                      ({cmd.reason})
                    </span>
                  )}
                </div>
                <span className="text-emerald-400 text-[11px] flex items-center gap-1 self-end sm:self-auto">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {cmd.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
