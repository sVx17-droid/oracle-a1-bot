export class OrderBookBuffer {
  constructor(symbol, exchange) {
    this.symbol = symbol;
    this.exchange = exchange;
    this.bids = new Map();   // price -> { price, qty }
    this.asks = new Map();
    this.ready = false;
    this.lastUpdateId = 0;
    this.lastSeq = 0;
    this.updatedAt = 0;
  }

  applySnapshot(data) {
    this.bids.clear();
    this.asks.clear();
    for (const b of data.bids || []) {
      if (b.qty > 0) this.bids.set(b.price, { price: b.price, qty: b.qty });
    }
    for (const a of data.asks || []) {
      if (a.qty > 0) this.asks.set(a.price, { price: a.price, qty: a.qty });
    }
    if (data.lastUpdateId !== undefined) this.lastUpdateId = data.lastUpdateId;
    if (data.seq !== undefined) this.lastSeq = data.seq;
    this.ready = true;
    this.updatedAt = Date.now();
  }

  applyDelta(data) {
    for (const b of data.bids || []) {
      if (b.qty <= 0) {
        this.bids.delete(b.price);
      } else {
        this.bids.set(b.price, { price: b.price, qty: b.qty });
      }
    }
    for (const a of data.asks || []) {
      if (a.qty <= 0) {
        this.asks.delete(a.price);
      } else {
        this.asks.set(a.price, { price: a.price, qty: a.qty });
      }
    }
    if (data.lastUpdateId !== undefined) this.lastUpdateId = data.lastUpdateId;
    if (data.seq !== undefined) this.lastSeq = data.seq;
    this.updatedAt = Date.now();
  }

  getSortedBids(limit = 20) {
    return Array.from(this.bids.values())
      .sort((a, b) => b.price - a.price)
      .slice(0, limit);
  }

  getSortedAsks(limit = 20) {
    return Array.from(this.asks.values())
      .sort((a, b) => a.price - b.price)
      .slice(0, limit);
  }

  getBestBid() {
    let best = 0;
    for (const price of this.bids.keys()) {
      if (price > best) best = price;
    }
    return best || null;
  }

  getBestAsk() {
    let best = Infinity;
    for (const price of this.asks.keys()) {
      if (price < best) best = price;
    }
    return best === Infinity ? null : best;
  }

  getVolume(side) {
    const map = side === 'bid' ? this.bids : this.asks;
    let total = 0;
    for (const v of map.values()) total += v.qty;
    return total;
  }

  getDepthLevels(levels = 20) {
    return {
      bids: this.getSortedBids(levels),
      asks: this.getSortedAsks(levels),
    };
  }

  summarize() {
    const bids = this.getSortedBids(20);
    const asks = this.getSortedAsks(20);
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    const spread = bestBid && bestAsk ? ((bestAsk - bestBid) / bestAsk * 100) : 0;
    const bidVol = this.getVolume('bid');
    const askVol = this.getVolume('ask');
    const imbalance = askVol > 0 ? bidVol / askVol : 1;

    return {
      bestBid, bestAsk, spread: Math.round(spread * 100) / 100,
      bidVolume: Math.round(bidVol), askVolume: Math.round(askVol),
      imbalance: Math.round(imbalance * 100) / 100,
      ready: this.ready, updatedAt: this.updatedAt,
      bidLevels: bids.slice(0, 5).map(b => b.price),
      askLevels: asks.slice(0, 5).map(a => a.price),
    };
  }
}
