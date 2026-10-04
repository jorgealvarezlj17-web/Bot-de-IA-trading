import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import https from 'https';
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

// Official Deriv Endpoints list
const DERIV_WS_ENDPOINTS = [
  'wss://api.derivws.com/trading/v1/options/ws/public',
  'wss://ws.derivws.com/websockets/v3',
  'wss://ws.binaryws.com/websockets/v3',
];

/**
 * 2. Test Deriv WebSocket Token Connection
 */
app.post('/api/deriv/ping', (req, res) => {
  const start = Date.now();
  let responded = false;
  let tried = 0;

  const tryEndpoint = (url: string) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { handshakeTimeout: 2500 });
    } catch (e: any) {
      next();
      return;
    }

    const t = setTimeout(() => {
      try { ws.close(); } catch (err) {}
      next();
    }, 3000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ ping: 1 }));
    });

    ws.on('message', (data: WebSocket.Data) => {
      if (!responded) {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.ping === 'pong') {
            responded = true;
            clearTimeout(t);
            try { ws.close(); } catch (err) {}
            const latency = Date.now() - start;
            return res.json({ success: true, ping: 'pong', latencyMs: latency, endpoint: url });
          }
        } catch (e: any) {}
      }
    });

    ws.on('error', () => {
      clearTimeout(t);
      next();
    });
  };

  const next = () => {
    if (responded) return;
    if (tried < DERIV_WS_ENDPOINTS.length) {
      const u = DERIV_WS_ENDPOINTS[tried];
      tried++;
      tryEndpoint(u);
    } else {
      if (!responded) {
        responded = true;
        res.status(504).json({ success: false, error: 'Servidores de Deriv no respondieron al ping' });
      }
    }
  };

  next();
});

/**
 * 2.1 Test Deriv WebSocket Token Connection & PAT support
 */
app.post('/api/deriv/test-connection', async (req, res) => {
  const { token, appId = '1089' } = req.body;

  if (!token) {
    res.status(400).json({ success: false, error: 'Deriv API Token es requerido' });
    return;
  }

  const cleanToken = token.trim();
  const cleanAppId = appId ? String(appId).trim() : '1089';

  // Si el token es un PAT moderno (pat_...) usar la API REST de Deriv para cuentas y OTP
  if (cleanToken.startsWith('pat_')) {
    try {
      const response = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Deriv-App-ID': cleanAppId
        }
      });

      if (response.ok) {
        const json: any = await response.json();
        const accounts = json.data || [];
        // Seleccionar cuenta activa (demo o real)
        const demoAcc = accounts.find((a: any) => a.account_type === 'demo') || accounts[0];
        if (demoAcc) {
          return res.json({
            success: true,
            account: {
              loginid: demoAcc.account_id,
              email: 'Cuenta Deriv PAT',
              balance: parseFloat(demoAcc.balance || '0'),
              currency: demoAcc.currency || 'USD',
              is_virtual: demoAcc.account_type === 'demo',
            },
            accounts: accounts.map((a: any) => ({
              loginid: a.account_id,
              balance: parseFloat(a.balance || '0'),
              currency: a.currency,
              is_virtual: a.account_type === 'demo',
              status: a.status
            }))
          });
        }
      } else {
        const errText = await response.text();
        return res.json({ success: false, error: `Deriv API error (${response.status}): ${errText}` });
      }
    } catch (patErr: any) {
      // Continuar al WebSocket legacy por si acaso
    }
  }

  const endpoints = [
    `wss://ws.derivws.com/websockets/v3?app_id=${cleanAppId}`,
    `wss://ws.binaryws.com/websockets/v3?app_id=${cleanAppId}`,
    `wss://frontend.binaryws.com/websockets/v3?app_id=${cleanAppId}`
  ];

  let responded = false;
  let idx = 0;

  const tryConnect = (wsUrl: string) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl, { handshakeTimeout: 3500 });
    } catch (e) {
      tryNext();
      return;
    }

    const timeout = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      tryNext();
    }, 4000);

    ws.on('open', () => {
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
              try { ws.close(); } catch (e) {}
              res.json({ success: false, error: parsed.error.message || 'Token inválido' });
            }
          } else {
            const auth = parsed.authorize;
            if (!responded) {
              responded = true;
              clearTimeout(timeout);
              try { ws.close(); } catch (e) {}
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
      } catch (e: any) {}
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      tryNext();
    });
  };

  const tryNext = () => {
    if (responded) return;
    if (idx < endpoints.length) {
      const target = endpoints[idx];
      idx++;
      tryConnect(target);
    } else {
      if (!responded) {
        responded = true;
        res.status(504).json({ success: false, error: 'Tiempo de espera agotado al conectar con Deriv' });
      }
    }
  };

  tryNext();
});

