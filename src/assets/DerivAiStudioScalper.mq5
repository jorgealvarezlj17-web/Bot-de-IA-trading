//+------------------------------------------------------------------+
//|                                           DerivAiStudioScalper.mq5|
//|                        Deriv AI Trading Hub - Google AI Studio    |
//|                      Cuenta Demo: 41255620 | Servidor: Deriv-Demo |
//+------------------------------------------------------------------+
#property copyright "Deriv AI Trading Hub"
#property link      "https://aistudio.google.com"
#property version   "1.00"
#property strict

// Inclusion de librerias estandar de trading de MT5
#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Instancias de trading
CTrade         m_trade;
CSymbolInfo    m_symbol;
CPositionInfo  m_position;

//--- PARAMETROS DE ENTRADA CONFIGURABLES
input group "=== PARAMETROS DE OPERACION MT5 ==="
input double   InpLotSize         = 0.50;        // Tamano de Lote (Volumen)
input int      InpStopLoss        = 100;         // Stop Loss en Puntos
input int      InpTakeProfit      = 150;         // Take Profit en Puntos
input ulong    InpMagicNumber     = 41255620;    // Magic Number (ID de Ordenes)
input int      InpMaxPositions    = 1;           // Maximo de posiciones abiertas simultaneas

input group "=== PARAMETROS DE ESTRATEGIA SCALPING ==="
input int      InpRsiPeriod       = 7;           // Periodo RSI (Scalping rapido)
input double   InpRsiOverSold     = 30.0;        // Nivel de Sobreventa (Senal BUY)
input double   InpRsiOverBought   = 70.0;        // Nivel de Sobrecompra (Senal SELL)
input int      InpFastEma         = 9;           // EMA Rapida
input int      InpSlowEma         = 21;          // EMA Lenta

//--- Handles para indicadores tecnicos
int handle_rsi = INVALID_HANDLE;
int handle_ema_fast = INVALID_HANDLE;
int handle_ema_slow = INVALID_HANDLE;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   // Configurar el objeto de trading
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(20);
   m_trade.SetTypeFilling(ORDER_FILLING_IOC);

   // Inicializar simbolo actual (ej: Volatility 100 Index)
   if(!m_symbol.Name(_Symbol))
   {
      Print("Error inicializando simbolo: ", _Symbol);
      return(INIT_FAILED);
   }

   // Crear indicador RSI
   handle_rsi = iRSI(_Symbol, _Period, InpRsiPeriod, PRICE_CLOSE);
   if(handle_rsi == INVALID_HANDLE)
   {
      Print("Fallo al crear handle de RSI");
      return(INIT_FAILED);
   }

   // Crear indicador EMA Rapida
   handle_ema_fast = iMA(_Symbol, _Period, InpFastEma, 0, MODE_EMA, PRICE_CLOSE);
   if(handle_ema_fast == INVALID_HANDLE)
   {
      Print("Fallo al crear handle de EMA Rapida");
      return(INIT_FAILED);
   }

   // Crear indicador EMA Lenta
   handle_ema_slow = iMA(_Symbol, _Period, InpSlowEma, 0, MODE_EMA, PRICE_CLOSE);
   if(handle_ema_slow == INVALID_HANDLE)
   {
      Print("Fallo al crear handle de EMA Lenta");
      return(INIT_FAILED);
   }

   Print("=================================================");
   Print("🚀 Deriv AI Studio Scalper EA Iniciado con exito!");
   Print("Cuenta: ", AccountInfoInteger(ACCOUNT_LOGIN), " | Broker: Deriv.com Limited");
   Print("Simbolo: ", _Symbol, " | Lote: ", InpLotSize);
   Print("=================================================");

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(handle_rsi != INVALID_HANDLE) IndicatorRelease(handle_rsi);
   if(handle_ema_fast != INVALID_HANDLE) IndicatorRelease(handle_ema_fast);
   if(handle_ema_slow != INVALID_HANDLE) IndicatorRelease(handle_ema_slow);
   Print("Scalper EA detenido.");
}

//+------------------------------------------------------------------+
//| Expert tick function (Se ejecuta en CADA TICK de Deriv)          |
//+------------------------------------------------------------------+
void OnTick()
{
   // Actualizar precios Ask y Bid
   if(!m_symbol.RefreshRates()) return;

   // Contar posiciones abiertas con nuestro MagicNumber
   int total_open = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
         {
            total_open++;
         }
      }
   }

   // Si ya tenemos el maximo de posiciones abiertas, no abrir mas
   if(total_open >= InpMaxPositions) return;

   // Leer valores del RSI
   double rsi_buffer[2];
   if(CopyBuffer(handle_rsi, 0, 0, 2, rsi_buffer) <= 0) return;
   double current_rsi = rsi_buffer[0];

   // Leer valores de EMAs
   double ema_fast_buf[2], ema_slow_buf[2];
   if(CopyBuffer(handle_ema_fast, 0, 0, 2, ema_fast_buf) <= 0) return;
   if(CopyBuffer(handle_ema_slow, 0, 0, 2, ema_slow_buf) <= 0) return;

   double fast_ema = ema_fast_buf[0];
   double slow_ema = ema_slow_buf[0];

   // Precios actuales de mercado
   double ask = m_symbol.Ask();
   double bid = m_symbol.Bid();
   double point = m_symbol.Point();

   // ================================================================
   // LOGICA DE SCALPING:
   // CONDICION 1: SENAL DE COMPRA (BUY)
   // - RSI por debajo de 30 (sobrevendido)
   // - EMA Rapida cruza por encima de EMA Lenta o precio > EMA rapida
   // ================================================================
   if(current_rsi <= InpRsiOverSold && fast_ema >= slow_ema)
   {
      double sl = ask - (InpStopLoss * point);
      double tp = ask + (InpTakeProfit * point);

      Print("⚡ Senal BUY detectada! RSI: ", DoubleToString(current_rsi, 2), " | Abriendo orden en MT5...");
      if(m_trade.Buy(InpLotSize, _Symbol, ask, sl, tp, "Deriv AI Scalper BUY"))
      {
         Print("🎉 Orden BUY ejecutada exitosamente! Ticket: ", m_trade.ResultOrder());
         SendNotification("🚀 Deriv MT5: Compra BUY abierta en " + _Symbol + " Lote: " + DoubleToString(InpLotSize, 2));
      }
      else
      {
         Print("Error ejecutando BUY: ", m_trade.ResultRetcodeDescription());
      }
   }

   // ================================================================
   // CONDICION 2: SENAL DE VENTA (SELL)
   // - RSI por encima de 70 (sobrecomprado)
   // - EMA Rapida cruza por debajo de EMA Lenta o precio < EMA rapida
   // ================================================================
   else if(current_rsi >= InpRsiOverBought && fast_ema <= slow_ema)
   {
      double sl = bid + (InpStopLoss * point);
      double tp = bid - (InpTakeProfit * point);

      Print("⚡ Senal SELL detectada! RSI: ", DoubleToString(current_rsi, 2), " | Abriendo orden en MT5...");
      if(m_trade.Sell(InpLotSize, _Symbol, bid, sl, tp, "Deriv AI Scalper SELL"))
      {
         Print("🎉 Orden SELL ejecutada exitosamente! Ticket: ", m_trade.ResultOrder());
         SendNotification("🚀 Deriv MT5: Venta SELL abierta en " + _Symbol + " Lote: " + DoubleToString(InpLotSize, 2));
      }
      else
      {
         Print("Error ejecutando SELL: ", m_trade.ResultRetcodeDescription());
      }
   }
}
//+------------------------------------------------------------------+
