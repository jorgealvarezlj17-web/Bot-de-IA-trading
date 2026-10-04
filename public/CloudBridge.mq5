//+------------------------------------------------------------------+
//|                                                  CloudBridge.mq5 |
//|                                  Deriv AI Cloud Trading Bridge   |
//|               Permite control 100% remoto desde la nube por IA  |
//|               MULTI-MERCADO TOTAL: Opera cualquier activo       |
//|               desde UN SOLO gráfico sin abrir ventanas extras   |
//+------------------------------------------------------------------+
#property copyright "Deriv AI Cloud Trading"
#property link      "https://deriv.com"
#property version   "2.00"
#property description "Conector Nube Universal Multi-Mercado para MT5"

#include <Trade\Trade.mqh>

input string InpServerUrl     = "https://ais-dev-ff3xr5jx4i3ceshuteyfii-108145579037.us-east5.run.app/api/mt5/poll"; // URL de Señales Nube
input string InpReportUrl     = "https://ais-dev-ff3xr5jx4i3ceshuteyfii-108145579037.us-east5.run.app/api/mt5/report"; // URL de Reporte Nube
input string InpDeviceId      = "winlator-mali-1"; // ID del dispositivo
input int    InpPollFrequency = 1000; // Frecuencia de consulta (milisegundos)
input ulong  InpMagicNumber   = 888999; // Magic Number
input ulong  InpSlippage      = 30; // Slippage en puntos

CTrade trade;
datetime lastPollTime = 0;
string executedOrders[];

// Configura dinámicamente el modo de ejecución para el símbolo
void ConfigureTradeFilling(string symbol)
{
   uint filling = (uint)SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK) != 0)
      trade.SetTypeFilling(ORDER_FILLING_FOK);
   else if((filling & SYMBOL_FILLING_IOC) != 0)
      trade.SetTypeFilling(ORDER_FILLING_IOC);
   else
      trade.SetTypeFilling(ORDER_FILLING_RETURN);
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpSlippage);
   
   EventSetMillisecondTimer(InpPollFrequency);
   
   Print("🚀 CloudBridge Multi-Mercado Universal Iniciado");
   Print("🛰️ Conectando con Nube: ", InpServerUrl);
   
   Comment(StringFormat("🟢 DERIV MULTI-MERCADO CLOUD BRIDGE\nDispositivo: %s\nModo: Opera 100%% de activos desde esta sola ventana\nEsperando órdenes...", InpDeviceId));
   
   // Primer pulso inmediato
   PollCloudCommands();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert tick function (Garantiza ejecución incluso sin timer)     |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeCurrent();
   if(now - lastPollTime >= 1)
   {
      lastPollTime = now;
      PollCloudCommands();
   }
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

