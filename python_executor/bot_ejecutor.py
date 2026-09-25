#!/usr/bin/env python3
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
DERIV_APP_ID = os.getenv("DERIV_APP_ID", "1089")  # 1089 es App ID por defecto para pruebas
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SYMBOL = os.getenv("SYMBOL", "R_100")            # R_100, R_50, R_10, BOOM500, CRASH500, etc.
STAKE_AMOUNT = float(os.getenv("STAKE_AMOUNT", "1.0")) # En USD
MAX_DAILY_LOSS = float(os.getenv("MAX_DAILY_LOSS", "20.0"))
TAKE_PROFIT_TARGET = float(os.getenv("TAKE_PROFIT_TARGET", "10.0"))
TRADE_DURATION_TICKS = int(os.getenv("TRADE_DURATION_TICKS", "5")) # Duración por defecto en ticks
EVALUATION_INTERVAL_SEC = int(os.getenv("EVALUATION_INTERVAL_SEC", "10"))

# Opciones Telegram (opcional)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# Reglas o System Instruction por defecto
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
        
        # Historial de precios (ticks)
        self.tick_history = []  # Lista de precios flotantes
        self.last_tick_time = 0
        
        # Estado de operaciones
        self.active_contract_id = None
        self.active_contract_type = None
        self.active_entry_price = None
        self.total_profit = 0.0
        self.daily_losses = 0.0
        self.trades_count = 0
        self.wins_count = 0
        self.losses_count = 0
        self.paused = False
        
        # Hilo de evaluación
        self.last_ai_eval_time = 0

state = BotState()

# =============================================================================
# FUNCIONES AUXILIARES & NOTIFICACIONES
# =============================================================================
def send_telegram(message):
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            payload = {"chat_id": TELEGRAM_CHAT_ID, "text": f"🤖 [Deriv AI Bot]\n{message}", "parse_mode": "Markdown"}
            requests.post(url, json=payload, timeout=5)
        except Exception as e:
            logger.error(f"Error al enviar mensaje por Telegram: {e}")

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
    
    # Calcular volatilidad simple (desviación estándar de los últimos 20 ticks)
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

# =============================================================================
# CONSULTA A LA API DE GEMINI (EL CEREBRO)
# =============================================================================
def query_gemini_brain(indicators, recent_ticks):
    if not GEMINI_API_KEY:
        logger.warning("⚠️ GEMINI_API_KEY no configurada. Usando lógica estricta alternativa.")
        return fallback_trading_logic(indicators)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    # Schema estricto para Function Calling
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
                        "description": "BUY_CALL para subir, BUY_PUT para bajar, HOLD para esperar, PAUSE para detener el bot por riesgo."
                    },
                    "reasoning": {
                        "type": "STRING",
                        "description": "Explicación breve del motivo de la entrada o espera."
                    },
                    "confidence": {
                        "type": "NUMBER",
                        "description": "Nivel de confianza de 0.0 a 1.0. Solo se ejecuta si es mayor a 0.70."
                    },
                    "suggested_stake": {
                        "type": "NUMBER",
                        "description": "Monto sugerido para la entrada en USD."
                    }
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
Tendencia EMA: {indicators.get('trend')}
Cambio 5 Ticks: {indicators.get('price_change_5_ticks')}
Desviación Estándar (Volatilidad): {indicators.get('volatility_std_dev')}

Últimos 10 Ticks: {recent_ticks[-10:]}

Estado de Cuenta:
- Balance Actual: {state.balance} {state.currency}
- Ganancia/Pérdida Acumulada: {state.total_profit:.2f} USD
- Stake Base: {STAKE_AMOUNT} USD
- Límite de Pérdida Diaria: {MAX_DAILY_LOSS} USD

Evalúa con tus System Instructions y llama a 'execute_trading_decision'.
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
        
        # Extraer llamada a función
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                if "functionCall" in part:
                    fc = part["functionCall"]
                    if fc.get("name") == "execute_trading_decision":
                        return fc.get("args", {})
                        
        logger.warning("Gemini no devolvió llamada a función válida. Retornando HOLD.")
        return {"action": "HOLD", "reasoning": "Respuesta no estructurada", "confidence": 0.0}

    except Exception as e:
        logger.error(f"Error al consultar Gemini API: {e}")
        return fallback_trading_logic(indicators)

