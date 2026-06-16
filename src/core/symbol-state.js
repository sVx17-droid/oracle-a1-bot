import { OrderBookBuffer } from './orderbook-buffer.js';
import { SPOOF_WINDOW_SEC, FT_MAX_EVENTS, FT_COOLDOWN_MS } from '../config/constants.js';
import { PAIR_CONFIG } from '../config/pairs.js';
import { WallDetector } from '../engine/wall-detector.js';
import { SpoofDetector } from '../engine/spoof-detector.js';
import { FlowAnalyzer } from '../engine/flow-analyzer.js';
import { CrossValidator } from '../engine/cross-validator.js';
import { WhaleScorer } from '../engine/whale-scorer.js';

export class SymbolState {
  constructor(symbol, pairMeta) {
    this.symbol = symbol;
    this.meta = pairMeta || PAIR_CONFIG[symbol] || {};
    this.wallThreshold = this.meta.wallMult || 5;
    this.minVol = this.meta.minVol || 100;

    // Order books per exchange
    this.books = {
      binance: new OrderBookBuffer(symbol, 'binance'),
      bybit: new OrderBookBuffer(symbol, 'bybit'),
      okx: new OrderBookBuffer(symbol, 'okx'),
    };

    // Price
    this.price = null;
    this.priceSource = null;

    // Engine modules
    this.wallDetector = new WallDetector(symbol, { wallMult: this.wallThreshold });
    this.spoofDetector = new SpoofDetector();
    this.flowAnalyzer = new FlowAnalyzer();
    this.crossValidator = new CrossValidator();
    this.whaleScorer = new WhaleScorer();

    // Scoring results
    this.whaleScore = 0;
    this.scoreBreakdown = {};
    this.lowLiquidity = false;
    this.crossExDiscrepancy = 0;

    // Alerts
    this.alerts = [];
    this.lastAlertTime = 0;

    // Forward test
    this.fwdLastTracked = 0;
    this.fwdEvents = [];

    // Previous order book for OFI delta calculation
    this._prevBids = [];
    this._prevAsks = [];
  }

  applyDepth(data) {
    const book = this.books[data.exchange];
    if (!book) return;

    if (data.type === 'snapshot') {
      book.applySnapshot(data);
    } else if (data.type === 'delta') {
      if (book.ready) book.applyDelta(data);
    }

    // Update price from binance mid-price (primary)
    if (data.exchange === 'binance') {
      const bid = book.getBestBid();
      const ask = book.getBestAsk();
      if (bid && ask) {
        this.price = (bid + ask) / 2;
        this.priceSource = 'binance';
      }
    }
  }

  setPrice(price, source) {
    this.price = price;
    this.priceSource = source;
  }

  runAnalysis() {
    const binanceBook = this.books.binance;
    if (!binanceBook.ready) return;

    // 1. Wall detection + spoof tracking
    const spoofEvents = this.wallDetector.detect(binanceBook, SPOOF_WINDOW_SEC);
    this.spoofDetector.record(spoofEvents);

    // 2. Flow analysis (OFI)
    const currentBids = binanceBook.getSortedBids(20);
    const currentAsks = binanceBook.getSortedAsks(20);
    this.flowAnalyzer.tick(this._prevBids, this._prevAsks, currentBids, currentAsks);
    this._prevBids = currentBids;
    this._prevAsks = currentAsks;

    // 3. Cross-exchange validation
    this.crossExDiscrepancy = this.crossValidator.compute(
      this.books.binance.summarize(),
      this.books.bybit.summarize(),
      this.books.okx.summarize()
    );

    // 4. Composite whale scoring
    const wallsSummary = this.wallDetector.summarize();
    const result = this.whaleScorer.compute({
      walls: wallsSummary.walls,
      wallCount: wallsSummary.wallCount,
      maxWallRatio: wallsSummary.maxRatio,
      wallMult: this.wallThreshold,
      minVol: this.minVol,
      binanceSummary: binanceBook.summarize(),
      recentSpoofs: this.spoofDetector.recentCount(),
      crossExDiscrepancy: this.crossValidator.summarize().discrepancy,
      crossExScore: this.crossValidator.summarize().scoreContrib,
      flowOfi5m: this.flowAnalyzer.ofi_5m,
      price: this.price,
    });

    this.whaleScore = result.score;
    this.lowLiquidity = result.isLowLiquidity;
    this.scoreBreakdown = result.breakdown;
  }

