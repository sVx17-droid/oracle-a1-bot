import WebSocket from 'ws';
import { WS, RECONNECT, BYBIT_TOPICS_PER_SUB, BYBIT_CONNS } from '../config/constants.js';

export class BybitWS {
  constructor(pairs, onDepth) {
    this.pairs = pairs;
    this.onDepth = onDepth;
    this.connections = [];
    this.retryMs = RECONNECT.initialDelayMs;
    this.seqMap = new Map(); // bybitTicker -> lastSeq
    this.pending = new Map(); // bybitTicker -> deltas queued before snapshot
  }

  start() {
    // Distribute pairs across BYBIT_CONNS connections
    const perConn = Math.ceil(this.pairs.length / BYBIT_CONNS);
    for (let i = 0; i < BYBIT_CONNS; i++) {
      const batch = this.pairs.slice(i * perConn, (i + 1) * perConn);
      if (batch.length > 0) this._connect(batch, i);
    }
  }

  _connect(batch, connIdx) {
    const ws = new WebSocket(WS.BYBIT);
    this.connections.push(ws);
    let subscribed = false;

    ws.on('open', () => {
      console.log('[bybit] WS #' + connIdx + ' connected (' + batch.length + ' pairs)');
      this.retryMs = RECONNECT.initialDelayMs;

      // Subscribe in batches of BYBIT_TOPICS_PER_SUB
      for (let i = 0; i < batch.length; i += BYBIT_TOPICS_PER_SUB) {
        const chunk = batch.slice(i, i + BYBIT_TOPICS_PER_SUB);
        const args = chunk.map(p => 'orderbook.200.' + p.bybit);
        ws.send(JSON.stringify({ op: 'subscribe', args }));
      }
      subscribed = true;

      // Ping every 20s
      this._pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
      }, 20000);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.op === 'pong') return;
        if (msg.topic && msg.topic.startsWith('orderbook.')) {
          this._handleDepth(msg);
        }
      } catch (e) { /* ignore */ }
    });

    ws.on('close', () => {
      clearInterval(this._pingInterval);
      console.log('[bybit] WS #' + connIdx + ' closed, reconnecting...');
      const delay = this.retryMs + Math.random() * RECONNECT.jitterMs;
      this.retryMs = Math.min(RECONNECT.maxDelayMs, this.retryMs * RECONNECT.backoffMultiplier);
      setTimeout(() => this._connect(batch, connIdx), delay);
    });

    ws.on('error', (e) => {
      console.error('[bybit] WS #' + connIdx + ' error:', e.message);
      ws.close();
    });
  }

  _handleDepth(msg) {
    const ticker = msg.topic.replace('orderbook.200.', '');
    const pair = this.pairs.find(p => p.bybit === ticker);
    if (!pair) return;

    if (msg.type === 'snapshot') {
      this.seqMap.set(ticker, msg.data.seq);
      // Flush pending deltas
      const pending = this.pending.get(ticker) || [];
      this.pending.delete(ticker);
      // Apply snapshot
      this.onDepth({
        exchange: 'bybit',
        symbol: pair.symbol,
        type: 'snapshot',
        bids: (msg.data.b || []).map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
        asks: (msg.data.a || []).map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
        seq: msg.data.seq,
      });
      // Apply pending deltas
      for (const delta of pending) {
        if (delta.seq > msg.data.seq) {
          this._applyDelta(pair, delta);
        }
      }
    } else if (msg.type === 'delta') {
      const lastSeq = this.seqMap.get(ticker);
      if (lastSeq === undefined) {
        // Snapshot not yet received, queue
        if (!this.pending.has(ticker)) this.pending.set(ticker, []);
        this.pending.get(ticker).push(msg.data);
      } else if (msg.data.seq > lastSeq) {
        this._applyDelta(pair, msg.data);
        this.seqMap.set(ticker, msg.data.seq);
      }
    }
  }

  _applyDelta(pair, data) {
    this.onDepth({
      exchange: 'bybit',
      symbol: pair.symbol,
      type: 'delta',
      bids: (data.b || []).map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
      asks: (data.a || []).map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
      seq: data.seq,
    });
  }

  stop() {
    this.connections.forEach(ws => { try { ws.close(); } catch(e) { } });
    this.connections = [];
  }
}
