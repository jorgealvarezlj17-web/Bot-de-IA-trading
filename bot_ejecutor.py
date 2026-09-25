#!/usr/bin/env python3
"""
=============================================================================
DERIV AI TRADING BOT - EJECUTOR EN LA NUBE 100% GRATIS (RENDER WEB SERVICE)
=============================================================================
"""

import os
import sys
import json
import time
import math
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
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
# Si DERIV_APP_ID tiene un formato de UUID o no numérico, usar 1089 por defecto para la conexión WS de Deriv
raw_app_id = os.getenv("DERIV_APP_ID", "1089").strip()
DERIV_APP_ID = raw_app_id if raw_app_id.isdigit() else "1089"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SYMBOL = os.getenv("SYMBOL", "R_100")
STAKE_AMOUNT = float(os.getenv("STAKE_AMOUNT", "1.0"))
MAX_DAILY_LOSS = float(os.getenv("MAX_DAILY_LOSS", "20.0"))
TRADE_DURATION_TICKS = int(os.getenv("TRADE_DURATION_TICKS", "5"))
EVALUATION_INTERVAL_SEC = int(os.getenv("EVALUATION_INTERVAL_SEC", "10"))
PORT = int(os.getenv("PORT", "10000"))

SYSTEM_INSTRUCTION = os.getenv("SYSTEM_INSTRUCTION", """
Eres un Trader Scalper experto analizando Índices Sintéticos de Deriv (Volatility 100 Index).
Identifica momentos de alta probabilidad para operaciones rápidas (5 ticks).
Analiza precios, RSI y Medias Móviles (EMA 9 y EMA 21).
- RSI < 30 y EMA9 > EMA21 -> 'BUY_CALL'
- RSI > 70 y EMA9 < EMA21 -> 'BUY_PUT'
- Sin tendencia clara -> 'HOLD'
Responde usando exclusivamente la función 'execute_trading_decision'.
""")

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

# =============================================================================
# MINI SERVIDOR HTTP PARA MANTENER RENDER FREE SERVICE ACTIVO
# =============================================================================
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        response_data = {
            "status": "online",
            "bot_connected": state.connected,
            "authorized": state.authorized,
            "account_id": state.account_id,
            "balance": f"{state.balance} {state.currency}",
            "total_profit": round(state.total_profit, 2),
            "trades_count": state.trades_count
        }
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

    def log_message(self, format, *args):
        return

def run_http_server():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, HealthCheckHandler)
    logger.info(f"🌐 Servidor Health-Check activo en puerto {PORT}")
    httpd.serve_forever()

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
    return {
        "price": current_price,
        "rsi": rsi,
        "ema9": ema9,
        "ema21": ema21,
        "trend": "BULLISH" if ema9 > ema21 else ("BEARISH" if ema9 < ema21 else "NEUTRAL")
    }

def query_gemini_brain(indicators, recent_ticks):
    if not GEMINI_API_KEY:
        rsi = indicators.get("rsi", 50)
        trend = indicators.get("trend", "NEUTRAL")
        if rsi < 28 and trend == "BULLISH":
            return {"action": "BUY_CALL", "reasoning": "RSI sobrevendido", "confidence": 0.85}
        elif rsi > 72 and trend == "BEARISH":
            return {"action": "BUY_PUT", "reasoning": "RSI sobrecomprado", "confidence": 0.85}
        return {"action": "HOLD", "reasoning": "Neutral", "confidence": 0.5}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    tools = [{
        "functionDeclarations": [{
            "name": "execute_trading_decision",
            "description": "Envía una decisión estructurada de trading para Deriv.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "action": {"type": "STRING", "enum": ["BUY_CALL", "BUY_PUT", "HOLD", "PAUSE"]},
                    "reasoning": {"type": "STRING"},
                    "confidence": {"type": "NUMBER"}
                },
                "required": ["action", "reasoning", "confidence"]
            }
        }]
    }]

    prompt = f"SIMBOLO: {SYMBOL} | Precio: {indicators.get('price')} | RSI: {indicators.get('rsi')} | Trend: {indicators.get('trend')}"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "tools": tools,
        "toolConfig": {"functionCallingConfig": {"mode": "ANY", "allowedFunctionNames": ["execute_trading_decision"]}}
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
        return {"action": "HOLD", "reasoning": "Error", "confidence": 0.0}