/**
 * 3. Fetch Real-time Tick Snapshot from Deriv
 */
app.post('/api/deriv/fetch-ticks', (req, res) => {
  const { symbol = 'R_100', count = 20, appId = '1089' } = req.body;

  const endpoints = [
    `wss://api.derivws.com/trading/v1/options/ws/public`,
    `wss://ws.derivws.com/websockets/v3?app_id=${appId}`
  ];

  let responded = false;
  let idx = 0;

  const tryFetch = (url: string) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { handshakeTimeout: 3500 });
    } catch (e) {
      next();
      return;
    }

    const timeout = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      next();
    }, 4500);

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
            try { ws.close(); } catch (e) {}
            const history = parsed.history;
            const prices = history?.prices || [];
            const times = history?.times || [];
            return res.json({
              success: true,
              symbol,
              prices,
              times,
              latestPrice: prices.length > 0 ? prices[prices.length - 1] : null,
            });
          }
        }
      } catch (e: any) {}
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      next();
    });
  };

  const next = () => {
    if (responded) return;
    if (idx < endpoints.length) {
      const u = endpoints[idx];
      idx++;
      tryFetch(u);
    } else {
      if (!responded) {
        responded = true;
        res.status(504).json({ success: false, error: 'Tiempo de espera agotado solicitando Ticks' });
      }
    }
  };

  next();
});

/**
 * 4. Execute Instant Direct Trade on Deriv
 */