  addAlert(type, message) {
    this.alerts.unshift({ ts: Date.now(), type, message });
    if (this.alerts.length > 100) this.alerts.pop();
    this.lastAlertTime = Date.now();
    return { type, message, symbol: this.symbol, score: this.whaleScore, ts: Date.now() };
  }

  trackWhaleEvent() {
    const now = Date.now();
    if (now - this.fwdLastTracked < FT_COOLDOWN_MS) return null;
    this.fwdLastTracked = now;

    const bnb = this.books.binance.summarize();
    let direction = 'NEUTRAL';
    if (bnb.imbalance > 1.2) direction = 'LONG';
    else if (bnb.imbalance < 0.8) direction = 'SHORT';

    const event = {
      symbol: this.symbol,
      ts: now,
      price: this.price,
      score: this.whaleScore,
      imbalance: bnb.imbalance,
      walls: this.wallDetector.walls.length,
      direction,
      outcomes: {},
      complete: false,
    };

    this.fwdEvents.push(event);
    if (this.fwdEvents.length > FT_MAX_EVENTS) this.fwdEvents.shift();
    return event;
  }

  evaluateFwd() {
    const now = Date.now();
    for (const event of this.fwdEvents) {
      if (event.complete) continue;
      if (!this.price) continue;

      const elapsed = (now - event.ts) / 60000;
      const changePct = ((this.price - event.price) / event.price) * 100;

      const checkpoints = { 15: 15, 30: 30, 60: 60, 120: 120, 240: 240 };

      for (const [label, min] of Object.entries(checkpoints)) {
        if (elapsed >= min && event.outcomes[label] === undefined) {
          const hit = (event.direction === 'LONG' && changePct > 0) ||
                      (event.direction === 'SHORT' && changePct < 0) ||
                      event.direction === 'NEUTRAL';
          event.outcomes[label] = { changePct: Math.round(changePct * 100) / 100, hit };
        }
      }

      if (elapsed >= 245) event.complete = true;
    }
  }

  summary() {
    const bnb = this.books.binance.summarize();
    const flow = this.flowAnalyzer.summarize();
    const walls = this.wallDetector.summarize();
    const spoof = this.spoofDetector.summarize();

    return {
      symbol: this.symbol,
      price: this.price,
      priceSource: this.priceSource,
      bestBid: bnb.bestBid,
      bestAsk: bnb.bestAsk,
      spread: bnb.spread,
      bidVolume: bnb.bidVolume,
      askVolume: bnb.askVolume,
      imbalance: bnb.imbalance,
      walls: walls.walls,
      wallCount: walls.wallCount,
      spoofRecent: spoof.recentCount,
      whaleScore: this.whaleScore,
      scoreBreakdown: this.scoreBreakdown,
      lowLiquidity: this.lowLiquidity,
      crossExDiscrepancy: this.crossExDiscrepancy,
      ofi_1m: flow.ofi_1m,
      ofi_5m: flow.ofi_5m,
      ofi_15m: flow.ofi_15m,
      lastUpdate: Date.now(),
      booksStatus: {
        binance: this.books.binance.ready,
        bybit: this.books.bybit.ready,
        okx: this.books.okx.ready,
      },
    };
  }

  depthDetail() {
    return {
      symbol: this.symbol,
      binance: this.books.binance.getDepthLevels(20),
      bybit: this.books.bybit.getDepthLevels(20),
      okx: this.books.okx.getDepthLevels(20),
      walls: this.wallDetector.walls,
      price: this.price,
    };
  }
}
