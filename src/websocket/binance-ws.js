import WebSocket from 'ws';
import https from 'https';
import { WS, BINANCE_SNAPSHOT_LIMIT, RECONNECT, BINANCE_STREAMS_PER_CONN } from '../config/constants.js';

export class BinanceWS {
  constructor(pairs, onDepth) {
    this.pairs = pairs; // [{ binance, symbol, ... }]
    this.onDepth = onDepth;
    this.connections = [];
    this.state = new Map(); // binanceTicker -> { lastUpdateId, ready }
    this.retryMs = RECONNECT.initialDelayMs;
  }

  start() {
    // Split pairs into batches of BINANCE_STREAMS_PER_CONN
    const batches = [];
    for (let i = 0; i < this.pairs.length; i += BINANCE_STREAMS_PER_CONN) {
      batches.push(this.pairs.slice(i, i + BINANCE_STREAMS_PER_CONN));
    }
    batches.forEach((batch, idx) => this._connect(batch, idx));
  }

  _connect(batch, connIdx) {
    const streams = batch.map(p => p.binance + '@depth@100ms').join('/');
    const url = WS.BINANCE + '?streams=' + streams;

    const ws = new WebSocket(url);
    this.connections.push(ws);

    ws.on('open', () => {
      console.log('[binance] WS #' + connIdx + ' connected (' + batch.length + ' pairs)');
      this.retryMs = RECONNECT.initialDelayMs;
      // Fetch REST snapshots for all pairs in this batch
      batch.forEach(p => this._fetchSnapshot(p));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.stream && msg.data) {
          this._handleDepth(msg.data);
        }
      } catch (e) { /* ignore parse errors */ }
    });

    ws.on('close', () => {
      console.log('[binance] WS #' + connIdx + ' closed, reconnecting...');
      const delay = this.retryMs + Math.random() * RECONNECT.jitterMs;
      this.retryMs = Math.min(RECONNECT.maxDelayMs, this.retryMs * RECONNECT.backoffMultiplier);
      setTimeout(() => this._connect(batch, connIdx), delay);
    });

    ws.on('error', (e) => {
      console.error('[binance] WS #' + connIdx + ' error:', e.message);
      ws.close();
    });
  }

  _fetchSnapshot(pair) {
    const url = WS.BINANCE_REST_BASE + '/depth?symbol=' + pair.binance.toUpperCase() + '&limit=' + BINANCE_SNAPSHOT_LIMIT;
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.lastUpdateId) {
            const ticker = pair.binance;
            this.state.set(ticker, { lastUpdateId: data.lastUpdateId, ready: true });
            // Send as snapshot
            this.onDepth({
              exchange: 'binance',
              symbol: pair.symbol,
              type: 'snapshot',
              bids: (data.bids || []).map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
              asks: (data.asks || []).map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
              lastUpdateId: data.lastUpdateId,
            });
          }
        } catch (e) { /* ignore */ }
      });
    }).on('error', () => {
      setTimeout(() => this._fetchSnapshot(pair), 5000);
    });
  }

  _handleDepth(data) {
    const ticker = (data.s || '').toLowerCase();
    const pair = this.pairs.find(p => p.binance === ticker);
    if (!pair) return;

    const st = this.state.get(ticker);
    if (!st || !st.ready) return;

    // Validate sequence
    if (data.u <= st.lastUpdateId) return; // stale
    if (data.U > st.lastUpdateId + 1) {
      // Gap detected, re-fetch snapshot
      this.state.delete(ticker);
      this._fetchSnapshot(pair);
      return;
    }
    st.lastUpdateId = data.u;

    this.onDepth({
      exchange: 'binance',
      symbol: pair.symbol,
      type: 'delta',
      bids: (data.b || []).map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
      asks: (data.a || []).map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
      lastUpdateId: data.u,
    });
  }

  stop() {
    this.connections.forEach(ws => {
      try { ws.close(); } catch(e) { }
    });
    this.connections = [];
  }
}
