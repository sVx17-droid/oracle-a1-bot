export class CrossValidator {
  constructor() {
    this.discrepancy = 0;
    this.details = {};
  }

  compute(binanceSummary, bybitSummary, okxSummary) {
    let score = 0;
    const details = {};

    // Imbalance discrepancy: Binance imbalance vs Bybit+OKX average
    if (binanceSummary.ready && bybitSummary.ready) {
      const avgOthers = bybitSummary.ready && okxSummary.ready
        ? (bybitSummary.imbalance + okxSummary.imbalance) / 2
        : bybitSummary.imbalance;

      const ratio = binanceSummary.imbalance / (avgOthers || 1);
      details.imbalanceRatio = Math.round(ratio * 100) / 100;

      if (ratio > 1.5 || ratio < 0.67) {
        score += Math.min(50, Math.abs(ratio - 1) * 40);
      }
    }

    // Spread discrepancy
    if (binanceSummary.ready && bybitSummary.ready && binanceSummary.spread > 0.1) {
      const avgSpread = bybitSummary.ready && okxSummary.ready
        ? (bybitSummary.spread + okxSummary.spread) / 2
        : bybitSummary.spread;

      details.spreadRatio = Math.round(binanceSummary.spread / (avgSpread || 0.01) * 100) / 100;

      if (binanceSummary.spread > avgSpread * 2) {
        score += 25;
      }
    }

    // Bid/ask volume asymmetry across exchanges
    if (binanceSummary.ready && bybitSummary.ready) {
      const bnbRatio = binanceSummary.askVolume > 0
        ? binanceSummary.bidVolume / binanceSummary.askVolume
        : 1;
      const bybRatio = bybitSummary.askVolume > 0
        ? bybitSummary.bidVolume / bybitSummary.askVolume
        : 1;

      details.volumeAsymmetry = Math.abs(bnbRatio - bybRatio) > 2;

      if (details.volumeAsymmetry) {
        score += 25;
      }
    }

    this.discrepancy = Math.min(100, Math.round(score));
    this.details = details;

    return this.discrepancy;
  }

  // Returns 0-15 for whale score contribution
  scoreContribution() {
    return Math.round(this.discrepancy * 0.15);
  }

  summarize() {
    return {
      discrepancy: this.discrepancy,
      details: this.details,
      scoreContrib: this.scoreContribution(),
    };
  }
}
