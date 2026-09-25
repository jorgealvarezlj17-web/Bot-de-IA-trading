import React, { useState } from 'react';
import { Bot, Copy, Check, Sliders, Code2, Zap, Play, CheckCircle2, ShieldAlert } from 'lucide-react';
import { StrategyPreset } from '../types';

export const AiStudioBrain: React.FC = () => {
  const [copiedInstruction, setCopiedInstruction] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('volatility_scalper');

  // Parameters
  const [stake, setStake] = useState<number>(1.0);
  const [rsiOversold, setRsiOversold] = useState<number>(28);
  const [rsiOverbought, setRsiOverbought] = useState<number>(72);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(20);
  const [durationTicks, setDurationTicks] = useState<number>(5);

  const presets: Record<string, StrategyPreset> = {
    volatility_scalper: {
      id: 'volatility_scalper',
      name: 'Scalping Volatility 100 (5 Ticks)',
      description: 'Estrategia de alta frecuencia para el índice Volatility 100 basada en cruces de EMA 9/21, RSI dinámico y confirmación de velocidad.',
      symbol: 'R_100',
      stake: stake,
      systemInstruction: `Eres un Trader Scalper experto de Alta Frecuencia operando Índices Sintéticos de Deriv (Volatility 100 Index).
Tu objetivo es identificar momentos de alta probabilidad para contratos rápidos de 5 ticks (Rise/Fall).

REGLAS DE ANÁLISIS TÉCNICO:
1. BUY_CALL (Subida): Se activa cuando RSI < ${rsiOversold} Y EMA 9 cruza por encima de EMA 21 Y el cambio de los últimos 5 ticks es positivo. Confianza mínima: 0.75.
2. BUY_PUT (Bajada): Se activa cuando RSI > ${rsiOverbought} Y EMA 9 cruza por debajo de EMA 21 Y el cambio de los últimos 5 ticks es negativo. Confianza mínima: 0.75.
3. HOLD (Esperar): Si RSI está entre ${rsiOversold} y ${rsiOverbought} o la tendencia es lateral sin dirección clara.
4. PAUSE (Pausar): Si la pérdida diaria acumulada se aproxima a ${maxDailyLoss} USD.

GESTIÓN DE RIESGO:
- Stake sugerido: ${stake} USD por operación.
- Duración recomendada: ${durationTicks} ticks.
- NUNCA fuerces entradas con confianza menor a 0.70.

Responde ÚNICAMENTE invocando la función 'execute_trading_decision'.`,
    },
    rsi_reversal: {
      id: 'rsi_reversal',
      name: 'Reversión Extrema de RSI',
      description: 'Captura giros bruscos en sobrecompra extrema (RSI > 80) o sobreventa extrema (RSI < 20).',
      symbol: 'R_50',
      stake: stake,
      systemInstruction: `Eres un analista algorítmico especializado en Reversión a la Media para Deriv Synthetic Indices.
Buscas agotamiento extremo de precio para operar contratendencia rápida.

CRITERIOS DE ENTRADA:
- BUY_CALL: RSI (14) <= 20 y velas de rechazo bajista.
- BUY_PUT: RSI (14) >= 80 y velas de rechazo alcista.
- HOLD: En cualquier otro rango de RSI.

Manejo de dinero:
- Stake base: ${stake} USD.
- Retorno esperado rápido en 5 ticks.

Responde invocando la función 'execute_trading_decision'.`,
    },
    boom_crash_spikes: {
      id: 'boom_crash_spikes',
      name: 'Especialista Boom & Crash',
      description: 'Estrategia ajustada para detectar preparación de picos en Boom 500 / Crash 500.',
      symbol: 'BOOM500',
      stake: stake,
      systemInstruction: `Eres un bot especialista en Índices Boom y Crash de Deriv.
En BOOM buscas entradas en BUY_CALL antes del Spike cuando la consolidación en soporte se confirma.
En CRASH buscas entradas en BUY_PUT antes de la caída en resistencia.

REGLAS:
- Si el activo es BOOM: Evalúa acumulación en soporte con RSI < 35 para BUY_CALL.
- Si el activo es CRASH: Evalúa distribución en resistencia con RSI > 65 para BUY_PUT.
- Confianza necesaria para entrar: 0.80+.

Responde con la función 'execute_trading_decision'.`,
    },
  };

  const currentPreset = presets[selectedStrategy] || presets.volatility_scalper;

  const functionCallingSchema = {
    name: 'execute_trading_decision',
    description: 'Ejecuta una decisión estructurada de trading automático en Deriv basada en el análisis técnico en tiempo real.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['BUY_CALL', 'BUY_PUT', 'HOLD', 'PAUSE'],
          description: 'BUY_CALL (Subida), BUY_PUT (Bajada), HOLD (Esperar mercado), PAUSE (Pausar por riesgo).',
        },
        reasoning: {
          type: 'STRING',
          description: 'Explicación técnica en español justificando el motivo de la orden.',
        },
        confidence: {
          type: 'NUMBER',
          description: 'Nivel de certeza de la señal de 0.0 a 1.0 (Ej: 0.85).',
        },
        suggested_stake: {
          type: 'NUMBER',
          description: 'Monto sugerido para abrir la posición en USD.',
        },
        suggested_duration_ticks: {
          type: 'INTEGER',
          description: 'Duración de la operación en ticks (por defecto 5 ticks).',
        },
      },
      required: ['action', 'reasoning', 'confidence'],
    },
  };

  const handleCopyInstruction = () => {
    navigator.clipboard.writeText(currentPreset.systemInstruction);
    setCopiedInstruction(true);
    setTimeout(() => setCopiedInstruction(false), 2000);
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(JSON.stringify(functionCallingSchema, null, 2));
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-purple-400">
            <Bot className="w-4 h-4" />
            <span>PILAR 1: GOOGLE AI STUDIO (EL CEREBRO)</span>
          </div>
          <h2 className="text-xl font-bold text-white">System Instructions & Function Calling</h2>
          <p className="text-xs text-slate-400">
            Configuración lista para copiar e importar en la interfaz móvil de **Google AI Studio** (`aistudio.google.com`).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyInstruction}
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-purple-600/20"
          >
            {copiedInstruction ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            <span>{copiedInstruction ? '¡Copiado!' : 'Copiar System Instruction'}</span>
          </button>
          <button
            onClick={handleCopySchema}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
          >
            {copiedSchema ? <Check className="w-4 h-4 text-emerald-400" /> : <Code2 className="w-4 h-4 text-purple-400" />}
            <span>{copiedSchema ? '¡Copiado!' : 'Copiar JSON Schema'}</span>
          </button>
        </div>
      </div>

      {/* Preset Selector & Parameter Customizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Strategy Presets */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span>Estrategias Predefinidas</span>
          </h3>

          <div className="space-y-2">
            {Object.values(presets).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedStrategy(p.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  selectedStrategy === p.id
                    ? 'bg-purple-500/10 border-purple-500 text-white shadow-sm'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-white">{p.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-purple-300">
                    {p.symbol}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{p.description}</p>
              </button>
            ))}
          </div>

          {/* Dynamic Parameters */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ajustar Parámetros de Riesgo</span>
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Stake ($USD):</label>
                <input
                  type="number"
                  step="0.5"
                  value={stake}
                  onChange={(e) => setStake(parseFloat(e.target.value) || 1.0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:border-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Duración (Ticks):</label>
                <input
                  type="number"
                  value={durationTicks}
                  onChange={(e) => setDurationTicks(parseInt(e.target.value) || 5)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:border-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">RSI Sobreventa:</label>
                <input
                  type="number"
                  value={rsiOversold}
                  onChange={(e) => setRsiOversold(parseInt(e.target.value) || 28)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:border-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">RSI Sobrecompra:</label>
                <input
                  type="number"
                  value={rsiOverbought}
                  onChange={(e) => setRsiOverbought(parseInt(e.target.value) || 72)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:border-purple-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Prompts & Schemas Code Blocks */}
        <div className="lg:col-span-2 space-y-5">
          {/* System Instructions Box */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-4 h-4" />
                System Instructions (Pegar en AI Studio Móvil)
              </span>
              <button
                onClick={handleCopyInstruction}
                className="text-xs text-purple-400 hover:text-purple-300 font-mono flex items-center gap-1"
              >
                {copiedInstruction ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedInstruction ? '¡Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap select-all selection:bg-purple-500/30">
              {currentPreset.systemInstruction}
            </div>
          </div>

          {/* Function Calling JSON Schema Box */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Code2 className="w-4 h-4" />
                Function Calling JSON Schema (Sección 'Tools' en AI Studio)
              </span>
              <button
                onClick={handleCopySchema}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1"
              >
                {copiedSchema ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSchema ? '¡Copiado!' : 'Copiar Schema'}</span>
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 font-mono text-xs text-emerald-300 overflow-x-auto max-h-60 leading-relaxed whitespace-pre select-all selection:bg-emerald-500/30">
              {JSON.stringify(functionCallingSchema, null, 2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