//+------------------------------------------------------------------+
//| Verifica si la orden ya fue ejecutada                            |
//+------------------------------------------------------------------+
bool IsAlreadyExecuted(string commandId)
{
   for(int i = 0; i < ArraySize(executedOrders); i++)
   {
      if(executedOrders[i] == commandId) return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Registra orden como ejecutada                                    |
//+------------------------------------------------------------------+
void MarkAsExecuted(string commandId)
{
   int size = ArraySize(executedOrders);
   ArrayResize(executedOrders, size + 1);
   executedOrders[size] = commandId;
}

//+------------------------------------------------------------------+
//| Envía reporte de ejecución a la nube                             |
//+------------------------------------------------------------------+
void ReportToCloud(string commandId, string symbol, string action, double volume, ulong ticket, string status, string errorMsg)
{
   char postData[];
   char resultData[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";
   
   string json = StringFormat(
      "{\"deviceId\":\"%s\",\"commandId\":\"%s\",\"symbol\":\"%s\",\"action\":\"%s\",\"volume\":%.2f,\"ticket\":%I64u,\"status\":\"%s\",\"error\":\"%s\",\"balance\":%.2f,\"equity\":%.2f}",
      InpDeviceId, commandId, symbol, action, volume, ticket, status, errorMsg, AccountInfoDouble(ACCOUNT_BALANCE), AccountInfoDouble(ACCOUNT_EQUITY)
   );
   
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1); // Quitar null terminator
   
   ResetLastError();
   WebRequest("POST", InpReportUrl, headers, 3000, postData, resultData, resultHeaders);
}

//+------------------------------------------------------------------+
//| Extrae un valor string de un JSON plano                          |
//+------------------------------------------------------------------+
string JsonGetString(string json, string key)
{
   string needle = "\"" + key + "\":\"";
   int pos = StringFind(json, needle);
   if(pos < 0) return "";
   
   pos += StringLen(needle);
   int endPos = StringFind(json, "\"", pos);
   if(endPos < 0) return "";
   
   return StringSubstr(json, pos, endPos - pos);
}

//+------------------------------------------------------------------+
//| Extrae un valor numérico de un JSON plano                        |
//+------------------------------------------------------------------+
double JsonGetDouble(string json, string key)
{
   string needle = "\"" + key + "\":";
   int pos = StringFind(json, needle);
   if(pos < 0) return 0;
   
   pos += StringLen(needle);
   int endPos1 = StringFind(json, ",", pos);
   int endPos2 = StringFind(json, "}", pos);
   
   int endPos = endPos1;
   if(endPos < 0 || (endPos2 >= 0 && endPos2 < endPos)) endPos = endPos2;
   if(endPos < 0) endPos = StringLen(json);
   
   string val = StringSubstr(json, pos, endPos - pos);
   StringTrimLeft(val);
   StringTrimRight(val);
   return StringToDouble(val);
}

//+------------------------------------------------------------------+
//| Normaliza el nombre del símbolo (soporta variaciones de Deriv)  |
//+------------------------------------------------------------------+
string ResolveDerivSymbol(string rawSymbol)
{
   if(rawSymbol == "") return _Symbol;
   
   // Si el símbolo existe tal cual, usarlo
   if(SymbolSelect(rawSymbol, true)) return rawSymbol;
   
   // Variaciones comunes de nombres en Deriv MT5
   if(rawSymbol == "Volatility 100 Index" || rawSymbol == "R_100")
   {
      if(SymbolSelect("Volatility 100 Index", true)) return "Volatility 100 Index";
      if(SymbolSelect("Volatility 100 (1s) Index", true)) return "Volatility 100 (1s) Index";
      if(SymbolSelect("1HZ100V", true)) return "1HZ100V";
      if(SymbolSelect("R_100", true)) return "R_100";
   }
   
   if(rawSymbol == "Volatility 10 Index" || rawSymbol == "R_10")
   {
      if(SymbolSelect("Volatility 10 Index", true)) return "Volatility 10 Index";
      if(SymbolSelect("Volatility 10 (1s) Index", true)) return "Volatility 10 (1s) Index";
      if(SymbolSelect("1HZ10V", true)) return "1HZ10V";
      if(SymbolSelect("R_10", true)) return "R_10";
   }

   if(rawSymbol == "Volatility 75 Index" || rawSymbol == "R_75")
   {
      if(SymbolSelect("Volatility 75 Index", true)) return "Volatility 75 Index";
      if(SymbolSelect("Volatility 75 (1s) Index", true)) return "Volatility 75 (1s) Index";
      if(SymbolSelect("1HZ75V", true)) return "1HZ75V";
   }

   if(rawSymbol == "Volatility 50 Index" || rawSymbol == "R_50")
   {
      if(SymbolSelect("Volatility 50 Index", true)) return "Volatility 50 Index";
      if(SymbolSelect("Volatility 50 (1s) Index", true)) return "Volatility 50 (1s) Index";
   }

   if(rawSymbol == "Volatility 25 Index" || rawSymbol == "R_25")
   {
      if(SymbolSelect("Volatility 25 Index", true)) return "Volatility 25 Index";
      if(SymbolSelect("Volatility 25 (1s) Index", true)) return "Volatility 25 (1s) Index";
   }
   
   // Si no encuentra coincidencia, activar el raw y retornarlo
   SymbolSelect(rawSymbol, true);
   return rawSymbol;
}

//+------------------------------------------------------------------+
//| Procesa y ejecuta una orden recibida                             |
//+------------------------------------------------------------------+
void ExecuteCommand(string jsonCommand)
{
   string commandId = JsonGetString(jsonCommand, "id");
   string action    = JsonGetString(jsonCommand, "action"); // BUY, SELL, CLOSE_ALL
   string rawSymbol = JsonGetString(jsonCommand, "symbol");
   double volume    = JsonGetDouble(jsonCommand, "volume");
   double sl        = JsonGetDouble(jsonCommand, "sl");
   double tp        = JsonGetDouble(jsonCommand, "tp");
   
   if(commandId == "" || IsAlreadyExecuted(commandId)) return;
   
   string symbol = ResolveDerivSymbol(rawSymbol);
   
   Print("⚡ ORDEN MULTI-MERCADO RECIBIDA: ", action, " sobre [", symbol, "] Lote:", volume, " ID:", commandId);
   
   // Habilitar símbolo en Market Watch
   SymbolSelect(symbol, true);
   ConfigureTradeFilling(symbol);
   
   bool success = false;
   ulong ticket = 0;
   string errMsg = "";
   
   if(action == "BUY")
   {
      double minVol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      if(minVol > 0 && volume < minVol) volume = minVol;
      
      double price = SymbolInfoDouble(symbol, SYMBOL_ASK);
      if(price <= 0)
      {
         MqlTick lastTick;
         if(SymbolInfoTick(symbol, lastTick)) price = lastTick.ask;
      }
      
      success = trade.Buy(volume, symbol, price, sl, tp, "CloudAI_" + commandId);
      if(success) ticket = trade.ResultOrder();
      else errMsg = StringFormat("Error %d: %s", GetLastError(), trade.ResultComment());
   }
   else if(action == "SELL")
   {
      double minVol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      if(minVol > 0 && volume < minVol) volume = minVol;
      
      double price = SymbolInfoDouble(symbol, SYMBOL_BID);
      if(price <= 0)
      {
         MqlTick lastTick;
         if(SymbolInfoTick(symbol, lastTick)) price = lastTick.bid;
      }
      
      success = trade.Sell(volume, symbol, price, sl, tp, "CloudAI_" + commandId);
      if(success) ticket = trade.ResultOrder();
      else errMsg = StringFormat("Error %d: %s", GetLastError(), trade.ResultComment());
   }
   else if(action == "CLOSE_ALL")
   {
      int total = PositionsTotal();
      for(int i = total - 1; i >= 0; i--)
      {
         ulong posTicket = PositionGetTicket(i);
         if(posTicket > 0)
         {
            trade.PositionClose(posTicket);
         }
      }
      success = true;
      ticket = 999999;
   }
   
   MarkAsExecuted(commandId);
   
   if(success)
   {
      Print("✅ EJECUTADA EN MT5: ", symbol, " Ticket: ", ticket);
      ReportToCloud(commandId, symbol, action, volume, ticket, "FILLED", "");
   }
   else
   {
      Print("❌ ERROR EN MT5 (", symbol, "): ", errMsg);
      ReportToCloud(commandId, symbol, action, volume, 0, "FAILED", errMsg);
   }
}

//+------------------------------------------------------------------+
//| Consulta comandos pendientes en la nube vía WebRequest          |
//+------------------------------------------------------------------+
void PollCloudCommands()
{
   char postData[];
   char resultData[];
   string resultHeaders;
   string url = StringFormat("%s?deviceId=%s&balance=%.2f&equity=%.2f&account=%I64d",
      InpServerUrl,
      InpDeviceId,
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      AccountInfoInteger(ACCOUNT_LOGIN)
   );
   
   ResetLastError();
   int res = WebRequest("GET", url, NULL, 2000, postData, resultData, resultHeaders);
   
   if(res == 200)
   {
      string response = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      if(StringFind(response, "\"commands\":[") >= 0)
      {
         int start = StringFind(response, "\"commands\":[");
         start += 12;
         int end = StringFind(response, "]", start);
         if(end > start)
         {
            string list = StringSubstr(response, start, end - start);
            int itemStart = 0;
            while(true)
            {
               int oBrace = StringFind(list, "{", itemStart);
               if(oBrace < 0) break;
               int cBrace = StringFind(list, "}", oBrace);
               if(cBrace < 0) break;
               
               string item = StringSubstr(list, oBrace, cBrace - oBrace + 1);
               ExecuteCommand(item);
               itemStart = cBrace + 1;
            }
         }
      }
      
      Comment(StringFormat("🟢 DERIV MULTI-MERCADO CLOUD BRIDGE\nDispositivo: %s\nBalance: $%.2f | Equidad: $%.2f\nModo: Multi-Activo Activo (Opera CUALQUIER índice)\nÚltimo pulso: OK",
         InpDeviceId,
         AccountInfoDouble(ACCOUNT_BALANCE),
         AccountInfoDouble(ACCOUNT_EQUITY)
      ));
   }
   else
   {
      int err = GetLastError();
      if(err == 4014)
      {
         Comment("⚠️ WebRequest no permitido.\nPermite WebRequest en Opciones > Asesores Expertos");
      }
      else
      {
         Comment(StringFormat("🔄 Conectando a la nube... (Código: %d, Error: %d)", res, err));
      }
   }
}

//+------------------------------------------------------------------+
//| Timer event handler                                              |
//+------------------------------------------------------------------+
void OnTimer()
{
   PollCloudCommands();
}
//+------------------------------------------------------------------+
