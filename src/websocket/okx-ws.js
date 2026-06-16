import WebSocket from 'ws';
import { WS, RECONNECT, OKX_CHANNEL_LIMIT } from '../config/constants.js';

export class OKXWS {
  constructor(pairs, onDepth) {
    this.pairs = pairs.slice(0, OKX_CHANNEL_LIMIT); // OKX max 480 channels
    this.onDepth = onDepth;
    this.ws = null;
    this.retryMs = RECONNECT.initialDelayMs;
    this.checksumMap = new Map(); // instId -> full order book for checksum
  }

  start() {
    if (this.pairs.length === 0) return;
    this._connect();
  }

  _connect() {
    this.ws = new WebSocket(WS.OKX);
    let subscribed = false;

    this.ws.on('open', () => {
      console.log('[okx] WS connected (' + this.pairs.length + ' pairs)');
      this.retryMs = RECONNECT.initialDelayMs;

      // Subscribe to all pairs
      const args = this.pairs.map(p => ({ channel: 'books', instId: p.okx }));
      this.ws.send(JSON.stringify({ op: 'subscribe', args }));
      subscribed = true;

      // Ping every 30s
      this._pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        }
      }, 30000);
    });

    this.ws.on('message', (data) => {
      try {
        const raw = data.toString();
        if (raw === 'pong') return;
        const msg = JSON.parse(raw);
        if (msg.arg && msg.arg.channel === 'books') {
          this._handleDepth(msg);
        }
      } catch (e) { /* ignore */ }
    });

    this.ws.on('close', () => {
      clearInterval(this._pingInterval);
      console.log('[okx] WS closed, reconnecting...');
      const delay = this.retryMs + Math.random() * RECONNECT.jitterMs;
      this.retryMs = Math.min(RECONNECT.maxDelayMs, this.retryMs * RECONNECT.backoffMultiplier);
      setTimeout(() => this._connect(), delay);
    });

    this.ws.on('error', (e) => {
      console.error('[okx] WS error:', e.message);
      if (this.ws) this.ws.close();
    });
  }

  _handleDepth(msg) {
    const instId = msg.arg.instId;
    const pair = this.pairs.find(p => p.okx === instId);
    if (!pair) return;

    if (msg.action === 'snapshot') {
      this.onDepth({
        exchange: 'okx',
        symbol: pair.symbol,
        type: 'snapshot',
        bids: (msg.data[0]?.bids || []).map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]), orders: parseInt(b[3]) || 0 })),
        asks: (msg.data[0]?.asks || []).map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]), orders: parseInt(a[3]) || 0 })),
        ts: msg.data[0]?.ts,
      });
      // Store for checksum validation
      this.checksumMap.set(instId, msg.data[0]);
    } else if (msg.action === 'update') {
      this.onDepth({
        exchange: 'okx',
        symbol: pair.symbol,
        type: 'delta',
        bids: (msg.data[0]?.bids || []).map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]), orders: parseInt(b[3]) || 0 })),
        asks: (msg.data[0]?.asks || []).map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]), orders: parseInt(a[3]) || 0 })),
        ts: msg.data[0]?.ts,
      });
    }
  }

  stop() {
    clearInterval(this._pingInterval);
    if (this.ws) {
      try { this.ws.close(); } catch(e) { }
      this.ws = null;
    }
  }
}
