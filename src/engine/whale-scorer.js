export class WhaleScorer {
  constructor(options = {}) {
    this.lowLiquidityCap = 60; // Cap score when market is thin
  }

  compute(params) {
    const {
      walls, wallCount, maxWallRatio, wallMult,
      binanceSummary, recentSpoofs, crossExDiscrepancy,
      crossExScore, flowOfi5m, price,
    } = params;

    let score = 0;

    // Walls (max 25)
    score += Math.min(25, wallCount * 4 + Math.max(0, (maxWallRatio - (wallMult || 5)) * 3));

    // Imbalance (max 20)
    const imbal = binanceSummary.imbalance || 1;
    if (imbal > 1) score += Math.min(20, (imbal - 1) * 20);
    else if (imbal < 1) score += Math.min(20, (1 / Math.max(0.01, imbal) - 1) * 20);

    // Spoof activity (max 15)
    score += Math.min(15, recentSpoofs * 3);

    // Cross-exchange discrepancy (max 15)
    score += (crossExScore || Math.round(crossExDiscrepancy * 0.15));

    // Flow pressure (max 10)
    const totalVol = (binanceSummary.bidVolume || 0) + (binanceSummary.askVolume || 0);
    if (totalVol > 0) {
      score += Math.min(10, Math.abs(flowOfi5m || 0) / totalVol * 50);
    }

    // Depth decay — penalty for thin book (max 5)
    const bidLevels = (binanceSummary.bidLevels || []).length;
    const askLevels = (binanceSummary.askLevels || []).length;
    if (bidLevels < 10 || askLevels < 10) {
      score += Math.min(5, (20 - bidLevels - askLevels) * 0.25);
    }

    // Spread anomaly (max 5)
    if (binanceSummary.spread > 0.5) score += 5;
    else if (binanceSummary.spread > 0.1) score += 3;

    // Near price wall (max 5)
    if (price && walls && walls.length > 0) {
      for (const w of walls) {
        const pctDist = Math.abs(w.price - price) / price * 100;
        if (pctDist < 0.5) { score += 5; break; }
      }
    }

    // Low liquidity cap
    const isLowLiquidity = totalVol < (params.minVol || 100);
    if (isLowLiquidity && score >= this.lowLiquidityCap) {
      score = this.lowLiquidityCap;
    }

    const finalScore = Math.round(Math.min(100, score));

    return {
      score: finalScore,
      isLowLiquidity,
      breakdown: {
        walls: Math.round(score),
        imbalance: imbal,
        spoofs: recentSpoofs,
        crossEx: crossExDiscrepancy,
        flow: Math.round(flowOfi5m || 0),
        spread: binanceSummary.spread,
      },
    };
  }

  getAlertLevel(score) {
    if (score >= 80) return 'EXTREME';
    if (score >= 70) return 'HIGH';
    if (score >= 50) return 'MEDIUM';
    if (score >= 30) return 'LOW';
    return 'NORMAL';
  }
}
