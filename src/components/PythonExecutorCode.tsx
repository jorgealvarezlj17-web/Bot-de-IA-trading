import React, { useState } from 'react';
import { Server, Copy, Check, Download, Terminal, Code2, ExternalLink, ShieldCheck, FileText } from 'lucide-react';

export const PythonExecutorCode: React.FC = () => {
  const [activeFile, setActiveFile] = useState<string>('bot_ejecutor.py');
  const [copied, setCopied] = useState<boolean>(false);

  // Files dictionary
  const pythonScript = `#!/usr/bin/env python3
"""
=============================================================================
DERIV AI TRADING BOT - EJECUTOR EN LA NUBE (24/7)
=============================================================================
Pilares del Sistema:
1. El Cerebro: Google AI Studio / Gemini API (System Instructions + Function Calling)
2. El Ejecutor: Este script en Python hospedado en Render / Railway / Replit
3. La Conexión: WebSocket en tiempo real con la API de Deriv (sin gastar batería de tu celular)
=============================================================================
"""

import os
import sys
import json
import time
import math
import logging
import threading
from datetime import datetime
import websocket
import requests

# Configuración de Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("DerivAIBot")

# =============================================================================
# CONFIGURACIÓN DESDE VARIABLES DE ENTORNO
# =============================================================================
DERIV_API_TOKEN = os.getenv("DERIV_API_TOKEN", "")
DERIV_APP_ID = os.getenv("DERIV_APP_ID", "1089")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SYMBOL = os.getenv("SYMBOL", "R_100")
STAKE_AMOUNT = float(os.getenv("STAKE_AMOUNT", "1.0"))
MAX_DAILY_LOSS = float(os.getenv("MAX_DAILY_LOSS", "20.0"))
TRADE_DURATION_TICKS = int(os.getenv("TRADE_DURATION_TICKS", "5"))
EVALUATION_INTERVAL_SEC = int(os.getenv("EVALUATION_INTERVAL_SEC", "10"))

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

SYSTEM_INSTRUCTION = os.getenv("SYSTEM_INSTRUCTION", """
Eres un Trader Scalper experto de Alta Frecuencia analizando Índices Sintéticos de Deriv (como Volatility 100 Index).
Tu objetivo es identificar momentos de alta probabilidad para operaciones rápidas (5 ticks).
Analiza los precios recientes, RSI, diferencia de Medias Móviles (EMA 9 y EMA 21) y volatilidad.
Debes tomar decisiones estrictas de gestión de riesgo:
- Si RSI < 30 y EMA9 > EMA21 o hay cambio de tendencia alcista -> RECOMIENDA 'BUY_CALL'
- Si RSI > 70 y EMA9 < EMA21 o hay cambio de tendencia bajista -> RECOMIENDA 'BUY_PUT'
- Si el mercado no tiene dirección clara o la volatilidad es errática -> RECOMIENDA 'HOLD'
- Si la pérdida acumulada supera el límite -> RECOMIENDA 'PAUSE'
Responde usando exclusivamente la llamada a función 'execute_trading_decision'.
""")

# =============================================================================
# ESTADO GLOBAL DEL BOT
# =============================================================================
class BotState:
    def __init__(self):
        self.ws = None
        self.connected = False
        self.authorized = False
        self.balance = 0.0
        self.currency = "USD"
        self.account_id = ""
        self.tick_history = []
        self.active_contract_id = None
        self.total_profit = 0.0
        self.daily_losses = 0.0
        self.trades_count = 0
        self.wins_count = 0
        self.losses_count = 0
        self.paused = False
        self.last_ai_eval_time = 0

state = BotState()

def send_telegram(message):
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            payload = {"chat_id": TELEGRAM_CHAT_ID, "text": f"🤖 [Deriv AI Bot]\\n{message}", "parse_mode": "Markdown"}
            requests.post(url, json=payload, timeout=5)
        except Exception as e:
            logger.error(f"Error enviando mensaje Telegram: {e}")

def calculate_rsi(prices, period=14):
    if len(prices) < period + 1:
        return 50.0
    deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
    gains = [d if d > 0 else 0 for d in deltas[-period:]]
    losses = [-d if d < 0 else 0 for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)

def calculate_ema(prices, period):
    if len(prices) < period:
        return prices[-1] if prices else 0.0
    k = 2 / (period + 1)
    ema = sum(prices[:period]) / period
    for price in prices[period:]:
        ema = (price * k) + (ema * (1 - k))
    return round(ema, 4)

def calculate_indicators(prices):
    if not prices or len(prices) < 5:
        return {}
    current_price = prices[-1]
    rsi = calculate_rsi(prices, 14)
    ema9 = calculate_ema(prices, 9)
    ema21 = calculate_ema(prices, 21)
    price_change_5t = round(prices[-1] - prices[-5], 4) if len(prices) >= 5 else 0.0
    recent = prices[-20:] if len(prices) >= 20 else prices
    mean = sum(recent) / len(recent)
    variance = sum((x - mean) ** 2 for x in recent) / len(recent)
    std_dev = round(math.sqrt(variance), 4)

    return {
        "price": current_price,
        "rsi": rsi,
        "ema9": ema9,
        "ema21": ema21,
        "trend": "BULLISH" if ema9 > ema21 else ("BEARISH" if ema9 < ema21 else "NEUTRAL"),
        "price_change_5_ticks": price_change_5t,
        "volatility_std_dev": std_dev
    }

def query_gemini_brain(indicators, recent_ticks):
    if not GEMINI_API_KEY:
        logger.warning("⚠️ GEMINI_API_KEY no configurada. Usando lógica estricta alternativa.")
        return fallback_trading_logic(indicators)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    tools = [{
        "functionDeclarations": [{
            "name": "execute_trading_decision",
            "description": "Envía una decisión estructurada de trading para ejecutar en Deriv.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "action": {
                        "type": "STRING",
                        "enum": ["BUY_CALL", "BUY_PUT", "HOLD", "PAUSE"],
                    },
                    "reasoning": {"type": "STRING"},
                    "confidence": {"type": "NUMBER"},
                    "suggested_stake": {"type": "NUMBER"}
                },
                "required": ["action", "reasoning", "confidence"]
            }
        }]
    }]

    prompt = f"""
ANÁLISIS TÉCNICO EN TIEMPO REAL - SÍMBOLO: {SYMBOL}
--------------------------------------------------
Precio Actual: {indicators.get('price')}
RSI (14): {indicators.get('rsi')}
EMA 9: {indicators.get('ema9')}
EMA 21: {indicators.get('ema21')}
Tendencia: {indicators.get('trend')}
Cambio 5 Ticks: {indicators.get('price_change_5_ticks')}
Volatilidad: {indicators.get('volatility_std_dev')}
Últimos Ticks: {recent_ticks[-10:]}

Estado de Cuenta:
- Balance: {state.balance} {state.currency}
- Total Profit: {state.total_profit:.2f} USD
- Stake Base: {STAKE_AMOUNT} USD

Evalúa el mercado y llama a 'execute_trading_decision'.
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "tools": tools,
        "toolConfig": {
            "functionCallingConfig": {
                "mode": "ANY",
                "allowedFunctionNames": ["execute_trading_decision"]
            }
        }
    }

    try:
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=8)
        data = response.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                if "functionCall" in part:
                    return part["functionCall"].get("args", {})
        return {"action": "HOLD", "reasoning": "Sin llamada válida", "confidence": 0.0}
    except Exception as e:
        logger.error(f"Error consultando Gemini: {e}")
        return fallback_trading_logic(indicators)

def fallback_trading_logic(indicators):
    rsi = indicators.get("rsi", 50)
    trend = indicators.get("trend", "NEUTRAL")
    if rsi < 28 and trend == "BULLISH":
        return {"action": "BUY_CALL", "reasoning": "RSI sobrevendido + Tendencia alcista", "confidence": 0.85}
    elif rsi > 72 and trend == "BEARISH":
        return {"action": "BUY_PUT", "reasoning": "RSI sobrecomprado + Tendencia bajista", "confidence": 0.85}
    return {"action": "HOLD", "reasoning": "Esperando oportunidad", "confidence": 0.5}

def send_deriv_request(req_dict):
    if state.ws and state.connected:
        try:
            state.ws.send(json.dumps(req_dict))
        except Exception as e:
            logger.error(f"Error enviando WebSocket: {e}")

def authorize_account():
    if not DERIV_API_TOKEN:
        logger.error("❌ DERIV_API_TOKEN no configurado.")
        return
    logger.info("🔑 Autorizando en Deriv...")
    send_deriv_request({"authorize": DERIV_API_TOKEN})

def subscribe_ticks():
    logger.info(f"📊 Suscribiendo a Ticks de {SYMBOL}...")
    send_deriv_request({"ticks": SYMBOL})

def buy_contract(contract_type, stake, duration_ticks=5):
    if state.active_contract_id:
        return
    logger.info(f"⚡ COMPRANDO CONTRATO: {contract_type} | Stake: \\\${stake} | Duración: {duration_ticks} Ticks")
    send_deriv_request({
        "proposal": 1,
        "amount": stake,
        "basis": "stake",
        "contract_type": contract_type,
        "currency": state.currency or "USD",
        "duration": duration_ticks,
        "duration_unit": "t",
        "symbol": SYMBOL,
        "subscribe": 1
    })

def on_message(ws, message):
    try:
        data = json.loads(message)
        msg_type = data.get("msg_type")

        if msg_type == "authorize":
            auth = data.get("authorize", {})
            state.authorized = True
            state.balance = float(auth.get("balance", 0.0))
            state.currency = auth.get("currency", "USD")
            state.account_id = auth.get("loginid", "")
            logger.info(f"✅ Autorizado: {state.account_id} | Balance: {state.balance} {state.currency}")
            send_telegram(f"✅ *Bot Iniciado en la Nube*\\nCuenta: \`{state.account_id}\`\\nBalance: \`{state.balance} {state.currency}\`")
            subscribe_ticks()

        elif msg_type == "tick":
            tick = data.get("tick", {})
            quote = float(tick.get("quote", 0.0))
            state.tick_history.append(quote)
            if len(state.tick_history) > 100:
                state.tick_history.pop(0)

            now = time.time()
            if state.authorized and not state.paused and not state.active_contract_id:
                if now - state.last_ai_eval_time >= EVALUATION_INTERVAL_SEC and len(state.tick_history) >= 20:
                    state.last_ai_eval_time = now
                    threading.Thread(target=evaluate_market_and_trade, daemon=True).start()

        elif msg_type == "proposal":
            proposal = data.get("proposal", {})
            if "id" in proposal and "ask_price" in proposal:
                send_deriv_request({"buy": proposal["id"], "price": proposal["ask_price"]})

        elif msg_type == "buy":
            buy_info = data.get("buy", {})
            state.active_contract_id = buy_info.get("contract_id")
            logger.info(f"🎉 Contrato Abierto ID: {state.active_contract_id}")
            send_deriv_request({"proposal_open_contract": 1, "contract_id": state.active_contract_id, "subscribe": 1})

        elif msg_type == "proposal_open_contract":
            poc = data.get("proposal_open_contract", {})
            if poc.get("is_sold") == 1:
                profit = float(poc.get("profit", 0.0))
                state.total_profit += profit
                state.trades_count += 1
                if profit > 0:
                    state.wins_count += 1
                else:
                    state.losses_count += 1
                    state.daily_losses += abs(profit)

                logger.info(f"🏁 Resultado: {profit:+.2f} USD | Total: {state.total_profit:+.2f} USD")
                send_telegram(f"🏁 *Resultado Operación*: \`{profit:+.2f} USD\` | Total Acumulado: \`{state.total_profit:+.2f} USD\`")
                state.active_contract_id = None

                if state.daily_losses >= MAX_DAILY_LOSS:
                    state.paused = True
                    logger.warning(f"🛑 Límite de pérdida diaria alcanzado ({MAX_DAILY_LOSS} USD). Pausando bot.")

    except Exception as e:
        logger.error(f"Error procesando mensaje: {e}")

def evaluate_market_and_trade():
    indicators = calculate_indicators(state.tick_history)
    if not indicators:
        return
    decision = query_gemini_brain(indicators, state.tick_history)
    action = decision.get("action", "HOLD")
    confidence = float(decision.get("confidence", 0.0))
    trade_stake = float(decision.get("suggested_stake", STAKE_AMOUNT))

    if confidence >= 0.70:
        if action == "BUY_CALL":
            buy_contract("CALL", trade_stake, TRADE_DURATION_TICKS)
        elif action == "BUY_PUT":
            buy_contract("PUT", trade_stake, TRADE_DURATION_TICKS)
        elif action == "PAUSE":
            state.paused = True

def on_error(ws, error):
    logger.error(f"Error WebSocket: {error}")

def on_close(ws, status, msg):
    logger.warning("Conexión cerrada. Reconectando en 5 segundos...")
    time.sleep(5)
    start_bot()

def on_open(ws):
    logger.info("🟢 Conectado con Deriv WebSocket Server")
    state.connected = True
    authorize_account()

def start_bot():
    ws_url = f"wss://ws.derivws.com/websockets/v3?app_id={DERIV_APP_ID}"
    state.ws = websocket.WebSocketApp(ws_url, on_open=on_open, on_message=on_message, on_error=on_error, on_close=on_close)
    state.ws.run_forever(ping_interval=30, ping_timeout=10)

if __name__ == "__main__":
    start_bot()
`;

  const filesMap: Record<string, string> = {
    'bot_ejecutor.py': pythonScript,
    'requirements.txt': `websocket-client>=1.8.0\nrequests>=2.31.0\ngoogle-genai>=2.4.0\npython-dotenv>=1.0.1`,
    'Procfile': `worker: python bot_ejecutor.py`,
    'Dockerfile': `FROM python:3.11-slim\nWORKDIR /app\nRUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY bot_ejecutor.py .\nENV PYTHONUNBUFFERED=1\nCMD ["python", "bot_ejecutor.py"]`,
    '.env.example': `DERIV_API_TOKEN="TU_TOKEN_DERIV_AQUI"\nDERIV_APP_ID="1089"\nGEMINI_API_KEY="TU_GEMINI_API_KEY_AQUI"\nSYMBOL="R_100"\nSTAKE_AMOUNT="1.0"\nTRADE_DURATION_TICKS="5"\nMAX_DAILY_LOSS="20.0"\nTELEGRAM_BOT_TOKEN=""\nTELEGRAM_CHAT_ID=""`,
    'README_DEPLOY.md': `# Guía de Despliegue en Render / Railway / Replit\n\n1. Crea un worker en Render.com\n2. Agrega las variables de entorno DERIV_API_TOKEN y GEMINI_API_KEY\n3. ¡El bot se ejecutará 24/7 sin gastar la batería de tu celular!`,
  };

  const currentContent = filesMap[activeFile] || pythonScript;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-blue-400">
            <Server className="w-4 h-4" />
            <span>PILAR 2: EL EJECUTOR PYTHON EN LA NUBE (24/7)</span>
          </div>
          <h2 className="text-xl font-bold text-white">Código Completo del Bot Ejecutor</h2>
          <p className="text-xs text-slate-400">
            Script listo para desplegar en Render, Railway, Replit o un VPS. Conecta Deriv WebSocket con Gemini API.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? '¡Copiado!' : `Copiar ${activeFile}`}</span>
          </button>
          <button
            onClick={handleDownload}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>Descargar</span>
          </button>
        </div>
      </div>

      {/* Code File Viewer & Tabs */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        {/* File Tabs */}
        <div className="flex items-center gap-1 p-2 bg-slate-950 border-b border-slate-800 overflow-x-auto no-scrollbar">
          {Object.keys(filesMap).map((fileName) => (
            <button
              key={fileName}
              onClick={() => setActiveFile(fileName)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                activeFile === fileName
                  ? 'bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{fileName}</span>
            </button>
          ))}
        </div>

        {/* Code Content */}
        <div className="p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto max-h-[500px] leading-relaxed select-all">
          <pre>{currentContent}</pre>
        </div>
      </div>

      {/* Render 1-Click Instructions */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-emerald-400" />
          Pasos para Desplegar Gratis en Render.com en 3 Minutos
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <span className="font-mono text-blue-400 font-bold">1. Crear Repositorio</span>
            <p className="text-slate-300">
              Crea un repositorio en GitHub con estos archivos (`bot_ejecutor.py`, `requirements.txt`, `Procfile`).
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <span className="font-mono text-blue-400 font-bold">2. Nuevo Background Worker</span>
            <p className="text-slate-300">
              En Render.com, selecciona **New + &gt; Background Worker**, conecta tu GitHub y selecciona Python.
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <span className="font-mono text-blue-400 font-bold">3. Cargar Variables de Entorno</span>
            <p className="text-slate-300">
              Ingresa `DERIV_API_TOKEN` y `GEMINI_API_KEY`. Haz clic en Deploy y tu bot funcionará 24/7.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