app.post('/api/deriv/execute-trade', async (req, res) => {
  const {
    token,
    symbol = 'R_100',
    contractType = 'CALL',
    amount = 1.0,
    durationTicks = 5,
    appId = '1089',
    accountId,
    accountType = 'demo'
  } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Token de API requerido' });
  }

  const cleanToken = token.trim();
  const cleanAppId = appId ? String(appId).trim() : '1089';

  // Si es token PAT, obtener URL autenticada por OTP para operar en el endpoint dedicado
  if (cleanToken.startsWith('pat_')) {
    try {
      let targetAccountId = accountId;
      if (!targetAccountId) {
        const accRes = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Deriv-App-ID': cleanAppId
          }
        });
        if (accRes.ok) {
          const accJson: any = await accRes.json();
          const targetAcc = (accJson.data || []).find((a: any) => a.account_type === accountType) || accJson.data?.[0];
          targetAccountId = targetAcc?.account_id;
        }
      }

      if (targetAccountId) {
        // Obtener OTP usando https nativo de Node para garantizar compatibilidad con Cloud Run
        const wsUrl: string = await new Promise((resolve, reject) => {
          const otpReq = https.request({
            hostname: 'api.derivws.com',
            path: `/trading/v1/options/accounts/${targetAccountId}/otp`,
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cleanToken}`,
              'Deriv-App-ID': cleanAppId,
              'Content-Length': 0
            }
          }, (otpRes) => {
            let data = '';
            otpRes.on('data', chunk => data += chunk);
            otpRes.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.data && parsed.data.url) {
                  resolve(parsed.data.url);
                } else {
                  reject(new Error(data));
                }
              } catch (e) {
                reject(new Error(data));
              }
            });
          });
          otpReq.on('error', reject);
          otpReq.end();
        });

        if (wsUrl) {
          const ws = new WebSocket(wsUrl);
          let done = false;
          const timeout = setTimeout(() => {
            if (!done) {
              done = true;
              try { ws.close(); } catch (e) {}
              res.status(504).json({ success: false, error: 'Timeout en ejecución de orden vía PAT OTP' });
            }
          }, 7000);

          ws.on('open', () => {
            ws.send(JSON.stringify({
              buy: 1,
              price: 100.0,
              parameters: {
                amount: parseFloat(amount),
                basis: 'stake',
                contract_type: contractType,
                currency: 'USD',
                duration: parseInt(durationTicks, 10),
                duration_unit: 't',
                underlying_symbol: symbol
              }
            }));
          });

          ws.on('message', (data: WebSocket.Data) => {
            try {
              const parsed = JSON.parse(data.toString());
              if (parsed.msg_type === 'buy' && parsed.buy) {
                if (!done) {
                  done = true;
                  clearTimeout(timeout);
                  try { ws.close(); } catch (e) {}
                  return res.json({
                    success: true,
                    contract_id: parsed.buy.contract_id,
                    buy_price: parsed.buy.buy_price,
                    balance_after: parsed.buy.balance_after,
                    purchase_time: parsed.buy.purchase_time,
                    shortcode: parsed.buy.shortcode,
                    symbol,
                    contractType
                  });
                }
              } else if (parsed.error) {
                if (!done) {
                  done = true;
                  clearTimeout(timeout);
                  try { ws.close(); } catch (e) {}
                  return res.json({ success: false, error: parsed.error.message || JSON.stringify(parsed.error) });
                }
              }
            } catch (e) {}
          });

          ws.on('error', (err) => {
            if (!done) {
              done = true;
              clearTimeout(timeout);
              res.json({ success: false, error: `Error en WebSocket PAT: ${err.message}` });
            }
          });
          return;
        }
      }
    } catch (patOrderErr: any) {
      return res.json({ success: false, error: `Error conectando con Deriv PAT: ${patOrderErr.message}` });
    }
  }

  const endpoints = [
    `wss://api.derivws.com/trading/v1/options/ws/public`,
    `wss://ws.derivws.com/websockets/v3?app_id=${cleanAppId}`
  ];

  let responded = false;
  let idx = 0;

  const tryTrade = (url: string) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { handshakeTimeout: 4000 });
    } catch (e) {
      next();
      return;
    }

    const timeout = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      next();
    }, 6000);

    ws.on('open', () => {
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
              try { ws.close(); } catch (e) {}
              return res.json({ success: false, error: parsed.error.message || 'Error de autorización' });
            }
          } else {
            ws.send(JSON.stringify({
              buy: 1,
              price: 100.0,
              parameters: {
                amount: parseFloat(amount),
                basis: 'stake',
                contract_type: contractType,
                currency: parsed.authorize.currency || 'USD',
                duration: parseInt(durationTicks, 10),
                duration_unit: 't',
                symbol: symbol
              }
            }));
          }
        } else if (parsed.msg_type === 'buy') {
          if (!responded) {
            responded = true;
            clearTimeout(timeout);
            try { ws.close(); } catch (e) {}
            const buyData = parsed.buy;
            return res.json({
              success: true,
              contract_id: buyData.contract_id,
              buy_price: buyData.buy_price,
              balance_after: buyData.balance_after,
              purchase_time: buyData.purchase_time,
              shortcode: buyData.shortcode,
              symbol,
              contractType
            });
          }
        } else if (parsed.error) {
          if (!responded) {
            responded = true;
            clearTimeout(timeout);
            try { ws.close(); } catch (e) {}
            return res.json({ success: false, error: parsed.error.message || 'Error ejecutando la orden' });
          }
        }
      } catch (e: any) {}
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      next();
    });
  };

  const next = () => {
    if (responded) return;
    if (idx < endpoints.length) {
      const u = endpoints[idx];
      idx++;
      tryTrade(u);
    } else {
      if (!responded) {
        responded = true;
        res.status(504).json({ success: false, error: 'Tiempo de espera agotado al conectar con Deriv' });
      }
    }
  };

  next();
});

