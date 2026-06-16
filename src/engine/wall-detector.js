import { PAIR_CONFIG } from '../config/pairs.js';

export class WallDetector {
  constructor(symbol, options = {}) {
    this.symbol = symbol;
    this.pairConfig = PAIR_CONFIG[symbol] || {};
    this.wallMult = options.wallMult || this.pairConfig.wallMult || 5;
    this.walls = [];
    this.wallHistory = [];
    this.maxHistoryMs = options.wallHistoryMaxAgeMs || 120000;
  }

  detect(book, spoofWindowSec = 10) {
    const bids = book.getSortedBids(20);
    const asks = book.getSortedAsks(20);

    const prevBidPrices = new Set(this.walls.filter(w => w.side === 'bid').map(w => w.price));
    const prevAskPrices = new Set(this.walls.filter(w => w.side === 'ask').map(w => w.price));

    const allWalls = [];
    const now = Date.now();

    // Detect bid walls
    if (bids.length >= 5) {
      const bidMedian = this._median(bids.map(b => b.qty));
      for (const b of bids) {
        if (b.qty > bidMedian * this.wallMult && b.qty > 0.5) {
          const ratio = Math.round(b.qty / bidMedian * 10) / 10;
          const existing = this.walls.find(w => w.side === 'bid' && w.price === b.price);
          allWalls.push({
            side: 'bid', price: b.price, qty: b.qty, ratio,
            _firstSeen: existing ? existing._firstSeen : now,
            _age: existing ? Math.round((now - existing._firstSeen) / 1000) : 0,
          });
          if (!existing) {
            this.wallHistory.push({ side: 'bid', price: b.price, qty: b.qty, ts: now, active: true });
          }
        }
      }
    }

    // Detect ask walls
    if (asks.length >= 5) {
      const askMedian = this._median(asks.map(a => a.qty));
      for (const a of asks) {
        if (a.qty > askMedian * this.wallMult && a.qty > 0.5) {
          const ratio = Math.round(a.qty / askMedian * 10) / 10;
          const existing = this.walls.find(w => w.side === 'ask' && w.price === a.price);
          allWalls.push({
            side: 'ask', price: a.price, qty: a.qty, ratio,
            _firstSeen: existing ? existing._firstSeen : now,
            _age: existing ? Math.round((now - existing._firstSeen) / 1000) : 0,
          });
          if (!existing) {
            this.wallHistory.push({ side: 'ask', price: a.price, qty: a.qty, ts: now, active: true });
          }
        }
      }
    }

    // Track disappeared walls for spoof detection
    const newBidPrices = new Set(allWalls.filter(w => w.side === 'bid').map(w => w.price));
    const newAskPrices = new Set(allWalls.filter(w => w.side === 'ask').map(w => w.price));

    const spoofEvents = [];
    for (const prevPrice of prevBidPrices) {
      if (!newBidPrices.has(prevPrice)) {
        const evt = this._makeSpoofEvent('bid', prevPrice, now, spoofWindowSec);
        if (evt) spoofEvents.push(evt);
      }
    }
    for (const prevPrice of prevAskPrices) {
      if (!newAskPrices.has(prevPrice)) {
        const evt = this._makeSpoofEvent('ask', prevPrice, now, spoofWindowSec);
        if (evt) spoofEvents.push(evt);
      }
    }

    // Update wall history active state
    for (const wh of this.wallHistory) {
      if (wh.active) {
        if (wh.side === 'bid' && !newBidPrices.has(wh.price)) wh.active = false;
        if (wh.side === 'ask' && !newAskPrices.has(wh.price)) wh.active = false;
      }
    }

    // Cleanup old history
    this.wallHistory = this.wallHistory.filter(w => (now - w.ts) < this.maxHistoryMs);

    this.walls = allWalls;
    return spoofEvents;
  }

  _makeSpoofEvent(side, price, now, spoofWindowSec) {
    const entry = this.wallHistory.find(
      w => w.side === side && w.price === price && w.active
    );
    if (!entry) return null;
    const duration = (now - entry.ts) / 1000;
    if (duration >= spoofWindowSec) return null;
    return {
      side, price: entry.price, qty: entry.qty,
      disappearMs: Math.round(duration * 1000), ts: now,
    };
  }

  _median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  maxWallRatio() {
    return this.walls.length > 0 ? Math.max(...this.walls.map(w => w.ratio || 0)) : 0;
  }

  summarize() {
    return {
      walls: this.walls.map(w => ({
        side: w.side, price: w.price, qty: w.qty, ratio: w.ratio, age: w._age || 0,
      })),
      wallCount: this.walls.length,
      maxRatio: this.maxWallRatio(),
    };
  }
}
