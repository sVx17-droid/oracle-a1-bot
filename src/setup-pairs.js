// Script to expand pair list from Binance API
import https from 'https';

const BINANCE_API = 'https://api.binance.com/api/v3';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching top USDT pairs from Binance...');

  // Get exchange info
  const info = await fetch(BINANCE_API + '/exchangeInfo');
  const symbols = info.symbols.filter(s =>
    s.status === 'TRADING' &&
    s.quoteAsset === 'USDT' &&
    s.isSpotTradingAllowed
  );

  // Get 24hr tickers for volume sorting
  const tickers = await fetch(BINANCE_API + '/ticker/24hr');
  const usdtTickers = tickers.filter(t =>
    t.symbol.endsWith('USDT') &&
    symbols.find(s => s.symbol === t.symbol)
  );

  // Sort by volume
  usdtTickers.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

  // Take top 200
  const top200 = usdtTickers.slice(0, 200);

  const pairs = [];
  for (const t of top200) {
    const binance = t.symbol.toLowerCase();
    const symbol = t.symbol;
    const bybit = t.symbol; // Bybit uses same symbol format
    const okx = t.symbol.replace('USDT', '-USDT'); // OKX: BTC-USDT

    // Estimate minVol and wallMult based on volume tier
    const vol = parseFloat(t.quoteVolume);
    let minVol = 100, wallMult = 5;
    if (vol > 500_000_000) { minVol = 50; wallMult = 10; }      // Tier 1: BTC/ETH
    else if (vol > 100_000_000) { minVol = 200; wallMult = 7; }  // Tier 2: SOL/XRP
    else if (vol > 10_000_000) { minVol = 500; wallMult = 5; }   // Tier 3: Mid caps
    else if (vol > 1_000_000) { minVol = 3000; wallMult = 5; }   // Tier 4: Small caps
    else { minVol = 10000; wallMult = 4; }                        // Tier 5: Micro caps

    pairs.push({ symbol, binance, bybit, okx, minVol, wallMult });
  }

  console.log('Generated ' + pairs.length + ' pairs');

  // Print as JS array
  console.log('\\n// Copy this into src/config/pairs.js:\\n');
  console.log('const DEFAULT_PAIRS = [');
  for (const p of pairs) {
    console.log(`  { symbol: '${p.symbol}',  binance: '${p.binance}',  bybit: '${p.bybit}',  okx: '${p.okx}',  minVol: ${p.minVol},  wallMult: ${p.wallMult} },`);
  }
  console.log('];');
}

main().catch(console.error);