// Endpoint para consultar operaciones abiertas y cerradas directamente de Deriv
app.post('/api/deriv/positions', async (req, res) => {
  const { token, appId, accountType = 'demo' } = req.body;
  const cleanToken = token || process.env.DERIV_API_TOKEN || '';
  const cleanAppId = appId || process.env.DERIV_APP_ID || '1089';

  if (!cleanToken) {
    return res.status(400).json({ success: false, error: 'Token requerido' });
  }

  try {
    let targetAccountId = '';
    const accRes = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Deriv-App-ID': cleanAppId
      }
    });

    if (accRes.ok) {
      const accData: any = await accRes.json();
      const targetAcc = (accData.data || []).find((a: any) => a.account_type === accountType);
      targetAccountId = targetAcc ? targetAcc.account_id : (accData.data?.[0]?.account_id || '');
    }

    if (!targetAccountId) {
      return res.status(400).json({ success: false, error: 'No se encontró cuenta activa' });
    }

    const wsUrl: string = await new Promise((resolve, reject) => {
      const otpReq = https.request({
        hostname: 'api.derivws.com',
        path: `/trading/v1/options/accounts/${targetAccountId}/otp`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Deriv-App-ID': cleanAppId,
          'Content-Length': 0
        }
      }, (otpRes) => {
        let data = '';
        otpRes.on('data', chunk => data += chunk);
        otpRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.data?.url) resolve(parsed.data.url);
            else reject(new Error('No URL in OTP'));
          } catch (e) {
            reject(e);
          }
        });
      });
      otpReq.on('error', reject);
      otpReq.end();
    });

    const ws = new WebSocket(wsUrl);
    let openPositions: any[] = [];
    let history: any[] = [];
    let answered = false;

    const timeout = setTimeout(() => {
      if (!answered) {
        answered = true;
        try { ws.close(); } catch (e) {}
        res.json({ success: true, openPositions, history });
      }
    }, 4000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ proposal_open_contract: 1 }));
      ws.send(JSON.stringify({ profit_table: 1, limit: 15 }));
    });

    ws.on('message', (msg: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.msg_type === 'proposal_open_contract' && parsed.proposal_open_contract) {
          const poc = parsed.proposal_open_contract;
          if (poc.is_valid_to_sell || !poc.is_expired) {
            openPositions.push(poc);
          }
        }
        if (parsed.msg_type === 'profit_table' && parsed.profit_table) {
          history = parsed.profit_table.transactions || [];
        }
      } catch (e) {}
    });

    setTimeout(() => {
      if (!answered) {
        answered = true;
        clearTimeout(timeout);
        try { ws.close(); } catch (e) {}
        res.json({ success: true, openPositions, history });
      }
    }, 1500);

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// MOTOR DE MERCADO EN TIEMPO REAL DIRECTO DE DERIV (CLOUD ENGINE)
// Obtiene ticks reales sin tocar MT5, calcula RSI/EMA y dispara a MT5
// =============================================================================

const liveMarketData: Record<string, {
  price: number;
  prevPrice: number;
  ticks: number[];
  rsi: number;
  ema9: number;
  ema21: number;
  trend: 'ALCISTA' | 'BAJISTA' | 'LATERAL';
  signal: 'BUY' | 'SELL' | 'ESPERAR';
  confidence: number;
  lastUpdate: number;
}> = {
  'Volatility 100 Index': {
    price: 1845.20,
    prevPrice: 1845.10,
    ticks: [1844, 1844.5, 1844.8, 1845.0, 1845.2],
    rsi: 54.2,
    ema9: 1844.9,
    ema21: 1844.2,
    trend: 'ALCISTA',
    signal: 'BUY',
    confidence: 0.85,
    lastUpdate: Date.now()
  },
  'Volatility 10 Index': {
    price: 6420.50,
    prevPrice: 6420.80,
    ticks: [6422, 6421.5, 6421.2, 6420.9, 6420.5],
    rsi: 38.6,
    ema9: 6421.1,
    ema21: 6422.0,
    trend: 'BAJISTA',
    signal: 'SELL',
    confidence: 0.78,
    lastUpdate: Date.now()
  },
  'Volatility 75 Index': {
    price: 452100.00,
    prevPrice: 452050.00,
    ticks: [452000, 452050, 452080, 452100],
    rsi: 62.4,
    ema9: 452060,
    ema21: 451980,
    trend: 'ALCISTA',
    signal: 'BUY',
    confidence: 0.88,
    lastUpdate: Date.now()
  },
  'Volatility 50 Index': {
    price: 284.15,
    prevPrice: 284.20,
    ticks: [284.30, 284.25, 284.20, 284.15],
    rsi: 42.1,
    ema9: 284.22,
    ema21: 284.30,
    trend: 'BAJISTA',
    signal: 'SELL',
    confidence: 0.75,
    lastUpdate: Date.now()
  },
  'Volatility 25 Index': {
    price: 1980.40,
    prevPrice: 1980.35,
    ticks: [1980.1, 1980.2, 1980.3, 1980.4],
    rsi: 51.5,
    ema9: 1980.3,
    ema21: 1980.2,
    trend: 'ALCISTA',
    signal: 'BUY',
    confidence: 0.70,
    lastUpdate: Date.now()
  }
};

