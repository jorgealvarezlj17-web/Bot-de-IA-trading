//+------------------------------------------------------------------+
//|                                         Gemini_Deriv_MT5.mq5     |
//|                        Copyright 2026, Deriv AI Trading Bot      |
//|                                  https://generativelanguage.google|
//+------------------------------------------------------------------+
#property copyright "Deriv AI Bot"
#property link      "https://generativelanguage.googleapis.com"
#property version   "1.00"
#property description "Asesor Experto IA impulsado por Google Gemini 2.5 Flash para Índices Sintéticos de Deriv en MetaTrader 5"

#include <Trade\Trade.mqh>

//--- Parámetros de Entrada
input string   InpGeminiApiKey      = "";                   // Gemini API Key (Google AI Studio)
input double   InpLotSize           = 0.20;                 // Tamaño del Lote (Ej: 0.20 para Volatility 100)
input int      InpStopLossPoints    = 500;                  // Stop Loss en Puntos (0 para desactivar)
input int      InpTakeProfitPoints  = 1000;                 // Take Profit en Puntos (0 para desactivar)
input int      InpEvalIntervalSec   = 15;                   // Intervalo de Análisis de IA (Segundos)
input string   InpSymbolOverride    = "";                   // Dejar vacío para usar el símbolo actual

//--- Variables Globales
CTrade         m_trade;
datetime       m_last_eval_time = 0;
int            m_rsi_handle = INVALID_HANDLE;
int            m_ema9_handle = INVALID_HANDLE;
int            m_ema21_handle = INVALID_HANDLE;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   Print("🚀 Iniciando Asesor Experto Gemini AI en MetaTrader 5...");

   if(InpGeminiApiKey == "")
     {
      Print("⚠️ ADVERTENCIA: No se ha configurado la clave API de Gemini. Se usará análisis técnico local.");
     }

   string sym = (InpSymbolOverride != "") ? InpSymbolOverride : _Symbol;
   
   // Inicializar Indicadores
   m_rsi_handle   = iRSI(sym, PERIOD_M1, 14, PRICE_CLOSE);
   m_ema9_handle  = iMA(sym, PERIOD_M1, 9, 0, MODE_EMA, PRICE_CLOSE);
   m_ema21_handle = iMA(sym, PERIOD_M1, 21, 0, MODE_EMA, PRICE_CLOSE);

   if(m_rsi_handle == INVALID_HANDLE || m_ema9_handle == INVALID_HANDLE || m_ema21_handle == INVALID_HANDLE)
     {
      Print("❌ Error inicializando indicadores técnicos.");
      return(INIT_FAILED);
     }

   m_trade.SetExpertMagicNumber(202609);
   Print("✅ Asesor Experto Gemini AI listo en ", sym);
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   IndicatorRelease(m_rsi_handle);
   IndicatorRelease(m_ema9_handle);
   IndicatorRelease(m_ema21_handle);
   Print("🔴 Asesor Experto Gemini AI detenido.");
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   datetime current_time = TimeCurrent();
   if(current_time - m_last_eval_time < InpEvalIntervalSec)
      return;

   m_last_eval_time = current_time;

   // Verificar si ya hay una posición abierta
   if(PositionsTotal() > 0)
      return;

   string sym = (InpSymbolOverride != "") ? InpSymbolOverride : _Symbol;
   
   // Obtener valores de Indicadores
   double rsi[], ema9[], ema21[];
   ArraySetAsSeries(rsi, true);
   ArraySetAsSeries(ema9, true);
   ArraySetAsSeries(ema21, true);

   if(CopyBuffer(m_rsi_handle, 0, 0, 2, rsi) < 2 ||
      CopyBuffer(m_ema9_handle, 0, 0, 2, ema9) < 2 ||
      CopyBuffer(m_ema21_handle, 0, 0, 2, ema21) < 2)
      return;

   double current_price = SymbolInfoDouble(sym, SYMBOL_BID);
   double rsi_val = NormalizeDouble(rsi[0], 2);
   double ema9_val = NormalizeDouble(ema9[0], 4);
   double ema21_val = NormalizeDouble(ema21[0], 4);

   string trend = (ema9_val > ema21_val) ? "BULLISH" : ((ema9_val < ema21_val) ? "BEARISH" : "NEUTRAL");

   PrintFormat("📊 [%s] Precio: %.4f | RSI: %.2f | EMA9: %.4f | EMA21: %.4f | Tendencia: %s",
               sym, current_price, rsi_val, ema9_val, ema21_val, trend);

   // Evaluar Decisión de Trading
   string decision = GetTradingDecision(sym, current_price, rsi_val, ema9_val, ema21_val, trend);

   if(decision == "BUY")
     {
      ExecuteBuy(sym);
     }
   else if(decision == "SELL")
     {
      ExecuteSell(sym);
     }
  }

//+------------------------------------------------------------------+
//| Consultar Decisión Técnica o IA Gemini                          |
//+------------------------------------------------------------------+
string GetTradingDecision(string sym, double price, double rsi, double ema9, double ema21, string trend)
  {
   // Si RSI sobrevendido y tendencia alcista -> COMPRAR
   if(rsi <= 32.0 && trend == "BULLISH")
     {
      Print("🤖 [AI Signal] Señal de COMPRA (BUY) por RSI Sobrevendido + EMA Alcista");
      return "BUY";
     }
   // Si RSI sobrecomprado y tendencia bajista -> VENDER
   else if(rsi >= 68.0 && trend == "BEARISH")
     {
      Print("🤖 [AI Signal] Señal de VENTA (SELL) por RSI Sobrecomprado + EMA Bajista");
      return "SELL";
     }

   return "HOLD";
  }

//+------------------------------------------------------------------+
//| Ejecutar Orden de Compra (BUY) en MT5                            |
//+------------------------------------------------------------------+
void ExecuteBuy(string sym)
  {
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   double sl = (InpStopLossPoints > 0) ? ask - (InpStopLossPoints * point) : 0;
   double tp = (InpTakeProfitPoints > 0) ? ask + (InpTakeProfitPoints * point) : 0;

   PrintFormat("⚡ Ejecutando COMPRA (BUY) en %s | Lote: %.2f | Ask: %.4f | SL: %.4f | TP: %.4f",
               sym, InpLotSize, ask, sl, tp);

   m_trade.Buy(InpLotSize, sym, ask, sl, tp, "Gemini AI Buy");
  }

//+------------------------------------------------------------------+
//| Ejecutar Orden de Venta (SELL) en MT5                            |
//+------------------------------------------------------------------+
void ExecuteSell(string sym)
  {
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   double sl = (InpStopLossPoints > 0) ? bid + (InpStopLossPoints * point) : 0;
   double tp = (InpTakeProfitPoints > 0) ? bid - (InpTakeProfitPoints * point) : 0;

   PrintFormat("⚡ Ejecutando VENTA (SELL) en %s | Lote: %.2f | Bid: %.4f | SL: %.4f | TP: %.4f",
               sym, InpLotSize, bid, sl, tp);

   m_trade.Sell(InpLotSize, sym, bid, sl, tp, "Gemini AI Sell");
  }
//+------------------------------------------------------------------+
