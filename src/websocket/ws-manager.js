import { BinanceWS } from './binance-ws.js';
import { BybitWS } from './bybit-ws.js';
import { OKXWS } from './okx-ws.js';
import { HEALTH_CHECK_INTERVAL_MS } from '../config/constants.js';

export class WebSocketManager {
  constructor(pairs, onDepth) {
    this.pairs = pairs;
    this.onDepth = onDepth;
    this.binance = null;
    this.bybit = null;
    this.okx = null;
    this.healthInterval = null;
    this.status = { binance: 'stopped', bybit: 'stopped', okx: 'stopped' };
  }

  start() {
    console.log('[ws-manager] Starting WebSocket connections for ' + this.pairs.length + ' pairs...');

    this.binance = new BinanceWS(this.pairs, this.onDepth);
    this.binance.start();
    this.status.binance = 'connecting';

    this.bybit = new BybitWS(this.pairs, this.onDepth);
    this.bybit.start();
    this.status.bybit = 'connecting';

    this.okx = new OKXWS(this.pairs, this.onDepth);
    this.okx.start();
    this.status.okx = 'connecting';

    // Health check
    this.healthInterval = setInterval(() => this._healthCheck(), HEALTH_CHECK_INTERVAL_MS);
  }

  _healthCheck() {
    this.status = {
      binance: this.binance?.connections?.some(ws => ws.readyState === 1) ? 'connected' : 'disconnected',
      bybit: this.bybit?.connections?.some(ws => ws.readyState === 1) ? 'connected' : 'disconnected',
      okx: this.okx?.ws?.readyState === 1 ? 'connected' : 'disconnected',
    };
  }

  getStatus() {
    return this.status;
  }

  stop() {
    clearInterval(this.healthInterval);
    if (this.binance) this.binance.stop();
    if (this.bybit) this.bybit.stop();
    if (this.okx) this.okx.stop();
  }
}