// Mapeo de símbolos Deriv a nombres de MT5
const DERIV_SYMBOL_MAP: Record<string, string> = {
  'R_100': 'Volatility 100 Index',
  'R_10': 'Volatility 10 Index',
  'R_75': 'Volatility 75 Index',
  'R_50': 'Volatility 50 Index',
  'R_25': 'Volatility 25 Index'
};

// WebSocket persistente para suscribir a ticks de Deriv (5 Mercados)
function initDerivMarketFeed() {
  const wsUrl = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
  let ws: WebSocket;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    return;
  }

  ws.on('open', () => {
    console.log('[Cloud Market Engine] Conectado a la nube de Deriv para cotizaciones Multi-Mercado 24/7');
    // Suscribirse a los 5 mercados
    ['R_100', 'R_10', 'R_75', 'R_50', 'R_25'].forEach(sym => {
      ws.send(JSON.stringify({ ticks: sym }));
    });
  });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.msg_type === 'tick' && data.tick) {
        const symbolKey = DERIV_SYMBOL_MAP[data.tick.symbol] || data.tick.symbol;
        const quote = parseFloat(data.tick.quote);

        if (!liveMarketData[symbolKey]) {
          liveMarketData[symbolKey] = {
            price: quote,
            prevPrice: quote,
            ticks: [quote],
            rsi: 50,
            ema9: quote,
            ema21: quote,
            trend: 'LATERAL',
            signal: 'ESPERAR',
            confidence: 0.5,
            lastUpdate: Date.now()
          };
        } else {
          const current = liveMarketData[symbolKey];
          current.prevPrice = current.price;
          current.price = quote;
          current.lastUpdate = Date.now();
          current.ticks.push(quote);
          if (current.ticks.length > 25) current.ticks.shift();

          // Cálculo de EMA 9 y 21
          const k9 = 2 / (9 + 1);
          const k21 = 2 / (21 + 1);
          current.ema9 = quote * k9 + current.ema9 * (1 - k9);
          current.ema21 = quote * k21 + current.ema21 * (1 - k21);

          // Cálculo simplificado de RSI 14
          if (current.ticks.length >= 10) {
            let gains = 0;
            let losses = 0;
            for (let i = 1; i < current.ticks.length; i++) {
              const diff = current.ticks[i] - current.ticks[i - 1];
              if (diff > 0) gains += diff;
              else losses += Math.abs(diff);
            }
            const rs = losses === 0 ? 100 : gains / losses;
            current.rsi = 100 - (100 / (1 + rs));
          }

          // Determinar tendencia y señal con coherencia técnica estricta:
          // COMPRA: Cruce alcista EMA9 > EMA21 + RSI saliendo de sobreventa o con momentum (> 52 y < 70)
          // VENTA: Cruce bajista EMA9 < EMA21 + RSI saliendo de sobrecompra o con momentum (< 48 y > 30)
          // Si el mercado está en rango o sobreextendido (RSI > 75 o < 25), NO operar (ESPERAR)
          if (current.ema9 > current.ema21 && current.rsi >= 50 && current.rsi <= 68) {
            current.trend = 'ALCISTA';
            current.signal = 'BUY';
            current.confidence = 0.85;
          } else if (current.ema9 < current.ema21 && current.rsi <= 50 && current.rsi >= 32) {
            current.trend = 'BAJISTA';
            current.signal = 'SELL';
            current.confidence = 0.85;
          } else {
            current.trend = 'LATERAL';
            current.signal = 'ESPERAR';
            current.confidence = 0.40;
          }
        }
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    setTimeout(initDerivMarketFeed, 5000);
  });

  ws.on('error', () => {
    try { ws.close(); } catch (e) {}
  });
}