def fallback_trading_logic(indicators):
    rsi = indicators.get("rsi", 50)
    trend = indicators.get("trend", "NEUTRAL")
    if rsi < 28 and trend == "BULLISH":
        return {"action": "BUY_CALL", "reasoning": "RSI sobrevendido + Tendencia alcista (Estrategia local)", "confidence": 0.85}
    elif rsi > 72 and trend == "BEARISH":
        return {"action": "BUY_PUT", "reasoning": "RSI sobrecomprado + Tendencia bajista (Estrategia local)", "confidence": 0.85}
    return {"action": "HOLD", "reasoning": "Mercado lateral o condiciones no cumplidas", "confidence": 0.5}

# =============================================================================
# COMUNICACIÓN DERIV WEBSOCKET (EL EJECUTOR EN LA NUBE)
# =============================================================================
def send_deriv_request(req_dict):
    if state.ws and state.connected:
        try:
            state.ws.send(json.dumps(req_dict))
        except Exception as e:
            logger.error(f"Error al enviar paquete WebSocket: {e}")

def authorize_account():
    if not DERIV_API_TOKEN:
        logger.error("❌ DERIV_API_TOKEN está vacío. Configúralo en las variables de entorno.")
        return
    logger.info("🔑 Autorizando cuenta de Deriv...")
    send_deriv_request({"authorize": DERIV_API_TOKEN})

def subscribe_ticks():
    logger.info(f"📊 Suscribiendo a flujo de Ticks en tiempo real para {SYMBOL}...")
    send_deriv_request({"ticks": SYMBOL})

def buy_contract(contract_type, stake, duration_ticks=5):
    if state.active_contract_id:
        logger.info("⚠️ Ya hay un contrato activo. Omitiendo nueva entrada.")
        return

    logger.info(f"⚡ EJECUTANDO ORDEN: {contract_type} | Stake: ${stake} | Duración: {duration_ticks} Ticks")
    
    proposal_req = {
        "proposal": 1,
        "amount": stake,
        "basis": "stake",
        "contract_type": contract_type,  # 'CALL' (Subir) o 'PUT' (Bajar)
        "currency": state.currency or "USD",
        "duration": duration_ticks,
        "duration_unit": "t",
        "symbol": SYMBOL,
        "subscribe": 1
    }
    
    # Enviar propuesta y comprar inmediatamente
    send_deriv_request(proposal_req)

def execute_proposal_buy(proposal_id, price):
    send_deriv_request({
        "buy": proposal_id,
        "price": price
    })

# =============================================================================
# EVENTOS MANEJADOS DEL WEBSOCKET
# =============================================================================
def on_message(ws, message):
    try:
        data = json.loads(message)
        msg_type = data.get("msg_type")

        # 1. Autorización Exitosa
        if msg_type == "authorize":
            auth = data.get("authorize", {})
            state.authorized = True
            state.balance = float(auth.get("balance", 0.0))
            state.currency = auth.get("currency", "USD")
            state.account_id = auth.get("loginid", "")
            logger.info(f"✅ Autorizado con Éxito. Cuenta: {state.account_id} | Balance: {state.balance} {state.currency}")
            send_telegram(f"✅ *Bot Iniciado en la Nube*\nCuenta: `{state.account_id}`\nBalance: `{state.balance} {state.currency}`\nActivo: `{SYMBOL}`")
            subscribe_ticks()

        # 2. Recepción de Ticks
        elif msg_type == "tick":
            tick = data.get("tick", {})
            quote = float(tick.get("quote", 0.0))
            state.tick_history.append(quote)
            if len(state.tick_history) > 100:
                state.tick_history.pop(0)
            
            # Evaluar decisión con la IA cada N segundos
            now = time.time()
            if state.authorized and not state.paused and not state.active_contract_id:
                if now - state.last_ai_eval_time >= EVALUATION_INTERVAL_SEC and len(state.tick_history) >= 20:
                    state.last_ai_eval_time = now
                    threading.Thread(target=evaluate_market_and_trade, daemon=True).start()

        # 3. Propuesta lista para compra
        elif msg_type == "proposal":
            proposal = data.get("proposal", {})
            if "id" in proposal and "ask_price" in proposal:
                p_id = proposal["id"]
                p_price = proposal["ask_price"]
                execute_proposal_buy(p_id, p_price)

        # 4. Confirmación de Compra
        elif msg_type == "buy":
            buy_info = data.get("buy", {})
            state.active_contract_id = buy_info.get("contract_id")
            state.active_entry_price = buy_info.get("buy_price")
            logger.info(f"🎉 Contrato Abierto en Mercado. ID: {state.active_contract_id} | Precio: ${state.active_entry_price}")
            
            # Suscribir a actualización del contrato
            send_deriv_request({"proposal_open_contract": 1, "contract_id": state.active_contract_id, "subscribe": 1})

        # 5. Seguimiento del Contrato Abierto
        elif msg_type == "proposal_open_contract":
            poc = data.get("proposal_open_contract", {})
            is_sold = poc.get("is_sold")
            
            if is_sold == 1:
                profit = float(poc.get("profit", 0.0))
                status = poc.get("status") # 'won' o 'lost'
                contract_id = poc.get("contract_id")
                
                state.total_profit += profit
                state.trades_count += 1
                if profit > 0:
                    state.wins_count += 1
                else:
                    state.losses_count += 1
                    state.daily_losses += abs(profit)

                result_emoji = "🟢 GANADA (+USD {:.2f})" if profit > 0 else "🔴 PERDIDA (-USD {:.2f})"
                logger.info(f"🏁 Contrato Finalizado [{status.upper()}]. Profit: {result_emoji.format(profit)}")
                logger.info(f"📊 Estadísticas: {state.wins_count}W - {state.losses_count}L | Total Profit: ${state.total_profit:.2f}")

                send_telegram(
                    f"🏁 *Resultado de Operación*\n"
                    f"Resultado: {result_emoji.format(profit)}\n"
                    f"Acumulado: `${state.total_profit:.2f} USD`\n"
                    f"Win Rate: `{(state.wins_count/state.trades_count)*100:.1f}%` ({state.wins_count}W/{state.losses_count}L)"
                )

                # Resetear contrato activo
                state.active_contract_id = None
                
                # Control de riesgo máximo
                if state.daily_losses >= MAX_DAILY_LOSS:
                    state.paused = True
                    logger.warning(f"🛑 Límite de Pérdida Diaria Alcanzado (${MAX_DAILY_LOSS} USD). Pausando el bot.")
                    send_telegram(f"🛑 *BOT PAUSADO POR RIESGO*\nSe alcanzó el límite diario de pérdida: `${MAX_DAILY_LOSS} USD`.")

        elif "error" in data:
            err = data["error"]
            logger.error(f"❌ Error Deriv API [{err.get('code')}]: {err.get('message')}")

    except Exception as e:
        logger.error(f"Error procesando mensaje WebSocket: {e}")

