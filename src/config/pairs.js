const DEFAULT_PAIRS = [
  { symbol: 'BTCUSDT',  binance: 'btcusdt',  bybit: 'BTCUSDT',  okx: 'BTC-USDT',  minVol: 50,   wallMult: 10 },
  { symbol: 'ETHUSDT',  binance: 'ethusdt',  bybit: 'ETHUSDT',  okx: 'ETH-USDT',  minVol: 40,   wallMult: 7 },
  { symbol: 'SOLUSDT',  binance: 'solusdt',  bybit: 'SOLUSDT',  okx: 'SOL-USDT',  minVol: 300,  wallMult: 6 },
  { symbol: 'XRPUSDT',  binance: 'xrpusdt',  bybit: 'XRPUSDT',  okx: 'XRP-USDT',  minVol: 500,  wallMult: 5 },
  { symbol: 'DOGEUSDT', binance: 'dogeusdt', bybit: 'DOGEUSDT', okx: 'DOGE-USDT', minVol: 3000, wallMult: 5 },
  { symbol: 'ADAUSDT',  binance: 'adausdt',  bybit: 'ADAUSDT',  okx: 'ADA-USDT',  minVol: 2000, wallMult: 5 },
  { symbol: 'AVAXUSDT', binance: 'avaxusdt', bybit: 'AVAXUSDT', okx: 'AVAX-USDT', minVol: 500,  wallMult: 5 },
  { symbol: 'DOTUSDT',  binance: 'dotusdt',  bybit: 'DOTUSDT',  okx: 'DOT-USDT',  minVol: 800,  wallMult: 5 },
  { symbol: 'LINKUSDT', binance: 'linkusdt', bybit: 'LINKUSDT', okx: 'LINK-USDT', minVol: 150,  wallMult: 7 },
  { symbol: 'ATOMUSDT', binance: 'atomusdt', bybit: 'ATOMUSDT', okx: 'ATOM-USDT', minVol: 200,  wallMult: 5 },
  { symbol: 'FILUSDT',  binance: 'filusdt',  bybit: 'FILUSDT',  okx: 'FIL-USDT',  minVol: 2000, wallMult: 5 },
  { symbol: 'APTUSDT',  binance: 'aptusdt',  bybit: 'APTUSDT',  okx: 'APT-USDT',  minVol: 500,  wallMult: 5 },
  { symbol: 'ARBUSDT',  binance: 'arbusdt',  bybit: 'ARBUSDT',  okx: 'ARB-USDT',  minVol: 5000, wallMult: 5 },
  { symbol: 'NEARUSDT', binance: 'nearusdt', bybit: 'NEARUSDT', okx: 'NEAR-USDT', minVol: 800,  wallMult: 5 },
  { symbol: 'INJUSDT',  binance: 'injusdt',  bybit: 'INJUSDT',  okx: 'INJ-USDT',  minVol: 100,  wallMult: 5 },
  { symbol: 'SUIUSDT',  binance: 'suiusdt',  bybit: 'SUIUSDT',  okx: 'SUI-USDT',  minVol: 3000, wallMult: 5 },
  { symbol: 'UNIUSDT',  binance: 'uniusdt',  bybit: 'UNIUSDT',  okx: 'UNI-USDT',  minVol: 100,  wallMult: 5 },
  { symbol: 'FETUSDT',  binance: 'fetusdt',  bybit: 'FETUSDT',  okx: 'FET-USDT',  minVol: 5000, wallMult: 5 },
  { symbol: 'LTCUSDT',  binance: 'ltcusdt',  bybit: 'LTCUSDT',  okx: 'LTC-USDT',  minVol: 100,  wallMult: 5 },
  { symbol: 'PEPEUSDT', binance: 'pepeusdt', bybit: 'PEPEUSDT', okx: 'PEPE-USDT', minVol: 500000, wallMult: 4 },
  { symbol: 'SHIBUSDT', binance: 'shibusdt', bybit: 'SHIBUSDT', okx: 'SHIB-USDT', minVol: 5000000, wallMult: 4 },
  { symbol: 'TRXUSDT',  binance: 'trxusdt',  bybit: 'TRXUSDT',  okx: 'TRX-USDT',  minVol: 100,  wallMult: 5 },
  { symbol: 'TONUSDT',  binance: 'tonusdt',  bybit: 'TONUSDT',  okx: 'TON-USDT',  minVol: 100,  wallMult: 5 },
  { symbol: 'ICPUSDT',  binance: 'icpusdt',  bybit: 'ICPUSDT',  okx: 'ICP-USDT',  minVol: 100,  wallMult: 5 },
  { symbol: 'RENDERUSDT', binance: 'renderusdt', bybit: 'RENDERUSDT', okx: 'RENDER-USDT', minVol: 200, wallMult: 5 },
  { symbol: 'TAOUSDT',  binance: 'taousdt',  bybit: 'TAOUSDT',  okx: 'TAO-USDT',  minVol: 50,   wallMult: 6 },
  { symbol: 'WIFUSDT',  binance: 'wifusdt',  bybit: 'WIFUSDT',  okx: 'WIF-USDT',  minVol: 500,  wallMult: 5 },
  { symbol: 'BONKUSDT', binance: 'bonkusdt', bybit: 'BONKUSDT', okx: 'BONK-USDT', minVol: 10000000, wallMult: 4 },
  { symbol: 'ENAUSDT',  binance: 'enausdt',  bybit: 'ENAUSDT',  okx: 'ENA-USDT',  minVol: 1000, wallMult: 5 },
  { symbol: 'OMUSDT',   binance: 'omusdt',   bybit: 'OMUSDT',   okx: 'OM-USDT',   minVol: 100,  wallMult: 5 },
];

export const PAIRS = DEFAULT_PAIRS;
export const PAIR_CONFIG = Object.fromEntries(PAIRS.map(p => [p.symbol, { minVol: p.minVol, wallMult: p.wallMult }]));
export const BINANCE_MAP = Object.fromEntries(PAIRS.map(p => [p.binance, p]));
export const BYBIT_MAP = Object.fromEntries(PAIRS.map(p => [p.bybit, p]));
export const OKX_MAP = Object.fromEntries(PAIRS.map(p => [p.okx, p]));

export function getPairTier(index) {
  if (index < 10) return 'MAJOR';
  if (index < 50) return 'MID';
  return 'MINOR';
}