initDerivMarketFeed();

// Endpoint para que la Web consulte el análisis 100% en la Nube
app.get('/api/market/analysis', (req, res) => {
  res.json({
    success: true,
    serverTime: Date.now(),
    source: 'Deriv Cloud High-Frequency Market Feed (Independiente de MT5)',
    markets: liveMarketData
  });
});

// =============================================================================
// MT5 WINLATOR CLOUD BRIDGE APIS
// =============================================================================

// Endpoint para descargar forzadamente el archivo .mq5 en el móvil
app.get('/api/mt5/download-bridge', (req, res) => {
  const filePath = path.resolve(__dirname, 'public', 'CloudBridge.mq5');
  res.download(filePath, 'CloudBridge.mq5', (err) => {
    if (err) {
      res.status(500).send('Error al descargar archivo');
    }
  });
});

// Endpoint para descargar url.txt en el móvil
app.get('/api/mt5/download-url', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="url.txt"');
  res.setHeader('Content-Type', 'text/plain');
  res.send('https://ais-dev-ff3xr5jx4i3ceshuteyfii-108145579037.us-east5.run.app');
});
interface Mt5Command {
  id: string;
  action: 'BUY' | 'SELL' | 'CLOSE_ALL';
  symbol: string;
  volume: number;
  sl?: number;
  tp?: number;
  createdAt: number;
  status: 'PENDING' | 'SENT' | 'FILLED' | 'FAILED';
  result?: any;
}

const mt5Queues: Record<string, Mt5Command[]> = {
  'winlator-mali-1': []
};

const mt5Devices: Record<string, { lastSeen: number; balance: number; equity: number; status: string; realConnected: boolean }> = {
};

// MT5 en Winlator consulta cada segundo por órdenes pendientes
app.get('/api/mt5/poll', (req, res) => {
  const deviceId = (req.query.deviceId as string) || 'winlator-mali-1';
  const balance = parseFloat((req.query.balance as string) || '0');
  const equity = parseFloat((req.query.equity as string) || '0');

  console.log(`[MT5 Bridge Poll] Recibido pulso REAL de MT5: ${deviceId}, balance=${balance}, equity=${equity}`);

  // Registrar el dispositivo recibido con datos 100% reales de MT5
  const now = Date.now();
  mt5Devices[deviceId] = { lastSeen: now, balance, equity, status: 'CONNECTED', realConnected: true };
  mt5Devices['winlator-mali-1'] = { lastSeen: now, balance, equity, status: 'CONNECTED', realConnected: true };

  const queue = mt5Queues[deviceId] || mt5Queues['winlator-mali-1'] || [];
  const pending = queue.filter(c => c.status === 'PENDING');
  
  // Marcar como enviadas
  pending.forEach(c => c.status = 'SENT');

  res.json({
    success: true,
    serverTime: Date.now(),
    commands: pending
  });
});

// MT5 reporta la ejecución de la orden con su ticket
app.post('/api/mt5/report', (req, res) => {
  const { deviceId = 'winlator-mali-1', commandId, symbol, action, volume, ticket, status, error, balance, equity } = req.body;
  
  if (mt5Devices[deviceId]) {
    mt5Devices[deviceId].lastSeen = Date.now();
    if (balance !== undefined) mt5Devices[deviceId].balance = parseFloat(balance);
    if (equity !== undefined) mt5Devices[deviceId].equity = parseFloat(equity);
  }

  const queue = mt5Queues[deviceId] || [];
  const cmd = queue.find(c => c.id === commandId);
  if (cmd) {
    cmd.status = status === 'FILLED' ? 'FILLED' : 'FAILED';
    cmd.result = { ticket, error, time: Date.now() };
  }

  console.log(`[MT5 Bridge] Orden ${commandId} ${status} en ${symbol} (Ticket: ${ticket})`);
  res.json({ success: true, updated: true });
});