def evaluate_market_and_trade():
    indicators = calculate_indicators(state.tick_history)
    if not indicators:
        return

    logger.info(f"🧠 Consultando al Cerebro (Gemini) | Precio: {indicators.get('price')} | RSI: {indicators.get('rsi')} | Trend: {indicators.get('trend')}")
    
    decision = query_gemini_brain(indicators, state.tick_history)
    action = decision.get("action", "HOLD")
    reasoning = decision.get("reasoning", "")
    confidence = float(decision.get("confidence", 0.0))
    suggested_stake = float(decision.get("suggested_stake", STAKE_AMOUNT))

    logger.info(f"💡 Decisión IA: {action} (Confianza: {confidence*100:.0f}%) -> {reasoning}")

    if confidence >= 0.70:
        if action == "BUY_CALL":
            buy_contract("CALL", suggested_stake, TRADE_DURATION_TICKS)
        elif action == "BUY_PUT":
            buy_contract("PUT", suggested_stake, TRADE_DURATION_TICKS)
        elif action == "PAUSE":
            state.paused = True
            logger.warning("Pausando bot por indicación directa de la IA.")

def on_error(ws, error):
    logger.error(f"⚠️ Error de WebSocket: {error}")

def on_close(ws, close_status_code, close_msg):
    logger.warning(f"🔌 Conexión WebSocket Cerrada [{close_status_code}]: {close_msg}. Reconectando en 5 segundos...")
    state.connected = False
    state.authorized = False
    time.sleep(5)
    start_bot()

def on_open(ws):
    logger.info("🟢 Conexión WebSocket Establecida con Deriv API Server.")
    state.connected = True
    authorize_account()

def start_bot():
    ws_url = f"wss://ws.derivws.com/websockets/v3?app_id={DERIV_APP_ID}"
    logger.info(f"🚀 Iniciando Deriv AI Trading Bot 24/7 en URL: {ws_url}")
    
    # Activar debug de websocket si es necesario
    # websocket.enableTrace(True)
    
    state.ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    
    # Bucle infinito con auto-reconexión
    state.ws.run_forever(ping_interval=30, ping_timeout=10)

if __name__ == "__main__":
    if not DERIV_API_TOKEN:
        logger.warning("⚠️ ALERTA: No se ha ingresado DERIV_API_TOKEN en el entorno.")
        logger.warning("Configura las variables de entorno DERIV_API_TOKEN y GEMINI_API_KEY para operar.")
    
    start_bot()
