export class FlowAnalyzer {
  constructor(maxBuffer = 900) {
    this.ofiBuffer = [];  // { ts, value }
    this.maxBuffer = maxBuffer;
    this.ofi_1m = 0;
    this.ofi_5m = 0;
    this.ofi_15m = 0;
  }

  tick(prevBids, prevAsks, currentBids, currentAsks) {
    let bidAdded = 0, bidRemoved = 0, askAdded = 0, askRemoved = 0;

    const bidMap = new Map(currentBids.map(b => [b.price, b.qty]));
    const prevBidMap = new Map((prevBids || []).map(b => [b.price, b.qty]));

    for (const [price, qty] of bidMap) {
      const prev = prevBidMap.get(price) || 0;
      if (qty > prev) bidAdded += qty - prev;
      else bidRemoved += prev - qty;
    }
    for (const [price, qty] of prevBidMap) {
      if (!bidMap.has(price)) bidRemoved += qty;
    }

    const askMap = new Map(currentAsks.map(a => [a.price, a.qty]));
    const prevAskMap = new Map((prevAsks || []).map(a => [a.price, a.qty]));

    for (const [price, qty] of askMap) {
      const prev = prevAskMap.get(price) || 0;
      if (qty > prev) askAdded += qty - prev;
      else askRemoved += prev - qty;
    }
    for (const [price, qty] of prevAskMap) {
      if (!askMap.has(price)) askRemoved += qty;
    }

    const ofi = (bidAdded - bidRemoved) - (askAdded - askRemoved);
    const now = Date.now();

    this.ofiBuffer.push({ ts: now, value: ofi });
    if (this.ofiBuffer.length > this.maxBuffer) this.ofiBuffer.shift();

    this.ofi_1m = this._sumWindow(now, 60000);
    this.ofi_5m = this._sumWindow(now, 300000);
    this.ofi_15m = this._sumWindow(now, 900000);

    return { current: ofi, ofi_1m: this.ofi_1m, ofi_5m: this.ofi_5m, ofi_15m: this.ofi_15m };
  }

  _sumWindow(now, windowMs) {
    let sum = 0;
    for (const entry of this.ofiBuffer) {
      if (now - entry.ts <= windowMs) sum += entry.value;
    }
    return Math.round(sum);
  }

  // OFI contributes pressure score (max 10)
  pressureScore(totalVolume = 1) {
    if (totalVolume <= 0) return 0;
    return Math.min(10, Math.abs(this.ofi_5m) / totalVolume * 50);
  }

  summarize() {
    return {
      ofi_1m: this.ofi_1m,
      ofi_5m: this.ofi_5m,
      ofi_15m: this.ofi_15m,
    };
  }
}
