#!/usr/bin/env python3
import requests
import json
import os

account_id = "41255620"
server = "Deriv-Demo"
password = "Yoryeluis1707."

print(f"=== PRUEBA DE CONEXIÓN Y ESTADO METATRADER 5 ===")
print(f"Cuenta MT5 ID: {account_id}")
print(f"Servidor: {server}")
print(f"Contraseña asignada: {'*' * len(password)}")

# Check Deriv WebSocket auth with API token
token = "pat_e1812e7694a4130e5187e7e77a1c9392fabffb197ffe209629e12f6a9a337546"
import websocket

def on_message(ws, message):
    data = json.loads(message)
    print("\n[Respuesta Deriv API]:", json.dumps(data, indent=2))
    ws.close()

def on_open(ws):
    ws.send(json.dumps({"authorize": token}))

ws = websocket.WebSocketApp("wss://ws.derivws.com/websockets/v3?app_id=1089",
                            on_message=on_message,
                            on_open=on_open)
ws.run_forever()
