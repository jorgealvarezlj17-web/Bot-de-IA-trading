export interface TradingDecision {
  action: 'BUY_CALL' | 'BUY_PUT' | 'HOLD' | 'PAUSE';
  reasoning: string;
  confidence: number;
  suggested_stake?: number;
  suggested_duration_ticks?: number;
}

export interface DerivAccount {
  loginid: string;
  email: string;
  balance: number;
  currency: string;
  is_virtual: boolean;
}

export interface MarketIndicators {
  price: number;
  rsi: number;
  ema9: number;
  ema21: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  priceChange5t: number;
  volatility: number;
}

export interface StrategyPreset {
  id: string;
  name: string;
  description: string;
  symbol: string;
  stake: number;
  systemInstruction: string;
}
