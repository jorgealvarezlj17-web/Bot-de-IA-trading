import React from 'react';
import { Smartphone, Bot, Server, Zap, CheckCircle2, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';

interface GuideProps {
  onGoToTab: (tab: string) => void;
}

export const ArchitectureGuide: React.FC<GuideProps> = ({ onGoToTab }) => {
  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Trading 100% Celular - Sin Necesidad de PC Encendida</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Arquitectura de Trading Automático Inteligente
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Conecta **Google AI Studio** como el cerebro de decisiones, un **Servidor Python en la nube** como ejecutor 24/7 y la **API WebSocket de Deriv** para realizar operaciones instantáneas en la nube sin agotar la batería de tu teléfono.
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => onGoToTab('brain')}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <Bot className="w-4 h-4" />
              <span>Configurar Cerebro en AI Studio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onGoToTab('python')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 border border-slate-700"
            >
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Copiar Código Python</span>
            </button>
          </div>
        </div>
      </div>

      {/* The 3 Pillars Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pillar 1 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-mono text-lg font-bold">
            1
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-purple-400">
              <Bot className="w-4 h-4" />
              <span>EL CEREBRO</span>
            </div>
            <h3 className="text-lg font-bold text-white">Google AI Studio</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Inicias sesión en la web de Google AI Studio desde el navegador de tu móvil. Configuras las **System Instructions** y **Function Calling** con tus reglas de entrada y gestión de riesgo.
            </p>
          </div>
          <ul className="text-xs text-slate-300 space-y-1.5 pt-2 border-t border-slate-800">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Estrategia de scalping editable por chat</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Respuestas en JSON estructurado</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Gemini 3.8 Flash para baja latencia</span>
            </li>
          </ul>
        </div>

        {/* Pillar 2 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-mono text-lg font-bold">
            2
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400">
              <Server className="w-4 h-4" />
              <span>EL EJECUTOR</span>
            </div>
            <h3 className="text-lg font-bold text-white">Python en la Nube 24/7</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Un script de Python alojado gratis en servidores como **Render.com** o **Railway**. Recibe datos del mercado, consulta a la API de Gemini y ejecuta las órdenes instantáneamente.
            </p>
          </div>
          <ul className="text-xs text-slate-300 space-y-1.5 pt-2 border-t border-slate-800">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Hospedaje 100% gratuito 24/7</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Cálculo de RSI, EMA 9/21 y Volatilidad</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Alertas en tiempo real a tu Telegram</span>
            </li>
          </ul>
        </div>

        {/* Pillar 3 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono text-lg font-bold">
            3
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <Zap className="w-4 h-4" />
              <span>EL MERCADO</span>
            </div>
            <h3 className="text-lg font-bold text-white">Deriv WebSocket API</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Conexión directa vía WebSocket de alta velocidad con tu cuenta de Deriv (Demo o Real). Permite comprar contratos (Rise/Fall, Touch/No Touch) en milisegundos.
            </p>
          </div>
          <ul className="text-xs text-slate-300 space-y-1.5 pt-2 border-t border-slate-800">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Índices Sintéticos (Volatility 100/50)</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Ejecución en 5 ticks (~5 segundos)</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Stop Loss & Take Profit automático</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Mobile Flow Steps */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-emerald-400" />
          Paso a Paso: Cómo Gestionar Todo Desde Tu Teléfono
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <span className="text-xs font-mono font-semibold text-emerald-400">PASO 1</span>
            <h4 className="font-semibold text-white text-sm">Obtén tu API Token de Deriv</h4>
            <p className="text-xs text-slate-400">
              Inicia sesión en Deriv.com desde Chrome/Safari en tu celular. Ve a **Configuración de la Cuenta** &gt; **Token de API**, crea un token con permisos de *Read* y *Trade* y cópialo.
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <span className="text-xs font-mono font-semibold text-emerald-400">PASO 2</span>
            <h4 className="font-semibold text-white text-sm">Copia el Código Python a Render / Railway</h4>
            <p className="text-xs text-slate-400">
              Ve a la pestaña **3. Ejecutor Python** en este Hub, copia el código `bot_ejecutor.py` y despliega un servicio gratuito en **Render.com** pegando tu `DERIV_API_TOKEN` y `GEMINI_API_KEY`.
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <span className="text-xs font-mono font-semibold text-emerald-400">PASO 3</span>
            <h4 className="font-semibold text-white text-sm">Configura AI Studio en tu Móvil</h4>
            <p className="text-xs text-slate-400">
              Entra a **aistudio.google.com** en el navegador del celular. Copia las **System Instructions** y el **Function Calling JSON** de la pestaña **2. Cerebro AI Studio**.
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <span className="text-xs font-mono font-semibold text-emerald-400">PASO 4</span>
            <h4 className="font-semibold text-white text-sm">Modifica Reglas en Tiempo Real</h4>
            <p className="text-xs text-slate-400">
              ¿Quieres pausar el bot o cambiar el lotaje? Solo chatea con el modelo en Google AI Studio o edita la instrucción desde tu teléfono. La IA actualizará sus criterios al instante.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
