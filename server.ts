import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Initialize Gemini Server SDK with proper User-Agent header
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * 1. Evaluate Market Action via Gemini AI Studio Server Engine
 */
app.post('/api/gemini/evaluate-market', async (req, res) => {
  try {
    const {
      symbol = 'R_100',
      price = 10245.50,
      rsi = 28.5,
      ema9 = 10246.10,
      ema21 = 10242.30,
      trend = 'BULLISH',
      priceChange5t = 1.2,
      volatility = 0.45,
      ticks = [10240, 10241, 10242, 10243, 10244, 10245.5],
      balance = 1000,
      stake = 1.0,
      systemInstruction,
    } = req.body;

    const ai = getGeminiClient();

    const customSystemInstruction = systemInstruction || `
Eres un Trader Scalper experto de Alta Frecuencia analizando Índices Sintéticos de Deriv (como Volatility 100 Index).
Tu objetivo es identificar momentos de alta probabilidad para operaciones rápidas (5 ticks).
Analiza los precios recientes, RSI, diferencia de Medias Móviles (EMA 9 y EMA 21) y volatilidad.
Debes tomar decisiones estrictas de gestión de riesgo:
- Si RSI < 30 y EMA9 > EMA21 o hay cambio de tendencia alcista -> RECOMIENDA 'BUY_CALL'
- Si RSI > 70 y EMA9 < EMA21 o hay cambio de tendencia bajista -> RECOMIENDA 'BUY_PUT'
- Si el mercado no tiene dirección clara o la volatilidad es errática -> RECOMIENDA 'HOLD'
- Si la pérdida acumulada supera el límite -> RECOMIENDA 'PAUSE'
Responde usando exclusivamente la llamada a función 'execute_trading_decision'.
`;

    const functionDeclaration = {
      name: 'execute_trading_decision',
      description: 'Envía una decisión estructurada de trading para ejecutar en Deriv.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            description: 'Acción: BUY_CALL (Subida), BUY_PUT (Bajada), HOLD (Esperar), PAUSE (Pausar bot).',
          },
          reasoning: {
            type: Type.STRING,
            description: 'Explicación técnica detallada de la entrada.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Nivel de confianza de 0.0 a 1.0.',
          },
          suggested_stake: {
            type: Type.NUMBER,
            description: 'Monto sugerido para la operación en USD.',
          },
          suggested_duration_ticks: {
            type: Type.INTEGER,
            description: 'Duración recomendada en ticks (ej. 5 ticks).',
          },
        },
        required: ['action', 'reasoning', 'confidence'],
      },
    };

    const promptText = `
ANÁLISIS TÉCNICO EN TIEMPO REAL - SÍMBOLO: ${symbol}
--------------------------------------------------
Precio Actual: ${price}
RSI (14): ${rsi}
EMA 9: ${ema9}
EMA 21: ${ema21}
Tendencia EMA: ${trend}
Cambio 5 Ticks: ${priceChange5t}
Volatilidad (StdDev): ${volatility}

Historial de Ticks Recientes: ${JSON.stringify(ticks)}

Estado de Cuenta:
- Balance Actual: ${balance} USD
- Stake Configurado: ${stake} USD

Analiza el mercado usando tus System Instructions y devuelve la llamada a función 'execute_trading_decision'.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: promptText,
      config: {
        systemInstruction: customSystemInstruction,
        tools: [{ functionDeclarations: [functionDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY' as any,
            allowedFunctionNames: ['execute_trading_decision'],
          },
        },
      },
    });

    const functionCalls = response.functionCalls;
    let decision = null;

    if (functionCalls && functionCalls.length > 0) {
      decision = functionCalls[0].args;
    } else {
      // Fallback response if model didn't trigger function call
      decision = {
        action: 'HOLD',
        reasoning: 'El modelo no emitió llamada estructurada directiva.',
        confidence: 0.5,
        suggested_stake: stake,
        suggested_duration_ticks: 5,
      };
    }

    res.json({
      success: true,
      decision,
      rawText: response.text,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error evaluating market action:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error interno al evaluar mercado con Gemini API',
    });
  }
});

/**
 * 2. Test Deriv WebSocket Token Connection
 */
app.post('/api/deriv/test-connection', (req, res) => {
  const { token, appId = '1089' } = req.body;

  if (!token) {
    res.status(400).json({ success: false, error: 'Deriv API Token es requerido' });
    return;
  }

  const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
  const ws = new WebSocket(wsUrl);

  let responded = false;

  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      ws.close();
      res.status(504).json({ success: false, error: 'Tiempo de espera agotado al conectar con Deriv' });
    }
  }, 10000);

  ws.on('open', () => {
    // Send authorize request
    ws.send(JSON.stringify({ authorize: token }));
  });

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.msg_type === 'authorize') {
        if (parsed.error) {
          if (!responded) {
            responded = true;
            clearTimeout(timeout);
            ws.close();
            res.json({ success: false, error: parsed.error.message || 'Token inválido' });
          }
        } else {
          const auth = parsed.authorize;
          if (!responded) {
            responded = true;
            clearTimeout(timeout);
            ws.close();
            res.json({
              success: true,
              account: {
                loginid: auth.loginid,
                email: auth.email,
                balance: auth.balance,
                currency: auth.currency,
                is_virtual: auth.is_virtual === 1,
              },
            });
          }
        }
      }
    } catch (e: any) {
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        ws.close();
        res.status(500).json({ success: false, error: 'Error parseando respuesta de Deriv' });
      }
    }
  });

  ws.on('error', (err) => {
    if (!responded) {
      responded = true;
      clearTimeout(timeout);
      res.status(500).json({ success: false, error: `WebSocket Error: ${err.message}` });
    }
  });
});

/**
 * 3. Fetch Real-time Tick Snapshot from Deriv
 */
app.post('/api/deriv/fetch-ticks', (req, res) => {
  const { symbol = 'R_100', count = 20, appId = '1089' } = req.body;

  const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
  const ws = new WebSocket(wsUrl);

  let responded = false;

  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      ws.close();
      res.status(504).json({ success: false, error: 'Tiempo de espera agotado solicitando Ticks' });
    }
  }, 8000);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: count,
      end: 'latest',
      start: 1,
      style: 'ticks'
    }));
  });

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.msg_type === 'history') {
        if (!responded) {
          responded = true;
          clearTimeout(timeout);
          ws.close();
          const history = parsed.history;
          const prices = history?.prices || [];
          const times = history?.times || [];
          res.json({
            success: true,
            symbol,
            prices,
            times,
            latestPrice: prices.length > 0 ? prices[prices.length - 1] : null,
          });
        }
      } else if (parsed.error) {
        if (!responded) {
          responded = true;
          clearTimeout(timeout);
          ws.close();
          res.json({ success: false, error: parsed.error.message });
        }
      }
    } catch (e: any) {
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        ws.close();
        res.status(500).json({ success: false, error: 'Error obteniendo historial de ticks' });
      }
    }
  });

  ws.on('error', (err) => {
    if (!responded) {
      responded = true;
      clearTimeout(timeout);
      res.status(500).json({ success: false, error: err.message });
    }
  });
});

// =============================================================================
// VITE DEV SERVER MIDDLEWARE & STATIC SERVING
// =============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await vite.transformIndexHtml(
          url,
          `<!doctype html>
<html lang="es" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Deriv AI Trading Hub</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Deriv AI Trading Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