// Endpoint para que la IA (o usuario) despache órdenes a MT5
app.post('/api/mt5/queue-command', (req, res) => {
  const {
    deviceId = 'winlator-mali-1',
    action, // BUY | SELL | CLOSE_ALL
    symbol = 'Volatility 75 Index',
    volume = 0.001,
    sl = 0,
    tp = 0
  } = req.body;

  if (!action) {
    return res.status(400).json({ success: false, error: 'Acción requerida (BUY, SELL, CLOSE_ALL)' });
  }

  if (!mt5Queues[deviceId]) mt5Queues[deviceId] = [];

  const newCmd: Mt5Command = {
    id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    action,
    symbol,
    volume: parseFloat(volume) || 0.001,
    sl: parseFloat(sl) || 0,
    tp: parseFloat(tp) || 0,
    createdAt: Date.now(),
    status: 'PENDING'
  };

  mt5Queues[deviceId].push(newCmd);

  res.json({
    success: true,
    message: `Orden encolada para MT5 en Winlator: ${action} ${volume} ${symbol}`,
    command: newCmd
  });
});

// Endpoint para ver estado de MT5, diagnósticos de conectividad y órdenes
app.get('/api/mt5/status', (req, res) => {
  const deviceId = (req.query.deviceId as string) || 'winlator-mali-1';
  const dev = mt5Devices[deviceId];

  if (!dev || !dev.realConnected) {
    return res.json({
      success: true,
      deviceId,
      isOnline: false,
      health: 'DISCONNECTED',
      message: 'Sin enlace con MetaTrader 5. Esperando primer pulso WebRequest...',
      solution: 'Verifica la URL en MT5 > Opciones > Asesores Expertos y activa Trading Algorítmico.',
      lastSeenSecondsAgo: 9999,
      account: { balance: 0, equity: 0 },
      lastError: null,
      history: []
    });
  }

  const lastSeenSecondsAgo = Math.round((Date.now() - dev.lastSeen) / 1000);
  const isOnline = dev.status === 'CONNECTED' && lastSeenSecondsAgo < 20;
  const queue = mt5Queues[deviceId] || [];

  // Diagnóstico de salud de la conexión
  let health: 'HEALTHY' | 'WARNING' | 'DISCONNECTED' = 'HEALTHY';
  let message = `Enlace en vivo confirmado con MetaTrader 5 (Winlator).`;
  let solution: string | null = null;

  if (isOnline) {
    health = 'HEALTHY';
    message = `Conexión excelente. Último pulso recibido hace ${Math.max(1, lastSeenSecondsAgo)} segundo(s).`;
    solution = null;
  } else if (lastSeenSecondsAgo >= 20 && lastSeenSecondsAgo < 60) {
    health = 'WARNING';
    message = `Señal intermitente. Sin pulso desde hace ${lastSeenSecondsAgo} segundos.`;
    solution = 'El emulador Winlator puede haberse suspendido en segundo plano en Android. Ábrelo un segundo para reactivarlo.';
  } else {
    health = 'DISCONNECTED';
    message = `Desconectado hace ${Math.round(lastSeenSecondsAgo / 60)} minutos.`;
    solution = 'Verifica que la app Winlator siga corriendo en tu teléfono y que MT5 no se haya cerrado.';
  }

  // Comprobar si hay órdenes fallidas recientes
  const failedOrders = queue.filter(c => c.status === 'FAILED');
  const lastError = failedOrders.length > 0 ? failedOrders[failedOrders.length - 1].result?.error : null;

  res.json({
    success: true,
    deviceId,
    isOnline,
    health,
    message,
    solution,
    lastSeenSecondsAgo,
    account: { balance: dev.balance, equity: dev.equity },
    lastError,
    history: queue.slice(-20)
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