def send_deriv_request(req_dict):
    if state.ws and state.connected:
        try:
            state.ws.send(json.dumps(req_dict))
        except Exception as e:
            logger.error(f"Error enviando WS: {e}")

def authorize_account():
    if DERIV_API_TOKEN:
        logger.info("🔑 Enviando solicitud de autorización a Deriv...")
        send_deriv_request({"authorize": DERIV_API_TOKEN})
    else:
        logger.error("❌ DERIV_API_TOKEN no está presente en las variables de entorno.")

def subscribe_ticks():
    logger.info(f"📊 Suscribiendo a Ticks de {SYMBOL}...")
    send_deriv_request({"ticks": SYMBOL})

def buy_contract(contract_type, stake, duration_ticks=5):
    if state.active_contract_id:
        return
    logger.info(f"⚡ COMPRANDO CONTRATO: {contract_type} | Stake: ${stake}")
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
            if "error" in data:
                logger.error(f"❌ Error de Autorización Deriv: {data['error'].get('message')}")
                return
            state.authorized = True
            state.balance = float(auth.get("balance", 0.0))
            state.currency = auth.get("currency", "USD")
            state.account_id = auth.get("loginid", "")
            logger.info(f"✅ AUTORIZADO CON ÉXITO | Cuenta: {state.account_id} | Balance: {state.balance} {state.currency}")
            subscribe_ticks()

        elif msg_type == "tick":
            tick = data.get("tick", {})
            quote = float(tick.get("quote", 0.0))
            state.tick_history.append(quote)
            if len(state.tick_history) > 50:
                state.tick_history.pop(0)

            now = time.time()
            if state.authorized and not state.paused and not state.active_contract_id:
                if now - state.last_ai_eval_time >= EVALUATION_INTERVAL_SEC and len(state.tick_history) >= 15:
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
                logger.info(f"🏁 Resultado Operación: {profit:+.2f} USD | Total Acumulado: {state.total_profit:+.2f} USD")
                state.active_contract_id = None

    except Exception as e:
        logger.error(f"Error procesando mensaje: {e}")

def evaluate_market_and_trade():
    indicators = calculate_indicators(state.tick_history)
    if not indicators:
        return
    decision = query_gemini_brain(indicators, state.tick_history)
    action = decision.get("action", "HOLD")
    confidence = float(decision.get("confidence", 0.0))

    if confidence >= 0.70:
        if action == "BUY_CALL":
            buy_contract("CALL", STAKE_AMOUNT, TRADE_DURATION_TICKS)
        elif action == "BUY_PUT":
            buy_contract("PUT", STAKE_AMOUNT, TRADE_DURATION_TICKS)

def on_error(ws, error):
    logger.error(f"Error WS: {error}")

def on_close(ws, status, msg):
    logger.warning("Conexión WebSocket cerrada. Reconectando en 5s...")
    time.sleep(5)

def on_open(ws):
    logger.info("🟢 Conectado exitosamente con Deriv WebSocket Server")
    state.connected = True
    authorize_account()

def start_bot():
    ws_url = f"wss://ws.derivws.com/websockets/v3?app_id={DERIV_APP_ID}"
    logger.info(f"🔌 Conectando a {ws_url}...")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    while True:
        try:
            state.ws = websocket.WebSocketApp(
                ws_url,
                header=headers,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            state.ws.run_forever(ping_interval=30, ping_timeout=10)
        except Exception as e:
            logger.error(f"Excepción en bucle principal WS: {e}")
            time.sleep(5)

if __name__ == "__main__":
    # Iniciar servidor HTTP para el Health Check de Render Free Tier
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()
    
    # Iniciar el Bot de Trading
    start_bot()
