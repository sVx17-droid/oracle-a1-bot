export class SpoofDetector {
  constructor(maxEvents = 50) {
    this.events = [];
    this.maxEvents = maxEvents;
  }

  record(spoofEvents) {
    for (const e of spoofEvents) {
      this.events.push(e);
      if (this.events.length > this.maxEvents) this.events.shift();
    }
  }

  getRecent(windowMs = 60000) {
    const now = Date.now();
    return this.events.filter(e => now - e.ts < windowMs);
  }

  recentCount(windowMs = 60000) {
    return this.getRecent(windowMs).length;
  }

  // Pattern detection: repeated spoofs at same price level
  getPatterns() {
    const now = Date.now();
    const recent = this.events.filter(e => now - e.ts < 300000); // 5 min window

    const patterns = new Map(); // priceKey -> count
    for (const e of recent) {
      const key = e.side + '@' + e.price.toFixed(4);
      patterns.set(key, (patterns.get(key) || 0) + 1);
    }

    const result = [];
    for (const [key, count] of patterns) {
      if (count >= 3) result.push({ key, count, severity: Math.min(10, count * 3) });
    }
    return result;
  }

  summarize() {
    return {
      recentCount: this.recentCount(),
      events: this.events.slice(-10),
      patterns: this.getPatterns(),
    };
  }
}
